import type { BlinkSettings } from '../types/settings';
// 星期以排程開始日為準；週一 22:00 至週二 07:00 屬於週一。
export function scheduleActive(settings: BlinkSettings, now: Date): boolean {
  const n = settings.nightMode;
  if (!n.scheduleEnabled) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const toMinutes = (s: string) => Number(s.slice(0,2)) * 60 + Number(s.slice(3));
  const start = toMinutes(n.startTime), end = toMinutes(n.endTime);
  if (start === end) return false;
  if (start < end) return n.weekdays.includes(now.getDay()) && minutes >= start && minutes < end;
  return (minutes >= start && n.weekdays.includes(now.getDay())) || (minutes < end && n.weekdays.includes((now.getDay() + 6) % 7));
}
export function nextSchedule(settings: BlinkSettings, now: Date): string | null {
  if (!settings.nightMode.scheduleEnabled) return null;
  const dates: number[] = [];
  for (let offset = -1; offset <= 8; offset++) {
    const start = new Date(now); start.setDate(start.getDate() + offset);
    if (!settings.nightMode.weekdays.includes(start.getDay())) continue;
    const [h,m] = settings.nightMode.startTime.split(':').map(Number); start.setHours(h,m,0,0);
    const [eh,em] = settings.nightMode.endTime.split(':').map(Number);
    const end = new Date(start); end.setHours(eh,em,0,0);
    if (end <= start) end.setDate(end.getDate()+1);
    dates.push(+start,+end);
  }
  const future = dates.filter(t => t > +now).sort((a,b) => a-b);
  return future.length ? new Date(future[0]).toISOString() : null;
}
