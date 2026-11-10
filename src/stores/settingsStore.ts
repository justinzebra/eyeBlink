import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  cloneSettings,
  defaultSettings,
  type BlinkSettings,
  type DayModeSettings,
  type MotorSettings,
  type MotorSide,
  type MotorSideSettings,
  type NightModeSettings,
} from '../domain/settings';

/**
 * 表單編輯狀態。
 * - `draft`：編輯中，尚未寫入設備
 * - `saved`：設備儲存區目前的內容
 *
 * 設備「執行中」的設定不在這裡，請讀 deviceStore 的 `active`。
 */
export interface SettingsState {
  draft: BlinkSettings;
  saved: BlinkSettings;
  patchDayMode: (patch: Partial<DayModeSettings>) => void;
  patchNightMode: (patch: Partial<NightModeSettings>) => void;
  patchMotorSide: (side: MotorSide, patch: Partial<MotorSideSettings>) => void;
  setMotor: (motor: MotorSettings) => void;
  /** 以設備讀回的設定取代 draft 與 saved。 */
  load: (settings: BlinkSettings) => void;
  /** 設備確認寫入成功後，更新 saved（不動 draft）。 */
  markSaved: (settings: BlinkSettings) => void;
}

export type SettingsStore = StoreApi<SettingsState>;

export function createSettingsStore(): SettingsStore {
  return createStore<SettingsState>((set) => {
    const updateDraft = (update: (draft: BlinkSettings) => BlinkSettings) =>
      set((state) => ({ draft: update(state.draft) }));

    return {
      draft: cloneSettings(defaultSettings),
      saved: cloneSettings(defaultSettings),
      patchDayMode: (patch) =>
        updateDraft((draft) => ({ ...draft, dayMode: { ...draft.dayMode, ...patch } })),
      patchNightMode: (patch) =>
        updateDraft((draft) => ({ ...draft, nightMode: { ...draft.nightMode, ...patch } })),
      patchMotorSide: (side, patch) =>
        updateDraft((draft) => ({
          ...draft,
          motor: { ...draft.motor, [side]: { ...draft.motor[side], ...patch } },
        })),
      setMotor: (motor) => updateDraft((draft) => ({ ...draft, motor })),
      load: (settings) => set({ draft: cloneSettings(settings), saved: cloneSettings(settings) }),
      markSaved: (settings) => set({ saved: cloneSettings(settings) }),
    };
  });
}
