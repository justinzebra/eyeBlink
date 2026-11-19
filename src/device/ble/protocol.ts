import type { BlinkPhase } from '../../domain/blinkTimeline';
import { SETTINGS_VERSION, type BlinkSettings } from '../../domain/settings';
import type { DeviceMode, ModeSource } from '../types';

// 藍牙通訊協議的編解碼。純函式，不碰 Web Bluetooth。
// 必須與韌體 firmware/BlinkAssist/protocol.h、settings.cpp 以及
// docs/ble-protocol.md 保持一致；三者任何一處修改都要同步另外兩處。

export const PROTOCOL_VERSION = 2;

export const BLE_UUIDS = {
  service: '12345678-1234-1234-1234-123456789000',
  savedSettings: '12345678-1234-1234-1234-123456789001',
  status: '12345678-1234-1234-1234-123456789002',
  command: '12345678-1234-1234-1234-123456789003',
  result: '12345678-1234-1234-1234-123456789004',
  activeSettings: '12345678-1234-1234-1234-123456789005',
} as const;

export const SETTINGS_BLOB_SIZE = 20;
export const STATUS_SIZE = 16;
export const RESULT_SIZE = 4;

const ANGLE_UNSET = 0xff;
const NO_NEXT_BLINK = 0xffffffff;
const LITTLE_ENDIAN = true;
const MINUTES_PER_HOUR = 60;
const DAYS_PER_WEEK = 7;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;

const FLAG_DAY_ENABLED = 0x01;
const FLAG_SCHEDULE_ENABLED = 0x02;
const STATUS_FLAG_TIME_SYNCED = 0x40;

export const Opcode = {
  saveSettings: 0x01,
  applySettings: 0x02,
  setManualNight: 0x03,
  blinkNow: 0x04,
  reload: 0x05,
  setTime: 0x06,
} as const;
export type Opcode = (typeof Opcode)[keyof typeof Opcode];

export const ResultCode = {
  ok: 0,
  malformed: 1,
  unknownOpcode: 2,
  invalidSettings: 3,
  storageFailed: 4,
  nightActive: 5,
  blinkInProgress: 6,
} as const;

export interface CommandResult {
  seq: number;
  opcode: number;
  code: number;
  detail: number;
}

export interface BleStatus {
  protocolVersion: number;
  firmwareVersion: string;
  mode: DeviceMode;
  source: ModeSource;
  phase: BlinkPhase;
  /** 0 到 1。 */
  progress: number;
  leftAngle: number | null;
  rightAngle: number | null;
  /** 設備尚未對時時為 `null`。 */
  deviceTime: Date | null;
  msUntilNextBlink: number | null;
}

const MODES: readonly DeviceMode[] = ['idle', 'day', 'night'];
const SOURCES: readonly ModeSource[] = ['day', 'schedule', 'manual'];
const PHASES: readonly BlinkPhase[] = ['open', 'closing', 'hold', 'opening'];

/** 韌體回報 `invalidSettings` 時的 detail 對照。 */
const SETTINGS_ERRORS: Record<number, string> = {
  1: '不支援的設定版本',
  2: '日間時間超出設備允許範圍',
  4: '夜間排程時間或星期格式不正確',
  5: '排程需選擇星期，且開始與結束時間不可相同',
  6: '閉眼角度超出設備允許的上限',
  7: '設定資料格式不正確',
};

const RESULT_MESSAGES: Record<number, string> = {
  [ResultCode.malformed]: '設備無法解讀指令，前端與韌體版本可能不一致',
  [ResultCode.unknownOpcode]: '設備不支援這個指令，請更新韌體',
  [ResultCode.storageFailed]: '設備寫入儲存區失敗，原設定未變更',
  [ResultCode.nightActive]: '請先解除夜間模式再執行眨眼',
  [ResultCode.blinkInProgress]: '眨眼循環進行中',
};

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * MINUTES_PER_HOUR + minutes;
}

function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function weekdaysToMask(weekdays: readonly number[]): number {
  return weekdays.reduce((mask, day) => mask | (1 << day), 0);
}

function maskToWeekdays(mask: number): number[] {
  return Array.from({ length: DAYS_PER_WEEK }, (_, day) => day).filter(
    (day) => (mask & (1 << day)) !== 0,
  );
}

const encodeAngle = (angle: number | null): number => angle ?? ANGLE_UNSET;
const decodeAngle = (value: number): number | null => (value === ANGLE_UNSET ? null : value);

function requireSize(data: DataView, size: number, what: string): void {
  if (data.byteLength !== size) {
    throw new Error(`設備回傳的${what}長度不正確（${data.byteLength} bytes，應為 ${size}）`);
  }
}

/** 呼叫前請先以 `validateSettings` 確認設定有效；無效的值會被編成錯誤的位元組。 */
export function encodeSettings(settings: BlinkSettings): Uint8Array<ArrayBuffer> {
  const { dayMode: day, nightMode: night, motor } = settings;
  const bytes = new Uint8Array(SETTINGS_BLOB_SIZE);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, settings.version);
  view.setUint8(
    1,
    (day.enabled ? FLAG_DAY_ENABLED : 0) | (night.scheduleEnabled ? FLAG_SCHEDULE_ENABLED : 0),
  );
  view.setUint32(2, day.intervalMs, LITTLE_ENDIAN);
  view.setUint16(6, day.closeDurationMs, LITTLE_ENDIAN);
  view.setUint16(8, day.closedHoldMs, LITTLE_ENDIAN);
  view.setUint16(10, day.openDurationMs, LITTLE_ENDIAN);
  view.setUint16(12, timeToMinutes(night.startTime), LITTLE_ENDIAN);
  view.setUint16(14, timeToMinutes(night.endTime), LITTLE_ENDIAN);
  view.setUint8(16, weekdaysToMask(night.weekdays));
  view.setUint8(17, encodeAngle(motor.left.closeAngle));
  view.setUint8(18, encodeAngle(motor.right.closeAngle));
  return bytes;
}

/** 只做格式解碼；內容是否合理請再以 `validateSettings` 檢查。 */
export function decodeSettings(data: DataView): BlinkSettings {
  requireSize(data, SETTINGS_BLOB_SIZE, '設定');
  const version = data.getUint8(0);
  if (version !== SETTINGS_VERSION) throw new Error(`設備使用不支援的設定版本（${version}）`);
  const flags = data.getUint8(1);
  return {
    version,
    dayMode: {
      enabled: (flags & FLAG_DAY_ENABLED) !== 0,
      intervalMs: data.getUint32(2, LITTLE_ENDIAN),
      closeDurationMs: data.getUint16(6, LITTLE_ENDIAN),
      closedHoldMs: data.getUint16(8, LITTLE_ENDIAN),
      openDurationMs: data.getUint16(10, LITTLE_ENDIAN),
    },
    nightMode: {
      scheduleEnabled: (flags & FLAG_SCHEDULE_ENABLED) !== 0,
      startTime: minutesToTime(data.getUint16(12, LITTLE_ENDIAN)),
      endTime: minutesToTime(data.getUint16(14, LITTLE_ENDIAN)),
      weekdays: maskToWeekdays(data.getUint8(16)),
    },
    motor: {
      left: { openAngle: 0, closeAngle: decodeAngle(data.getUint8(17)) },
      right: { openAngle: 0, closeAngle: decodeAngle(data.getUint8(18)) },
    },
  };
}

export function decodeStatus(data: DataView): BleStatus {
  requireSize(data, STATUS_SIZE, '狀態');
  const flags = data.getUint8(3);
  const localEpochSeconds = data.getUint32(8, LITTLE_ENDIAN);
  const msUntilNextBlink = data.getUint32(12, LITTLE_ENDIAN);
  const isTimeSynced = (flags & STATUS_FLAG_TIME_SYNCED) !== 0;
  return {
    protocolVersion: data.getUint8(0),
    firmwareVersion: `${data.getUint8(1)}.${data.getUint8(2)}`,
    mode: MODES[flags & 0x03] ?? 'idle',
    source: SOURCES[(flags >> 2) & 0x03] ?? 'day',
    phase: PHASES[(flags >> 4) & 0x03],
    progress: data.getUint8(4) / 0xff,
    leftAngle: decodeAngle(data.getUint8(5)),
    rightAngle: decodeAngle(data.getUint8(6)),
    deviceTime: isTimeSynced ? fromLocalEpochSeconds(localEpochSeconds) : null,
    msUntilNextBlink: msUntilNextBlink === NO_NEXT_BLINK ? null : msUntilNextBlink,
  };
}

export function encodeCommand(
  seq: number,
  opcode: Opcode,
  payload: Uint8Array = new Uint8Array(0),
): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(2 + payload.byteLength);
  bytes[0] = seq;
  bytes[1] = opcode;
  bytes.set(payload, 2);
  return bytes;
}

export function decodeResult(data: DataView): CommandResult {
  requireSize(data, RESULT_SIZE, '指令結果');
  return {
    seq: data.getUint8(0),
    opcode: data.getUint8(1),
    code: data.getUint8(2),
    detail: data.getUint8(3),
  };
}

/** 把非成功的結果轉成給使用者看的訊息。 */
export function resultMessage({ code, detail }: CommandResult): string {
  if (code === ResultCode.invalidSettings) {
    return '設備拒絕這份設定：' + (SETTINGS_ERRORS[detail] ?? `未知原因（${detail}）`);
  }
  return RESULT_MESSAGES[code] ?? `設備回報未知錯誤（${code}）`;
}

/**
 * 設備沒有時區概念，只認「本地時間秒數」：牆上時鐘顯示的時間，當成 UTC 換算出的秒數。
 * 日光節約時間切換後需要重新連線對時。
 */
export function toLocalEpochSeconds(date: Date): number {
  const utcSeconds = Math.floor(date.getTime() / MS_PER_SECOND);
  return utcSeconds - date.getTimezoneOffset() * SECONDS_PER_MINUTE;
}

export function fromLocalEpochSeconds(localEpochSeconds: number): Date {
  // 先當成 UTC 取出牆上時鐘的各個欄位，再用本地時區組回 Date，
  // 這樣即使跨越日光節約時間也會得到正確的時刻。
  const wall = new Date(localEpochSeconds * MS_PER_SECOND);
  return new Date(
    wall.getUTCFullYear(),
    wall.getUTCMonth(),
    wall.getUTCDate(),
    wall.getUTCHours(),
    wall.getUTCMinutes(),
    wall.getUTCSeconds(),
  );
}

export function encodeTimePayload(date: Date): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, toLocalEpochSeconds(date), LITTLE_ENDIAN);
  return bytes;
}
