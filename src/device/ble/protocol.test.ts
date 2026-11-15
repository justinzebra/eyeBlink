import { describe, expect, it } from 'vitest';
import { cloneSettings, defaultSettings } from '../../domain/settings';
import {
  Opcode,
  ResultCode,
  decodeResult,
  decodeSettings,
  decodeStatus,
  encodeCommand,
  encodeSettings,
  encodeTimePayload,
  fromLocalEpochSeconds,
  resultMessage,
  toLocalEpochSeconds,
} from './protocol';

const view = (bytes: number[]) => new DataView(Uint8Array.from(bytes).buffer);

// 這組位元組同時寫在 docs/ble-protocol.md，是前端與韌體共同的對照基準。
const DEFAULT_SETTINGS_BYTES = [
  0x01, 0x01, 0x88, 0x13, 0x00, 0x00, 0xf4, 0x01, 0x2c, 0x01, 0xf4, 0x01, 0x28, 0x05, 0xa4, 0x01,
  0x7f, 0xff, 0xff, 0x00,
];

describe('設定編解碼', () => {
  it('預設設定編碼成協議文件中的基準位元組', () => {
    expect([...encodeSettings(defaultSettings)]).toEqual(DEFAULT_SETTINGS_BYTES);
  });

  it('基準位元組解碼回預設設定', () => {
    expect(decodeSettings(view(DEFAULT_SETTINGS_BYTES))).toEqual(cloneSettings(defaultSettings));
  });

  it('排程、星期與角度可以來回轉換', () => {
    const settings = cloneSettings(defaultSettings);
    settings.dayMode = { ...settings.dayMode, enabled: false, intervalMs: 10_000 };
    settings.nightMode = {
      scheduleEnabled: true,
      startTime: '23:59',
      endTime: '00:05',
      weekdays: [0, 3, 6],
    };
    settings.motor.left.closeAngle = 0;
    settings.motor.right.closeAngle = 90;

    const decoded = decodeSettings(new DataView(encodeSettings(settings).buffer));

    expect(decoded).toEqual(settings);
  });

  it('拒絕長度不對或版本不支援的資料', () => {
    expect(() => decodeSettings(view([1, 2, 3]))).toThrow('長度不正確');
    expect(() => decodeSettings(view([9, ...DEFAULT_SETTINGS_BYTES.slice(1)]))).toThrow(
      '不支援的設定版本',
    );
  });
});

describe('狀態解碼', () => {
  // flags = 0x61：mode day(1) | source day(0) | phase hold(2<<4) | 已對時(0x40)
  const status = [1, 1, 0, 0x61, 0xff, 30, 0xff, 0, 0, 0, 0, 0, 0xe8, 0x03, 0, 0];

  it('解出模式、階段、進度與角度', () => {
    const decoded = decodeStatus(view(status));

    expect(decoded).toMatchObject({
      protocolVersion: 1,
      firmwareVersion: '1.0',
      mode: 'day',
      source: 'day',
      phase: 'hold',
      progress: 1,
      leftAngle: 30,
      rightAngle: null,
      msUntilNextBlink: 1000,
    });
  });

  it('夜間手動、未對時、沒有下次眨眼', () => {
    // flags = 0x2A：mode night(2) | source manual(2<<2) | phase hold(2<<4)
    const night = [1, 1, 2, 0x2a, 0xff, 0xff, 0xff, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff];

    const decoded = decodeStatus(view(night));

    expect(decoded).toMatchObject({ mode: 'night', source: 'manual', firmwareVersion: '1.2' });
    expect(decoded.deviceTime).toBeNull();
    expect(decoded.msUntilNextBlink).toBeNull();
  });

  it('拒絕長度不對的封包', () => {
    expect(() => decodeStatus(view([1, 2]))).toThrow('長度不正確');
  });
});

describe('指令與結果', () => {
  it('指令為 seq、opcode 加上 payload', () => {
    expect([...encodeCommand(7, Opcode.setManualNight, Uint8Array.of(1))]).toEqual([7, 0x03, 1]);
    expect([...encodeCommand(8, Opcode.blinkNow)]).toEqual([8, 0x04]);
  });

  it('解出結果封包', () => {
    expect(decodeResult(view([7, 3, 0, 0]))).toEqual({ seq: 7, opcode: 3, code: 0, detail: 0 });
  });

  it('把錯誤碼轉成看得懂的訊息', () => {
    const base = { seq: 1, opcode: 1 };

    expect(resultMessage({ ...base, code: ResultCode.invalidSettings, detail: 6 })).toContain(
      '角度超出設備允許的上限',
    );
    expect(resultMessage({ ...base, code: ResultCode.nightActive, detail: 0 })).toContain('夜間');
    expect(resultMessage({ ...base, code: 99, detail: 0 })).toContain('未知錯誤');
  });
});

describe('本地時間', () => {
  it('以牆上時鐘的時間換算秒數，可還原成同一時刻', () => {
    const date = new Date(2026, 10, 9, 22, 30, 15);

    const seconds = toLocalEpochSeconds(date);

    // 2026-11-09 是星期一；設備用同樣的算式得到星期與分鐘。
    expect(Math.floor(seconds / 86_400 + 4) % 7).toBe(1);
    expect(Math.floor((seconds % 86_400) / 60)).toBe(22 * 60 + 30);
    expect(fromLocalEpochSeconds(seconds).getTime()).toBe(date.getTime());
  });

  it('對時 payload 為 little-endian 的 32 位元秒數', () => {
    const date = new Date(2026, 10, 9, 12, 0, 0);

    const payload = encodeTimePayload(date);

    expect(new DataView(payload.buffer).getUint32(0, true)).toBe(toLocalEpochSeconds(date));
  });
});
