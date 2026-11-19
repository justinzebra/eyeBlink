import { describe, expect, it } from 'vitest';
import {
  blinkDurationMs,
  cloneSettings,
  defaultSettings,
  settingsEqual,
  toggleWeekday,
} from './settings';
import { isValidSettings, validateSettings } from './validation';

describe('settings helpers', () => {
  it('預設設定已凍結，無法被意外修改', () => {
    expect(() => {
      defaultSettings.dayMode.intervalMs = 1;
    }).toThrow(TypeError);
  });

  it('cloneSettings 回傳可修改且互不影響的副本', () => {
    const copy = cloneSettings(defaultSettings);
    copy.dayMode.intervalMs = 1234;

    expect(defaultSettings.dayMode.intervalMs).toBe(5_000);
  });

  it('blinkDurationMs 為閉眼、停留、睜眼的總和', () => {
    expect(blinkDurationMs(defaultSettings.dayMode)).toBe(1300);
  });

  it('toggleWeekday 新增或移除星期並保持排序，不修改原陣列', () => {
    const weekdays = Object.freeze([1, 3]);

    expect(toggleWeekday(weekdays, 0)).toEqual([0, 1, 3]);
    expect(toggleWeekday(weekdays, 3)).toEqual([1]);
  });

  it('settingsEqual 以內容比較，星期順序不影響結果', () => {
    const reordered = cloneSettings(defaultSettings);
    reordered.nightMode.weekdays = [6, 5, 4, 3, 2, 1, 0];
    const changed = cloneSettings(defaultSettings);
    changed.motor.left.closeAngle = 30;

    expect(settingsEqual(defaultSettings, reordered)).toBe(true);
    expect(settingsEqual(defaultSettings, changed)).toBe(false);
  });

  it('settingsEqual 不會把 NaN 當成未設定', () => {
    const invalid = cloneSettings(defaultSettings);
    invalid.motor.left.closeAngle = Number.NaN;

    expect(settingsEqual(defaultSettings, invalid)).toBe(false);
  });
});

describe('validateSettings', () => {
  it('預設設定有效', () => {
    expect(validateSettings(defaultSettings)).toEqual([]);
    expect(isValidSettings(defaultSettings)).toBe(true);
  });

  it.each([null, undefined, 'text', 42, []])('拒絕非物件輸入 %j', (input) => {
    expect(validateSettings(input)).toEqual(['設定必須是物件']);
  });

  it('缺少區塊時逐一回報，不會丟出例外', () => {
    const errors = validateSettings({ version: 99 });

    expect(errors).toContain('不支援的設定版本');
    expect(errors).toContain('日間模式格式不正確');
    expect(errors).toContain('夜間排程格式不正確');
    expect(errors.some((error) => error.includes('角度'))).toBe(true);
  });

  it('拒絕超出範圍、非整數或 NaN 的日間時間', () => {
    const outOfRange = cloneSettings(defaultSettings);
    outOfRange.dayMode.closeDurationMs = 50;
    const notNumber = cloneSettings(defaultSettings);
    notNumber.dayMode.closedHoldMs = Number.NaN;

    expect(validateSettings(outOfRange)).toContain('日間時間超出模擬範圍或不是整數');
    expect(validateSettings(notNumber)).toContain('日間時間超出模擬範圍或不是整數');
  });

  it('接受短於完整眨眼時間的間隔，因為間隔從眨完起算', () => {
    const settings = cloneSettings(defaultSettings);
    settings.dayMode.intervalMs = 1000;

    expect(validateSettings(settings)).toEqual([]);
  });

  it('拒絕錯誤的時間格式、星期與重複星期', () => {
    const badTime = cloneSettings(defaultSettings);
    badTime.nightMode.startTime = '25:00';
    const badDay = cloneSettings(defaultSettings);
    badDay.nightMode.weekdays = [7];
    const duplicate = cloneSettings(defaultSettings);
    duplicate.nightMode.weekdays = [1, 1];

    for (const settings of [badTime, badDay, duplicate]) {
      expect(validateSettings(settings)).toEqual(['夜間排程格式不正確']);
    }
  });

  it('啟用排程時必須選擇星期且起迄不同', () => {
    const noDays = cloneSettings(defaultSettings);
    noDays.nightMode = { ...noDays.nightMode, scheduleEnabled: true, weekdays: [] };
    const sameTime = cloneSettings(defaultSettings);
    sameTime.nightMode = { ...sameTime.nightMode, scheduleEnabled: true, endTime: '22:00' };

    expect(validateSettings(noDays)).toEqual(['排程需選擇星期，且開始與結束時間不可相同']);
    expect(validateSettings(sameTime)).toEqual(['排程需選擇星期，且開始與結束時間不可相同']);
  });

  it('角度須在展示範圍內，睜眼角度固定為 0', () => {
    const tooLarge = cloneSettings(defaultSettings);
    tooLarge.motor.left.closeAngle = 180;
    const openMoved = cloneSettings(defaultSettings);
    openMoved.motor.right.openAngle = 5;
    const valid = cloneSettings(defaultSettings);
    valid.motor.left.closeAngle = 90;

    expect(validateSettings(tooLarge)).toHaveLength(1);
    expect(validateSettings(openMoved)).toHaveLength(1);
    expect(validateSettings(valid)).toEqual([]);
  });
});
