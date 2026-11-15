export const SETTINGS_VERSION = 1;
export const OPEN_ANGLE = 0;
export const MOTOR_SIDES = ['left', 'right'] as const;
export type MotorSide = (typeof MOTOR_SIDES)[number];

/** 時間單位一律為毫秒。 */
export interface DayModeSettings {
  enabled: boolean;
  /** 本次眨眼開始到下次眨眼開始的間隔。 */
  intervalMs: number;
  closeDurationMs: number;
  closedHoldMs: number;
  openDurationMs: number;
}

/** 只包含會儲存的自動排程；手動夜間是即時指令，不屬於設定。 */
export interface NightModeSettings {
  scheduleEnabled: boolean;
  /** `HH:mm`，24 小時制。 */
  startTime: string;
  endTime: string;
  /** 排程「開始日」，0（日）到 6（六）。 */
  weekdays: number[];
}

export interface MotorSideSettings {
  openAngle: number;
  /** `null` 代表尚未設定，避免把展示值誤當成校正值。 */
  closeAngle: number | null;
}

export type MotorSettings = Record<MotorSide, MotorSideSettings>;

export interface BlinkSettings {
  version: number;
  dayMode: DayModeSettings;
  nightMode: NightModeSettings;
  motor: MotorSettings;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export function createUnsetMotor(): MotorSettings {
  return {
    left: { openAngle: OPEN_ANGLE, closeAngle: null },
    right: { openAngle: OPEN_ANGLE, closeAngle: null },
  };
}

/** 已凍結；需要可修改的副本請用 `cloneSettings(defaultSettings)`。 */
export const defaultSettings: BlinkSettings = deepFreeze({
  version: SETTINGS_VERSION,
  dayMode: {
    enabled: true,
    intervalMs: 5_000,
    closeDurationMs: 500,
    closedHoldMs: 300,
    openDurationMs: 500,
  },
  nightMode: {
    scheduleEnabled: false,
    startTime: '22:00',
    endTime: '07:00',
    weekdays: [0, 1, 2, 3, 4, 5, 6],
  },
  motor: createUnsetMotor(),
});

/**
 * 回傳獨立的副本，且只保留已知欄位。
 * 舊版儲存資料中多餘的欄位（例如已移除的 `manualEnabled`）會在這裡被捨棄。
 */
export function cloneSettings(settings: BlinkSettings): BlinkSettings {
  const { version, dayMode: d, nightMode: n, motor: m } = settings;
  return {
    version,
    dayMode: {
      enabled: d.enabled,
      intervalMs: d.intervalMs,
      closeDurationMs: d.closeDurationMs,
      closedHoldMs: d.closedHoldMs,
      openDurationMs: d.openDurationMs,
    },
    nightMode: {
      scheduleEnabled: n.scheduleEnabled,
      startTime: n.startTime,
      endTime: n.endTime,
      weekdays: [...n.weekdays],
    },
    motor: {
      left: { openAngle: m.left.openAngle, closeAngle: m.left.closeAngle },
      right: { openAngle: m.right.openAngle, closeAngle: m.right.closeAngle },
    },
  };
}

/** 一次完整眨眼（閉眼 + 停留 + 睜眼）所需時間。 */
export function blinkDurationMs(day: DayModeSettings): number {
  return day.closeDurationMs + day.closedHoldMs + day.openDurationMs;
}

/** 切換某個星期的勾選狀態，回傳排序後的新陣列。 */
export function toggleWeekday(weekdays: readonly number[], day: number): number[] {
  const next = weekdays.includes(day) ? weekdays.filter((d) => d !== day) : [...weekdays, day];
  return next.sort((a, b) => a - b);
}

/** JSON 會把 NaN 與 Infinity 都寫成 null；改寫成字串，才不會和「未設定」混淆。 */
const keepNonFinite = (_key: string, value: unknown): unknown =>
  typeof value === 'number' && !Number.isFinite(value) ? String(value) : value;

function comparable(settings: BlinkSettings): string {
  const { version, dayMode: d, nightMode: n, motor: m } = settings;
  const fields = [
    version,
    [d.enabled, d.intervalMs, d.closeDurationMs, d.closedHoldMs, d.openDurationMs],
    [n.scheduleEnabled, n.startTime, n.endTime, [...n.weekdays].sort()],
    MOTOR_SIDES.map((side) => [m[side].openAngle, m[side].closeAngle]),
  ];
  return JSON.stringify(fields, keepNonFinite);
}

/** 以內容比較兩份設定；星期順序不影響結果。 */
export function settingsEqual(a: BlinkSettings, b: BlinkSettings): boolean {
  return a === b || comparable(a) === comparable(b);
}
