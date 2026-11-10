import { useStore } from 'zustand';
import { createDeviceBinding } from '../device';
import { createDeviceStore, type DeviceState } from './deviceStore';
import { createSettingsStore, type SettingsState } from './settingsStore';

// 應用程式的組裝點：建立設備、建立 store，並把它們接在一起。
const settingsStore = createSettingsStore();
const deviceStore = createDeviceStore({ ...createDeviceBinding(), settings: settingsStore });

/**
 * 讀取設備狀態。請盡量傳入 selector 只取需要的欄位，
 * 例如 `useDeviceStore((s) => s.status.connected)`，避免每次時鐘更新都重繪。
 */
export function useDeviceStore<T>(selector: (state: DeviceState) => T): T {
  return useStore(deviceStore, selector);
}

export function useSettingsStore<T>(selector: (state: SettingsState) => T): T {
  return useStore(settingsStore, selector);
}
