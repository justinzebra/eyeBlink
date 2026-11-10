import type { DeviceKind } from './types';

export const DEVICE_KIND_STORAGE_KEY = 'blink-assist.device-kind';
/** 預設使用模擬設備：第一次開啟時不會有任何實體馬達被驅動。 */
export const DEFAULT_DEVICE_KIND: DeviceKind = 'mock';

/** 讀取使用者上次選擇的設備類型；讀不到或值不合法時回到預設值。 */
export function readDeviceKind(getStorage: () => Storage): DeviceKind {
  try {
    const stored = getStorage().getItem(DEVICE_KIND_STORAGE_KEY);
    return stored === 'ble' || stored === 'mock' ? stored : DEFAULT_DEVICE_KIND;
  } catch {
    return DEFAULT_DEVICE_KIND;
  }
}

/** 記住設備類型；無法寫入時丟出錯誤。 */
export function writeDeviceKind(getStorage: () => Storage, kind: DeviceKind): void {
  getStorage().setItem(DEVICE_KIND_STORAGE_KEY, kind);
}
