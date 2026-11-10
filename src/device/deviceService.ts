import type { BlinkSettings } from '../domain/settings';
import type { DeviceListener, DeviceSnapshot } from './types';

/**
 * 設備通訊介面。store 與 UI 只能依賴這個介面，不可依賴特定實作。
 * 所有失敗都必須以 rejected Promise 回報，不可假裝成功。
 */
export interface DeviceService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** 讀取設備「已儲存」的設定（不是執行中的設定）。 */
  readSettings(): Promise<BlinkSettings>;
  /** 寫入設備儲存區；成功不代表已生效，需另外 `applySettings`。 */
  saveSettings(settings: BlinkSettings): Promise<void>;
  /** 讓設備改用已儲存的設定執行。 */
  applySettings(): Promise<void>;
  /**
   * 手動夜間：立即保持閉眼，優先於自動排程。
   * 這是即時指令，不寫入儲存區；設備重新啟動後一律為關閉。
   */
  setManualNight(enabled: boolean): Promise<void>;
  simulateBlink(): Promise<void>;
  restart(): Promise<void>;
  snapshot(): DeviceSnapshot;
  /** 訂閱狀態更新，回傳取消訂閱函式。訂閱當下會立即收到一次目前狀態。 */
  subscribe(listener: DeviceListener): () => void;
}

/**
 * 只有模擬設備才有的工具。實體設備不提供這個介面，
 * 因此這些指令在型別上就無法送到真實硬體。
 */
export interface SimulationTools {
  /** 推進模擬時鐘並通知訂閱者；由 UI 的計時器定期呼叫。 */
  tick(): void;
  /** 指定模擬時間；傳入 `null` 恢復實際時間。 */
  setSimulationTime(date: Date | null): void;
  rename(name: string): Promise<void>;
}

export type SimulatedDeviceService = DeviceService & SimulationTools;
