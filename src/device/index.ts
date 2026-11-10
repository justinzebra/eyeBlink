import { BleDeviceService } from './ble/bleDeviceService';
import type { DeviceService, SimulationTools } from './deviceService';
import { createWebLock } from './mock/deviceLock';
import { createStorageRepository } from './mock/deviceRepository';
import { MockDeviceService } from './mock/mockDeviceService';
import type { DeviceKind } from './types';

const TAB_LOCK_NAME = 'blink-assist.mock-device.connection';

export interface DeviceBinding {
  device: DeviceService;
  /** 實體設備為 `null`；UI 依此決定是否顯示模擬工具。 */
  simulation: SimulationTools | null;
}

/** 全專案唯一決定「使用哪一種設備實作」的地方。 */
export function createDeviceBinding(kind: DeviceKind): DeviceBinding {
  if (kind === 'ble') {
    return { device: new BleDeviceService(globalThis.navigator?.bluetooth), simulation: null };
  }
  const mock = new MockDeviceService({
    repository: createStorageRepository(() => window.localStorage),
    lock: createWebLock(TAB_LOCK_NAME, globalThis.navigator?.locks),
  });
  return { device: mock, simulation: mock };
}
