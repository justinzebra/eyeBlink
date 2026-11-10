import { describe, expect, it } from 'vitest';
import { isScheduleActive, nextScheduleBoundary } from './schedule';
import type { NightModeSettings } from './settings';

// 2026-11-09 是星期一。
const mondayNight: NightModeSettings = {
  scheduleEnabled: true,
  startTime: '22:00',
  endTime: '07:00',
  weekdays: [1],
};

describe('isScheduleActive', () => {
  it('跨日排程以開始日判定，包含開始、不包含結束', () => {
    expect(isScheduleActive(mondayNight, new Date('2026-11-09T21:59:59'))).toBe(false);
    expect(isScheduleActive(mondayNight, new Date('2026-11-09T22:00:00'))).toBe(true);
    expect(isScheduleActive(mondayNight, new Date('2026-11-10T06:59:59'))).toBe(true);
    expect(isScheduleActive(mondayNight, new Date('2026-11-10T07:00:00'))).toBe(false);
  });

  it('只選週一時，週二晚上不會啟動', () => {
    expect(isScheduleActive(mondayNight, new Date('2026-11-10T22:00:00'))).toBe(false);
  });

  it('同日排程只在開始與結束之間啟動', () => {
    const daytime = { ...mondayNight, startTime: '09:00', endTime: '17:00' };

    expect(isScheduleActive(daytime, new Date('2026-11-09T12:00:00'))).toBe(true);
    expect(isScheduleActive(daytime, new Date('2026-11-09T17:00:00'))).toBe(false);
  });

  it('週日開始的跨日排程延續到週一凌晨', () => {
    const sundayNight = { ...mondayNight, weekdays: [0] };

    expect(isScheduleActive(sundayNight, new Date('2026-11-09T02:00:00'))).toBe(true);
  });

  it('排程停用或開始等於結束時永遠不啟動', () => {
    const disabled = { ...mondayNight, scheduleEnabled: false };
    const zeroLength = { ...mondayNight, endTime: '22:00' };

    expect(isScheduleActive(disabled, new Date('2026-11-09T23:00:00'))).toBe(false);
    expect(isScheduleActive(zeroLength, new Date('2026-11-09T22:00:00'))).toBe(false);
  });
});

describe('nextScheduleBoundary', () => {
  it('排程進行中時回傳結束時間', () => {
    const boundary = nextScheduleBoundary(mondayNight, new Date('2026-11-10T03:00:00'));

    expect(boundary).toBe(new Date('2026-11-10T07:00:00').toISOString());
  });

  it('排程外回傳下一次開始時間，可跨到下一週', () => {
    const boundary = nextScheduleBoundary(mondayNight, new Date('2026-11-10T08:00:00'));

    expect(boundary).toBe(new Date('2026-11-16T22:00:00').toISOString());
  });

  it('排程停用或沒有選擇星期時回傳 null', () => {
    const now = new Date('2026-11-09T12:00:00');

    expect(nextScheduleBoundary({ ...mondayNight, scheduleEnabled: false }, now)).toBeNull();
    expect(nextScheduleBoundary({ ...mondayNight, weekdays: [] }, now)).toBeNull();
  });
});
