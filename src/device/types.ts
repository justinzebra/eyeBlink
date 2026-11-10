import type { BlinkPhase } from '../domain/blinkTimeline';
import type { BlinkSettings } from '../domain/settings';

export type DeviceKind = 'mock' | 'ble';
export type DeviceMode = 'day' | 'night' | 'idle';
/** 目前姿態由誰決定：手動夜間 > 自動排程 > 日間設定。 */
export type ModeSource = 'manual' | 'schedule' | 'day';

export interface DeviceStatus {
  connected: boolean;
  kind: DeviceKind;
  name: string;
  firmware: string;
  mode: DeviceMode;
  source: ModeSource;
  phase: BlinkPhase;
  progress: number;
  /** 未設定閉眼參考角度時為 `null`。 */
  leftAngle: number | null;
  rightAngle: number | null;
  /** 以下時間皆為 ISO 字串。 */
  nextSchedule: string | null;
  nextBlink: string | null;
  lastSync: string | null;
  /** 設備時鐘，精確到秒。 */
  now: string;
}

export interface DeviceSnapshot {
  status: DeviceStatus;
  /** 設備實際執行中的設定。唯讀，請勿修改。 */
  active: BlinkSettings;
}

export type DeviceListener = (snapshot: DeviceSnapshot) => void;
