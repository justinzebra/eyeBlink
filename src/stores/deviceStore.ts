import { createStore, type StoreApi } from 'zustand/vanilla';
import { shallow } from 'zustand/shallow';
import type { DeviceService, SimulationTools } from '../device/deviceService';
import type { DeviceSnapshot } from '../device/types';
import { cloneSettings, settingsEqual } from '../domain/settings';
import type { SettingsStore } from './settingsStore';

/** 進行中的操作；`save`、`apply` 會在狀態列顯示專屬文字。 */
export type PendingOperation = 'save' | 'apply' | 'other';

export interface DeviceState extends DeviceSnapshot {
  pending: PendingOperation | null;
  notice: string;
  error: string;
  /** 目前設備是否提供模擬工具（改名、模擬時鐘）。 */
  canSimulate: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  restart: () => Promise<void>;
  readSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  applySettings: () => Promise<void>;
  setManualNight: (enabled: boolean) => Promise<void>;
  simulateBlink: () => Promise<void>;
  rename: (name: string) => Promise<void>;
  setSimulationTime: (date: Date | null) => Promise<void>;
  /** 推進模擬時鐘；實體設備時不做任何事。 */
  tick: () => void;
}

export type DeviceStore = StoreApi<DeviceState>;

export interface DeviceStoreDeps {
  device: DeviceService;
  simulation: SimulationTools | null;
  settings: SettingsStore;
}

const NOTICES = {
  connected: '已連接模擬設備',
  disconnected: '已中斷模擬連線',
  restarted: '模擬設備已重新啟動，並從持久化儲存區載入設定',
  read: '已讀取設備儲存設定，取代尚未儲存的編輯',
  saved: '設定已寫入模擬設備儲存區，請按套用設定使其生效',
  applied: '模擬設備已套用儲存設定',
  manualNightOn: '手動夜間已開啟，模型保持閉眼；此為即時指令，不會被儲存',
  manualNightOff: '手動夜間已關閉，恢復依自動排程與日間設定運作',
  blinkStarted: '模擬完整眨眼循環已開始，使用目前已套用的時間參數',
  renamed: '模擬設備名稱已儲存',
  clockUpdated: '模擬設備時鐘已更新',
} as const;

const SIMULATION_UNAVAILABLE = '此設備不支援模擬工具';

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : '操作失敗');

/**
 * 設備狀態與所有設備操作的唯一入口。UI 只呼叫這裡的 action，
 * 不直接碰 `DeviceService`，因此換成實體設備時 UI 不需要修改。
 */
export function createDeviceStore({ device, simulation, settings }: DeviceStoreDeps): DeviceStore {
  const store = createStore<DeviceState>((set, get) => {
    /** 一次只允許一個操作；成功時顯示回傳的訊息，失敗時顯示錯誤。 */
    const perform = async (pending: PendingOperation, operation: () => Promise<string>) => {
      if (get().pending !== null) return;
      set({ pending, error: '', notice: '' });
      try {
        set({ notice: await operation() });
      } catch (error) {
        set({ error: toMessage(error) });
      } finally {
        set({ pending: null });
      }
    };

    const loadSavedSettings = async () => settings.getState().load(await device.readSettings());

    const requireSimulation = (): SimulationTools => {
      if (!simulation) throw new Error(SIMULATION_UNAVAILABLE);
      return simulation;
    };

    return {
      ...device.snapshot(),
      pending: null,
      notice: '',
      error: '',
      canSimulate: simulation !== null,

      connect: () =>
        perform('other', async () => {
          await device.connect();
          await loadSavedSettings();
          return NOTICES.connected;
        }),

      disconnect: () =>
        perform('other', async () => {
          await device.disconnect();
          return NOTICES.disconnected;
        }),

      restart: () =>
        perform('other', async () => {
          await device.restart();
          await loadSavedSettings();
          return NOTICES.restarted;
        }),

      readSettings: () =>
        perform('other', async () => {
          await loadSavedSettings();
          return NOTICES.read;
        }),

      saveSettings: () =>
        perform('save', async () => {
          const candidate = cloneSettings(settings.getState().draft);
          await device.saveSettings(candidate);
          settings.getState().markSaved(candidate);
          return NOTICES.saved;
        }),

      applySettings: () =>
        perform('apply', async () => {
          const { draft, saved } = settings.getState();
          if (!settingsEqual(draft, saved)) throw new Error('請先儲存目前修改，再套用設定');
          await device.applySettings();
          return NOTICES.applied;
        }),

      setManualNight: (enabled) =>
        perform('other', async () => {
          await device.setManualNight(enabled);
          return enabled ? NOTICES.manualNightOn : NOTICES.manualNightOff;
        }),

      simulateBlink: () =>
        perform('other', async () => {
          await device.simulateBlink();
          return NOTICES.blinkStarted;
        }),

      rename: (name) =>
        perform('other', async () => {
          await requireSimulation().rename(name);
          return NOTICES.renamed;
        }),

      setSimulationTime: (date) =>
        perform('other', async () => {
          requireSimulation().setSimulationTime(date);
          return NOTICES.clockUpdated;
        }),

      tick: () => simulation?.tick(),
    };
  });

  // 計時器每 50ms 推送一次；內容沒變就不更新，避免整個畫面無謂重繪。
  device.subscribe((snapshot) => {
    const current = store.getState();
    const isUnchanged =
      current.active === snapshot.active && shallow(current.status, snapshot.status);
    if (!isUnchanged) store.setState(snapshot);
  });

  return store;
}
