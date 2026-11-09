import type { BlinkSettings } from './settings';
export type Phase = 'open' | 'closing' | 'hold' | 'opening';
export interface DeviceStatus {
  connected: boolean; kind: 'mock'; name: string; firmware: string;
  mode: 'day' | 'night' | 'idle'; source: 'manual' | 'schedule' | 'day';
  phase: Phase; progress: number; leftAngle: number | null; rightAngle: number | null;
  nextSchedule: string | null; nextBlink: string | null; lastSync: string | null; now: string;
}
export interface DeviceSnapshot { status: DeviceStatus; active: BlinkSettings }
export type OperationState = '尚未儲存' | '儲存中' | '已儲存' | '套用中' | '已套用' | '儲存失敗' | '設備未連線';
