import type { NightModeSettings } from './settings';

const DAYS_PER_WEEK = 7;
/** 往前一天（涵蓋跨日中的時段）到往後八天（涵蓋每週只選一天的情況）。 */
const SEARCH_OFFSETS_DAYS = { from: -1, to: 8 };

function parseTime(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(':').map(Number);
  return { hours, minutes };
}

function toMinutes(time: string): number {
  const { hours, minutes } = parseTime(time);
  return hours * 60 + minutes;
}

/**
 * 目前是否落在夜間排程內（含開始、不含結束）。
 * 星期以排程「開始日」為準：週一 22:00 至週二 07:00 屬於週一。
 */
export function isScheduleActive(night: NightModeSettings, now: Date): boolean {
  if (!night.scheduleEnabled) return false;

  const start = toMinutes(night.startTime);
  const end = toMinutes(night.endTime);
  if (start === end) return false;

  const minutes = now.getHours() * 60 + now.getMinutes();
  const today = now.getDay();
  const startsToday = night.weekdays.includes(today);
  if (start < end) return startsToday && minutes >= start && minutes < end;

  const yesterday = (today + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  const startedYesterday = night.weekdays.includes(yesterday);
  return (startsToday && minutes >= start) || (startedYesterday && minutes < end);
}

/** 下一個排程切換點（開始或結束）的 ISO 時間；未啟用排程時為 `null`。 */
export function nextScheduleBoundary(night: NightModeSettings, now: Date): string | null {
  if (!night.scheduleEnabled) return null;

  const startTime = parseTime(night.startTime);
  const endTime = parseTime(night.endTime);
  const boundaries: number[] = [];

  for (let offset = SEARCH_OFFSETS_DAYS.from; offset <= SEARCH_OFFSETS_DAYS.to; offset++) {
    const start = new Date(now);
    start.setDate(start.getDate() + offset);
    if (!night.weekdays.includes(start.getDay())) continue;

    start.setHours(startTime.hours, startTime.minutes, 0, 0);
    const end = new Date(start);
    end.setHours(endTime.hours, endTime.minutes, 0, 0);
    if (end <= start) end.setDate(end.getDate() + 1);
    boundaries.push(start.getTime(), end.getTime());
  }

  const upcoming = boundaries.filter((time) => time > now.getTime());
  return upcoming.length > 0 ? new Date(Math.min(...upcoming)).toISOString() : null;
}
