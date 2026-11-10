import { useMemo } from 'react';
import { settingsEqual } from '../domain/settings';
import { validateSettings } from '../domain/validation';
import { useDeviceStore, useSettingsStore } from '../stores';
import { resolveSyncState, type SyncState } from '../stores/syncState';

export interface SettingsSync {
  /** draft 與已儲存內容不同。 */
  isDirty: boolean;
  /** draft 的驗證錯誤；空陣列代表可以儲存。 */
  errors: string[];
  syncState: SyncState;
}

/** 表單同步狀態的唯一來源；按鈕停用、狀態列與提示都從這裡取值。 */
export function useSettingsSync(): SettingsSync {
  const draft = useSettingsStore((state) => state.draft);
  const saved = useSettingsStore((state) => state.saved);
  const active = useDeviceStore((state) => state.active);
  const pending = useDeviceStore((state) => state.pending);
  const connected = useDeviceStore((state) => state.status.connected);

  return useMemo(
    () => ({
      isDirty: !settingsEqual(draft, saved),
      errors: validateSettings(draft),
      syncState: resolveSyncState({ pending, connected, draft, saved, active }),
    }),
    [draft, saved, active, pending, connected],
  );
}
