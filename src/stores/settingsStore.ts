import { create } from 'zustand';
import { clone, defaultSettings, type BlinkSettings } from '../types/settings';
interface SettingsState {
  draft: BlinkSettings; saved: BlinkSettings; applied: BlinkSettings;
  edit: (update: (settings: BlinkSettings) => void) => void;
  load: (settings: BlinkSettings) => void;
}
export const useSettingsStore = create<SettingsState>(set => ({
  draft: clone(defaultSettings), saved: clone(defaultSettings), applied: clone(defaultSettings),
  edit: update => set(state => { const draft = clone(state.draft); update(draft); return { draft }; }),
  load: settings => set({ draft: clone(settings), saved: clone(settings) }),
}));
