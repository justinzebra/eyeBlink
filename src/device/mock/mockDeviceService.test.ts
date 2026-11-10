import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloneSettings, defaultSettings, type BlinkSettings } from '../../domain/settings';
import { MemoryStorage } from '../../test/memoryStorage';
import { DEFAULT_DEVICE_NAME } from '../deviceName';
import type { DeviceLock } from './deviceLock';
import { STORAGE_KEY, createStorageRepository } from './deviceRepository';
import { MockDeviceService } from './mockDeviceService';

const SAVE_DELAY_MS = 350;

function createDevice(storage: Storage = new MemoryStorage(), lock?: DeviceLock) {
  return new MockDeviceService({ repository: createStorageRepository(() => storage), lock });
}

async function save(device: MockDeviceService, settings: BlinkSettings) {
  const pending = device.saveSettings(settings);
  await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
  await pending;
}

function withSettings(update: (settings: BlinkSettings) => void): BlinkSettings {
  const settings = cloneSettings(defaultSettings);
  update(settings);
  return settings;
}

const mondayNightSchedule = () =>
  withSettings((settings) => {
    settings.nightMode = {
      scheduleEnabled: true,
      startTime: '22:00',
      endTime: '07:00',
      weekdays: [1],
    };
  });

describe('MockDeviceService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T12:00:00')); // 星期一中午
  });
  afterEach(() => vi.useRealTimers());

  describe('連線', () => {
    it('未連線時拒絕所有讀寫與動作', async () => {
      const device = createDevice();

      await expect(device.readSettings()).rejects.toThrow('未連線');
      await expect(device.saveSettings(defaultSettings)).rejects.toThrow('未連線');
      await expect(device.applySettings()).rejects.toThrow('未連線');
      await expect(device.simulateBlink()).rejects.toThrow('未連線');
      await expect(device.setManualNight(true)).rejects.toThrow('未連線');
      await expect(device.rename('新名稱')).rejects.toThrow('未連線');
      await expect(device.restart()).rejects.toThrow('未連線');
      expect(() => device.setSimulationTime(new Date())).toThrow('未連線');
    });

    it('第一次連線前模型保持睜眼且沒有眨眼排程', () => {
      const { status } = createDevice().snapshot();

      expect(status.connected).toBe(false);
      expect(status.phase).toBe('open');
      expect(status.nextBlink).toBeNull();
    });

    it('儲存資料損壞時連線失敗，不會假裝成功', async () => {
      const storage = new MemoryStorage();
      storage.setItem(STORAGE_KEY, JSON.stringify({ settings: { version: 99 } }));
      const device = createDevice(storage);

      await expect(device.connect()).rejects.toThrow('損壞');
      expect(device.snapshot().status.connected).toBe(false);
    });

    it('儲存資料不是 JSON 時回報無法解析', async () => {
      const storage = new MemoryStorage();
      storage.setItem(STORAGE_KEY, '{not json');

      await expect(createDevice(storage).connect()).rejects.toThrow('無法解析');
    });

    it('瀏覽器禁止存取儲存區時回報可理解的錯誤', async () => {
      const device = new MockDeviceService({
        repository: createStorageRepository(() => {
          throw new DOMException('denied', 'SecurityError');
        }),
      });

      await expect(device.connect()).rejects.toThrow('無法讀取模擬設備儲存區');
    });

    it('通知訂閱者，取消訂閱後不再通知', async () => {
      const device = createDevice();
      const listener = vi.fn();

      const unsubscribe = device.subscribe(listener);
      await device.connect();
      unsubscribe();
      device.tick();

      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener.mock.lastCall?.[0].status.connected).toBe(true);
    });
  });

  describe('跨分頁互斥', () => {
    const lockHeldElsewhere: DeviceLock = { acquire: async () => false, release: vi.fn() };

    it('另一個分頁已連線時拒絕連線', async () => {
      const device = createDevice(new MemoryStorage(), lockHeldElsewhere);

      await expect(device.connect()).rejects.toThrow('另一個分頁');
      expect(device.snapshot().status.connected).toBe(false);
    });

    it('中斷連線時釋放鎖，連線失敗時也不會佔用鎖', async () => {
      const lock: DeviceLock = { acquire: vi.fn(async () => true), release: vi.fn() };
      const storage = new MemoryStorage();
      const device = createDevice(storage, lock);

      await device.connect();
      await device.disconnect();
      expect(lock.release).toHaveBeenCalledTimes(1);

      storage.setItem(STORAGE_KEY, '{broken');
      await expect(device.connect()).rejects.toThrow();
      expect(lock.release).toHaveBeenCalledTimes(2);
    });
  });

  describe('儲存與套用', () => {
    it('儲存不會改變執行中的設定，套用後才生效', async () => {
      const device = createDevice();
      await device.connect();

      await save(
        device,
        withSettings((s) => {
          s.dayMode.intervalMs = 120_000;
        }),
      );
      expect(device.snapshot().active.dayMode.intervalMs).toBe(600_000);

      await device.applySettings();
      expect(device.snapshot().active.dayMode.intervalMs).toBe(120_000);
    });

    it('重新啟動捨棄未儲存的執行狀態，並載入持久化設定', async () => {
      const storage = new MemoryStorage();
      const device = createDevice(storage);
      await device.connect();
      await save(
        device,
        withSettings((s) => {
          s.dayMode.intervalMs = 120_000;
        }),
      );
      await device.setManualNight(true);
      expect(device.snapshot().status.mode).toBe('night');

      await device.restart();

      expect(device.snapshot().status.mode).toBe('day');
      expect(device.snapshot().active.dayMode.intervalMs).toBe(120_000);
      const another = createDevice(storage);
      await another.connect();
      expect((await another.readSettings()).dayMode.intervalMs).toBe(120_000);
    });

    it('拒絕無效設定', async () => {
      const device = createDevice();
      await device.connect();
      const invalid = withSettings((s) => {
        s.dayMode.intervalMs = 1000;
      });

      await expect(device.saveSettings(invalid)).rejects.toThrow('眨眼間隔');
    });

    it('寫入失敗時回報錯誤，且不覆蓋已儲存的值', async () => {
      const storage = new MemoryStorage();
      const device = createDevice(storage);
      await device.connect();
      vi.spyOn(storage, 'setItem').mockImplementation(() => {
        throw new Error('quota');
      });

      const pending = device.saveSettings(
        withSettings((s) => {
          s.dayMode.intervalMs = 120_000;
        }),
      );
      const assertion = expect(pending).rejects.toThrow('空間不足');
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
      await assertion;

      expect(storage.getItem(STORAGE_KEY)).toBeNull();
      expect((await device.readSettings()).dayMode.intervalMs).toBe(600_000);
    });

    it('儲存途中斷線時不寫入', async () => {
      const storage = new MemoryStorage();
      const device = createDevice(storage);
      await device.connect();

      const pending = device.saveSettings(defaultSettings);
      const assertion = expect(pending).rejects.toThrow('未連線');
      await device.disconnect();
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
      await assertion;

      expect(storage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('回傳的設定是副本，修改它不影響設備', async () => {
      const device = createDevice();
      await device.connect();

      const settings = await device.readSettings();
      settings.dayMode.intervalMs = 1;

      expect((await device.readSettings()).dayMode.intervalMs).toBe(600_000);
    });
  });

  describe('眨眼動作', () => {
    it('完整眨眼依序閉眼、停留、睜眼，左右角度各自回到零', async () => {
      const device = createDevice();
      await device.connect();
      await save(
        device,
        withSettings((s) => {
          s.motor.left.closeAngle = 30;
          s.motor.right.closeAngle = 40;
        }),
      );
      await device.applySettings();

      await device.simulateBlink();
      await vi.advanceTimersByTimeAsync(250);
      expect(device.snapshot().status.leftAngle).toBe(15);
      expect(device.snapshot().status.rightAngle).toBe(20);
      await vi.advanceTimersByTimeAsync(250);
      expect(device.snapshot().status.phase).toBe('hold');
      await vi.advanceTimersByTimeAsync(300);
      expect(device.snapshot().status.phase).toBe('opening');
      await vi.advanceTimersByTimeAsync(500);
      expect(device.snapshot().status.phase).toBe('open');
      expect(device.snapshot().status.rightAngle).toBe(0);
    });

    it('未設定參考角度時角度為 null', async () => {
      const device = createDevice();
      await device.connect();

      expect(device.snapshot().status.leftAngle).toBeNull();
    });

    it('眨眼進行中不可重複觸發', async () => {
      const device = createDevice();
      await device.connect();
      await device.simulateBlink();

      await expect(device.simulateBlink()).rejects.toThrow('進行中');
    });

    it('自動眨眼以開始到開始計算間隔', async () => {
      const device = createDevice();
      await device.connect();

      await vi.advanceTimersByTimeAsync(600_000);
      expect(device.snapshot().status.phase).toBe('closing');
      await vi.advanceTimersByTimeAsync(1300);
      expect(device.snapshot().status.phase).toBe('open');
      await vi.advanceTimersByTimeAsync(598_700);
      expect(device.snapshot().status.phase).toBe('closing');
    });

    it('停用日間模式後不自動眨眼並進入待機', async () => {
      const device = createDevice();
      await device.connect();
      await save(
        device,
        withSettings((s) => {
          s.dayMode.enabled = false;
        }),
      );
      await device.applySettings();

      await vi.advanceTimersByTimeAsync(600_000);

      expect(device.snapshot().status.phase).toBe('open');
      expect(device.snapshot().status.mode).toBe('idle');
      expect(device.snapshot().status.nextBlink).toBeNull();
    });
  });

  describe('夜間模式', () => {
    it('手動夜間不會寫入設定，儲存或套用也不會改變它', async () => {
      const storage = new MemoryStorage();
      const device = createDevice(storage);
      await device.connect();
      await device.setManualNight(true);

      await save(device, mondayNightSchedule());
      await device.applySettings();

      expect(device.snapshot().status.source).toBe('manual');
      expect(storage.getItem(STORAGE_KEY)).not.toContain('manual');
      const another = createDevice(storage);
      await another.connect();
      expect(another.snapshot().status.mode).toBe('day');
    });

    it('舊版儲存資料中的 manualEnabled 會被忽略並在下次儲存時清除', async () => {
      const storage = new MemoryStorage();
      const legacy = {
        ...mondayNightSchedule(),
        nightMode: {
          ...mondayNightSchedule().nightMode,
          scheduleEnabled: false,
          manualEnabled: true,
        },
      };
      storage.setItem(STORAGE_KEY, JSON.stringify({ settings: legacy, name: '舊設備' }));
      const device = createDevice(storage);

      await device.connect();

      expect(device.snapshot().status.mode).toBe('day');
      expect(await device.readSettings()).not.toHaveProperty('nightMode.manualEnabled');
      await save(device, await device.readSettings());
      expect(storage.getItem(STORAGE_KEY)).not.toContain('manualEnabled');
    });

    it('手動夜間保持閉眼並拒絕模擬眨眼', async () => {
      const device = createDevice();
      await device.connect();

      await device.setManualNight(true);

      expect(device.snapshot().status).toMatchObject({
        mode: 'night',
        source: 'manual',
        phase: 'hold',
        progress: 1,
      });
      await expect(device.simulateBlink()).rejects.toThrow('解除夜間模式');
    });

    it('手動優先於排程；解除後仍在排程內則繼續夜間，排程結束返回日間', async () => {
      const device = createDevice();
      await device.connect();
      await save(device, mondayNightSchedule());
      await device.applySettings();

      await device.setManualNight(true);
      expect(device.snapshot().status.source).toBe('manual');

      device.setSimulationTime(new Date('2026-11-10T03:00:00'));
      await device.setManualNight(false);
      expect(device.snapshot().status).toMatchObject({ source: 'schedule', mode: 'night' });

      device.setSimulationTime(new Date('2026-11-10T07:00:00'));
      expect(device.snapshot().status.mode).toBe('day');
    });

    it('夜間結束後從那一刻起算一個完整間隔才眨眼', async () => {
      const device = createDevice();
      await device.connect();
      await device.setManualNight(true);
      await vi.advanceTimersByTimeAsync(900_000);

      await device.setManualNight(false);
      await vi.advanceTimersByTimeAsync(599_999);
      expect(device.snapshot().status.phase).toBe('open');
      await vi.advanceTimersByTimeAsync(1);
      expect(device.snapshot().status.phase).toBe('closing');
    });

    it('恢復實際時間後回到真實時鐘', async () => {
      const device = createDevice();
      await device.connect();
      device.setSimulationTime(new Date('2030-01-01T00:00:00'));

      device.setSimulationTime(null);

      expect(device.snapshot().status.now).toBe(new Date('2026-11-09T12:00:00').toISOString());
    });

    it('拒絕無效的模擬時間', async () => {
      const device = createDevice();
      await device.connect();

      expect(() => device.setSimulationTime(new Date('invalid'))).toThrow('有效的模擬時間');
    });
  });

  describe('設備名稱', () => {
    it('改名後持久化，重新連線仍讀得到', async () => {
      const storage = new MemoryStorage();
      const device = createDevice(storage);
      await device.connect();

      await device.rename('  床邊設備  ');

      expect(device.snapshot().status.name).toBe('床邊設備');
      const another = createDevice(storage);
      await another.connect();
      expect(another.snapshot().status.name).toBe('床邊設備');
    });

    it('拒絕空白或過長的名稱', async () => {
      const device = createDevice();
      await device.connect();

      await expect(device.rename('   ')).rejects.toThrow('1 至 30');
      await expect(device.rename('字'.repeat(31))).rejects.toThrow('1 至 30');
    });

    it('儲存資料被清除後重新啟動，名稱回到預設值', async () => {
      const storage = new MemoryStorage();
      const device = createDevice(storage);
      await device.connect();
      await device.rename('床邊設備');
      storage.clear();

      await device.restart();

      expect(device.snapshot().status.name).toBe(DEFAULT_DEVICE_NAME);
    });

    it('名稱寫入失敗時保留原名稱', async () => {
      const storage = new MemoryStorage();
      const device = createDevice(storage);
      await device.connect();
      vi.spyOn(storage, 'setItem').mockImplementation(() => {
        throw new Error('quota');
      });

      await expect(device.rename('床邊設備')).rejects.toThrow('設備名稱儲存失敗');
      expect(device.snapshot().status.name).toBe(DEFAULT_DEVICE_NAME);
    });
  });
});
