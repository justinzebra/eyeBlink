export interface BlinkSettings {
  version: number;
  dayMode: { enabled: boolean; intervalMs: number; closeDurationMs: number; closedHoldMs: number; openDurationMs: number };
  nightMode: { manualEnabled: boolean; scheduleEnabled: boolean; startTime: string; endTime: string; weekdays: number[] };
  motor: { left: { openAngle: number; closeAngle: number | null }; right: { openAngle: number; closeAngle: number | null } };
}
export const defaultSettings: BlinkSettings = {
  version: 1,
  dayMode: { enabled: true, intervalMs: 600000, closeDurationMs: 500, closedHoldMs: 300, openDurationMs: 500 },
  nightMode: { manualEnabled: false, scheduleEnabled: false, startTime: '22:00', endTime: '07:00', weekdays: [1,2,3,4,5,6,0] },
  motor: { left: { openAngle: 0, closeAngle: null }, right: { openAngle: 0, closeAngle: null } },
};
export const clone = <T,>(value: T): T => structuredClone(value);
export function validateSettings(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') return ['設定必須是物件'];
  const s = value as BlinkSettings;
  if (s.version !== 1) errors.push('不支援的設定版本');
  const d = s.dayMode;
  if (!d || typeof d.enabled !== 'boolean') errors.push('日間模式格式不正確');
  else {
    for (const [key, min, max] of [['intervalMs',1000,86400000],['closeDurationMs',100,10000],['closedHoldMs',0,10000],['openDurationMs',100,10000]] as const) {
      if (!Number.isInteger(d[key]) || d[key] < min || d[key] > max) errors.push('日間時間超出模擬範圍或不是整數');
    }
    if (d.intervalMs < d.closeDurationMs + d.closedHoldMs + d.openDurationMs) errors.push('眨眼間隔不可短於完整眨眼時間');
  }
  const n = s.nightMode;
  if (!n || typeof n.manualEnabled !== 'boolean' || typeof n.scheduleEnabled !== 'boolean' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(n.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(n.endTime) || !Array.isArray(n.weekdays) || n.weekdays.some(x => !Number.isInteger(x) || x < 0 || x > 6) || new Set(n.weekdays).size !== n.weekdays.length) errors.push('夜間排程格式不正確');
  else if (n.scheduleEnabled && (n.startTime === n.endTime || n.weekdays.length === 0)) errors.push('排程需選擇星期，且開始與結束時間不可相同');
  for (const side of ['left','right'] as const) {
    const m = s.motor?.[side];
    if (!m || m.openAngle !== 0 || (m.closeAngle !== null && (!Number.isFinite(m.closeAngle) || m.closeAngle < 0 || m.closeAngle > 90))) errors.push('模型睜眼角度須為 0°，閉眼展示角度須為 0–90° 或未設定');
  }
  return [...new Set(errors)];
}
