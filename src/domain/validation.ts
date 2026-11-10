import { MOTOR_SIDES, OPEN_ANGLE, SETTINGS_VERSION, type BlinkSettings } from './settings';

export interface Range {
  min: number;
  max: number;
}

/**
 * 模擬階段的展示範圍，表單與設備儲存邊界共用同一份。
 * 這些不是人體安全範圍；真實限制必須由韌體端決定。
 */
export const DAY_LIMITS = {
  intervalMs: { min: 1_000, max: 86_400_000 },
  closeDurationMs: { min: 100, max: 10_000 },
  closedHoldMs: { min: 0, max: 10_000 },
  openDurationMs: { min: 100, max: 10_000 },
} as const satisfies Record<string, Range>;

export const CLOSE_ANGLE_LIMITS: Range = { min: 0, max: 90 };

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAY_RANGE: Range = { min: 0, max: 6 };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIntegerInRange(value: unknown, { min, max }: Range): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

function validateDayMode(day: unknown): string[] {
  if (!isRecord(day) || typeof day.enabled !== 'boolean') return ['日間模式格式不正確'];

  const errors: string[] = [];
  const timings = Object.entries(DAY_LIMITS).map(([key, range]) =>
    isIntegerInRange(day[key], range) ? day[key] : null,
  );
  if (timings.includes(null)) errors.push('日間時間超出模擬範圍或不是整數');

  const { intervalMs, closeDurationMs, closedHoldMs, openDurationMs } = day;
  const total = Number(closeDurationMs) + Number(closedHoldMs) + Number(openDurationMs);
  if (Number(intervalMs) < total) errors.push('眨眼間隔不可短於完整眨眼時間');
  return errors;
}

function validateNightMode(night: unknown): string[] {
  const formatError = ['夜間排程格式不正確'];
  if (!isRecord(night)) return formatError;

  const { scheduleEnabled, startTime, endTime, weekdays } = night;
  if (typeof scheduleEnabled !== 'boolean') return formatError;
  if (!isTime(startTime) || !isTime(endTime) || !Array.isArray(weekdays)) return formatError;

  const hasInvalidDay = weekdays.some((day) => !isIntegerInRange(day, WEEKDAY_RANGE));
  const hasDuplicate = new Set(weekdays).size !== weekdays.length;
  if (hasInvalidDay || hasDuplicate) return formatError;

  if (scheduleEnabled && (startTime === endTime || weekdays.length === 0)) {
    return ['排程需選擇星期，且開始與結束時間不可相同'];
  }
  return [];
}

function isValidCloseAngle(angle: unknown): boolean {
  if (angle === null) return true;
  const { min, max } = CLOSE_ANGLE_LIMITS;
  // 限整數：實體設備以整數度數儲存角度，模擬設備採用相同規則以免行為不一致。
  return typeof angle === 'number' && Number.isInteger(angle) && angle >= min && angle <= max;
}

function validateMotor(motor: unknown): string[] {
  const isValid =
    isRecord(motor) &&
    MOTOR_SIDES.every((side) => {
      const sideSettings = motor[side];
      return (
        isRecord(sideSettings) &&
        sideSettings.openAngle === OPEN_ANGLE &&
        isValidCloseAngle(sideSettings.closeAngle)
      );
    });
  return isValid ? [] : ['模型睜眼角度須為 0°，閉眼角度須為 0–90° 的整數或未設定'];
}

/** 回傳所有錯誤訊息；空陣列代表設定有效。可用於任何不受信任的輸入。 */
export function validateSettings(value: unknown): string[] {
  if (!isRecord(value)) return ['設定必須是物件'];
  const errors = [
    ...(value.version === SETTINGS_VERSION ? [] : ['不支援的設定版本']),
    ...validateDayMode(value.dayMode),
    ...validateNightMode(value.nightMode),
    ...validateMotor(value.motor),
  ];
  return [...new Set(errors)];
}

export function isValidSettings(value: unknown): value is BlinkSettings {
  return validateSettings(value).length === 0;
}
