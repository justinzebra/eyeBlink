import type { DeviceService, SimulationTools } from './deviceService';
import { createWebLock } from './mock/deviceLock';
import { createStorageRepository } from './mock/deviceRepository';
import { MockDeviceService } from './mock/mockDeviceService';

const TAB_LOCK_NAME = 'blink-assist.mock-device.connection';

export interface DeviceBinding {
  device: DeviceService;
  /** 實體設備為 `null`；UI 依此決定是否顯示模擬工具。 */
  simulation: SimulationTools | null;
}

/**
 * 全專案唯一決定「使用哪一種設備」的地方。
 * 第二階段要接上 ESP32 時，在這裡改成回傳 BLE 實作並把 `simulation` 設為 `null`。
 */
export function createDeviceBinding(): DeviceBinding {
  const mock = new MockDeviceService({
    repository: createStorageRepository(() => window.localStorage),
    lock: createWebLock(TAB_LOCK_NAME, globalThis.navigator?.locks),
  });
  return { device: mock, simulation: mock };
}
