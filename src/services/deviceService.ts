import type { BlinkSettings } from '../types/settings';
import type { DeviceSnapshot } from '../types/device';
export interface DeviceService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  readSettings(): Promise<BlinkSettings>;
  saveSettings(settings: BlinkSettings): Promise<void>;
  applySettings(): Promise<void>;
  setManualNight(enabled: boolean): Promise<void>;
  simulateBlink(): Promise<void>;
  restart(): Promise<void>;
  subscribe(listener: (snapshot: DeviceSnapshot) => void): () => void;
}
// 未來韌體須獨立驗證；前端不得覆蓋、放寬或跳過設備安全限制。
export interface FirmwareSafetyGate {
  validateConfiguration(settings: BlinkSettings): Promise<{ allowed: boolean; reasons: string[] }>;
}
