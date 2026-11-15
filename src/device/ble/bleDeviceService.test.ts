import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloneSettings, defaultSettings, type BlinkSettings } from '../../domain/settings';
import { FakeEsp32 } from '../../test/fakeBluetooth';
import { BleDeviceService } from './bleDeviceService';
import { Opcode, ResultCode, encodeSettings, toLocalEpochSeconds } from './protocol';

const NOW = new Date(2026, 10, 9, 12, 0, 0);
const COMMAND_TIMEOUT_MS = 5000;

function withSettings(update: (settings: BlinkSettings) => void): BlinkSettings {
  const settings = cloneSettings(defaultSettings);
  update(settings);
  return settings;
}

function setup() {
  const esp32 = new FakeEsp32(encodeSettings(defaultSettings));
  const service = new BleDeviceService(esp32.bluetooth);
  const opcodes = () => esp32.commands.map((command) => command.opcode);
  return { esp32, service, opcodes };
}

describe('BleDeviceService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  describe('連線', () => {
    it('瀏覽器不支援 Web Bluetooth 時說明原因', async () => {
      const service = new BleDeviceService(undefined);

      await expect(service.connect()).rejects.toThrow('不支援 Web Bluetooth');
    });

    it('使用者取消選擇設備時回報已取消', async () => {
      const bluetooth = {
        requestDevice: async () => {
          throw new DOMException('cancelled', 'NotFoundError');
        },
      } as unknown as Bluetooth;

      await expect(new BleDeviceService(bluetooth).connect()).rejects.toThrow('連線已取消');
    });

    it('連線後對時，並讀回設備執行中的設定與狀態', async () => {
      const { esp32, service } = setup();
      esp32.setActive(
        encodeSettings(
          withSettings((s) => {
            s.motor.left.closeAngle = 30;
          }),
        ),
      );

      await service.connect();

      const [setTime] = esp32.commands;
      expect(setTime.opcode).toBe(Opcode.setTime);
      expect(new DataView(Uint8Array.from(setTime.payload).buffer).getUint32(0, true)).toBe(
        toLocalEpochSeconds(NOW),
      );
      const { status, active } = service.snapshot();
      expect(status).toMatchObject({
        connected: true,
        kind: 'ble',
        name: 'BlinkAssist',
        firmware: '韌體 1.0',
        mode: 'day',
      });
      expect(active.motor.left.closeAngle).toBe(30);
    });

    it('韌體協議版本不一致時拒絕連線', async () => {
      const { esp32, service } = setup();
      esp32.setStatus({ protocolVersion: 2 });

      await expect(service.connect()).rejects.toThrow('通訊協議版本');
      expect(service.snapshot().status.connected).toBe(false);
      expect(esp32.commands).toHaveLength(0);
    });

    it('初始同步失敗時，即使途中收到狀態通知也不會顯示為已連線', async () => {
      const { esp32, service } = setup();
      const listener = vi.fn();
      service.subscribe(listener);
      esp32.nextResult = { code: ResultCode.malformed };
      esp32.onCommand = () => esp32.notifyStatus({ flags: 0x51 });

      await expect(service.connect()).rejects.toThrow('設備無法解讀指令');

      const everConnected = listener.mock.calls.some(([snapshot]) => snapshot.status.connected);
      expect(everConnected).toBe(false);
      expect(service.snapshot().status.connected).toBe(false);
    });

    it('未連線時拒絕所有操作', async () => {
      const { service } = setup();

      await expect(service.readSettings()).rejects.toThrow('未連線');
      await expect(service.saveSettings(defaultSettings)).rejects.toThrow('未連線');
      await expect(service.applySettings()).rejects.toThrow('未連線');
      await expect(service.simulateBlink()).rejects.toThrow('未連線');
    });

    it('中斷後重新連線沿用同一台設備，不再跳出選擇視窗', async () => {
      const { esp32, service } = setup();
      const requestDevice = vi.spyOn(esp32.bluetooth, 'requestDevice');
      const reusable = new BleDeviceService({ requestDevice } as unknown as Bluetooth);
      requestDevice.mockResolvedValue(esp32.device);

      await reusable.connect();
      await reusable.disconnect();
      await reusable.connect();

      expect(requestDevice).toHaveBeenCalledTimes(1);
      expect(esp32.connectCount).toBe(2);
      expect(service.snapshot().status.connected).toBe(false);
    });

    it('設備意外斷線時標示為未連線並通知訂閱者', async () => {
      const { esp32, service } = setup();
      await service.connect();
      const listener = vi.fn();
      service.subscribe(listener);

      esp32.dropConnection();

      expect(service.snapshot().status.connected).toBe(false);
      expect(listener.mock.lastCall?.[0].status.connected).toBe(false);
    });
  });

  describe('設定', () => {
    it('讀取設備已儲存的設定', async () => {
      const { esp32, service } = setup();
      await service.connect();
      esp32.setSaved(
        encodeSettings(
          withSettings((s) => {
            s.dayMode.intervalMs = 8_000;
          }),
        ),
      );

      expect((await service.readSettings()).dayMode.intervalMs).toBe(8_000);
    });

    it('儲存時送出編碼後的設定，設備確認後才算成功', async () => {
      const { esp32, service } = setup();
      await service.connect();
      const settings = withSettings((s) => {
        s.motor.right.closeAngle = 45;
      });

      await service.saveSettings(settings);

      const save = esp32.commands.at(-1);
      expect(save?.opcode).toBe(Opcode.saveSettings);
      expect(save?.payload).toEqual([...encodeSettings(settings)]);
    });

    it('前端驗證不過的設定不會送到設備', async () => {
      const { service, opcodes } = setup();
      await service.connect();
      const invalid = withSettings((s) => {
        s.dayMode.intervalMs = 1000;
      });

      await expect(service.saveSettings(invalid)).rejects.toThrow('眨眼間隔');
      expect(opcodes()).not.toContain(Opcode.saveSettings);
    });

    it('設備拒絕設定時顯示設備給的原因', async () => {
      const { esp32, service } = setup();
      await service.connect();
      esp32.nextResult = { code: ResultCode.invalidSettings, detail: 6 };

      await expect(service.saveSettings(defaultSettings)).rejects.toThrow('角度超出設備允許的上限');
    });

    it('設備寫入儲存區失敗時回報失敗', async () => {
      const { esp32, service } = setup();
      await service.connect();
      esp32.nextResult = { code: ResultCode.storageFailed };

      await expect(service.saveSettings(defaultSettings)).rejects.toThrow('寫入儲存區失敗');
    });

    it('套用後重新讀回設備執行中的設定', async () => {
      const { esp32, service } = setup();
      await service.connect();
      esp32.setActive(
        encodeSettings(
          withSettings((s) => {
            s.dayMode.intervalMs = 8_000;
          }),
        ),
      );

      await service.applySettings();

      expect(esp32.commands.at(-1)?.opcode).toBe(Opcode.applySettings);
      expect(service.snapshot().active.dayMode.intervalMs).toBe(8_000);
    });

    it('設備回傳無效設定時不採用', async () => {
      const { esp32, service } = setup();
      await service.connect();
      const corrupted = encodeSettings(defaultSettings);
      corrupted[17] = 200; // 超出範圍的角度
      esp32.setSaved(corrupted);

      await expect(service.readSettings()).rejects.toThrow('設備回傳的設定無效');
    });
  });

  describe('指令', () => {
    it('手動夜間、眨眼與重新載入送出對應的指令', async () => {
      const { esp32, service, opcodes } = setup();
      await service.connect();

      await service.setManualNight(true);
      await service.simulateBlink();
      await service.restart();

      expect(opcodes().slice(1)).toEqual([Opcode.setManualNight, Opcode.blinkNow, Opcode.reload]);
      expect(esp32.commands[1].payload).toEqual([1]);
    });

    it('每個指令使用不同的序號', async () => {
      const { esp32, service } = setup();
      await service.connect();

      await service.simulateBlink();
      await service.simulateBlink();

      const seqs = esp32.commands.map((command) => command.seq);
      expect(new Set(seqs).size).toBe(seqs.length);
    });

    it('夜間模式中眨眼被設備拒絕', async () => {
      const { esp32, service } = setup();
      await service.connect();
      esp32.nextResult = { code: ResultCode.nightActive };

      await expect(service.simulateBlink()).rejects.toThrow('解除夜間模式');
    });

    it('設備沒有回應時逾時失敗，不會當成成功', async () => {
      const { esp32, service } = setup();
      await service.connect();
      esp32.nextResult = null;

      const pending = service.applySettings();
      const assertion = expect(pending).rejects.toThrow('設備沒有回應');
      await vi.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS);

      await assertion;
    });

    it('指令寫入失敗時以中文訊息回報失敗', async () => {
      const { esp32, service } = setup();
      await service.connect();
      esp32.failWrites = true;

      await expect(service.applySettings()).rejects.toThrow('指令傳送失敗');
    });

    it('等待回覆期間斷線，操作回報未完成', async () => {
      const { esp32, service } = setup();
      await service.connect();
      esp32.nextResult = null;

      const pending = service.saveSettings(defaultSettings);
      const assertion = expect(pending).rejects.toThrow('設備已斷線');
      await vi.advanceTimersByTimeAsync(0);
      esp32.dropConnection();

      await assertion;
    });
  });

  describe('狀態回報', () => {
    it('收到通知後更新姿態與角度並通知訂閱者', async () => {
      const { esp32, service } = setup();
      await service.connect();
      const listener = vi.fn();
      service.subscribe(listener);

      // flags 0x51：日間、閉眼中、已對時
      esp32.notifyStatus({ flags: 0x51, progress: 128, leftAngle: 15, rightAngle: 20 });

      const { status } = listener.mock.lastCall?.[0] ?? {};
      expect(status).toMatchObject({ phase: 'closing', leftAngle: 15, rightAngle: 20 });
      expect(status.progress).toBeCloseTo(0.5, 2);
    });

    it('下次眨眼時間不會因回報的些微抖動而跳動', async () => {
      const { esp32, service } = setup();
      await service.connect();
      const first = service.snapshot().status.nextBlink;

      esp32.notifyStatus({ msUntilNextBlink: 5_400 });
      expect(service.snapshot().status.nextBlink).toBe(first);

      esp32.notifyStatus({ msUntilNextBlink: 8_000 });
      expect(service.snapshot().status.nextBlink).not.toBe(first);
    });

    it('設備未對時時不顯示下次排程', async () => {
      const { esp32, service } = setup();
      esp32.setActive(
        encodeSettings(
          withSettings((s) => {
            s.nightMode.scheduleEnabled = true;
          }),
        ),
      );
      await service.connect();
      expect(service.snapshot().status.nextSchedule).not.toBeNull();

      esp32.notifyStatus({ flags: 0x01 });

      expect(service.snapshot().status.nextSchedule).toBeNull();
    });

    it('格式錯誤的狀態封包被丟棄，保留上一筆狀態', async () => {
      const { esp32, service } = setup();
      await service.connect();

      esp32.notifyStatus({ flags: 0x51 });
      const before = service.snapshot().status.phase;
      (
        esp32 as unknown as { characteristics: Record<string, { emit(b: number[]): void }> }
      ).characteristics['12345678-1234-1234-1234-123456789002'].emit([1, 2, 3]);

      expect(service.snapshot().status.phase).toBe(before);
    });
  });
});
