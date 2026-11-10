import { useStore } from 'zustand';
import { createDeviceBinding } from '../device';
import { readDeviceKind, writeDeviceKind } from '../device/deviceKind';
import type { DeviceKind } from '../device/types';
import { createDeviceStore, type DeviceState } from './deviceStore';
import { createSettingsStore, type SettingsState } from './settingsStore';

// 應用程式的組裝點：決定設備類型、建立設備與 store，並把它們接在一起。
const getStorage = () => window.localStorage;
const settingsStore = createSettingsStore();
const deviceStore = createDeviceStore({
  ...createDeviceBinding(readDeviceKind(getStorage)),
  settings: settingsStore,
});

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

/**
 * 切換模擬設備／實體設備。設備在載入時就決定，
 * 所以記住選擇後重新載入頁面，讓所有狀態從乾淨的起點開始。
 */
export function switchDeviceKind(kind: DeviceKind): void {
  writeDeviceKind(getStorage, kind);
  window.location.reload();
}
