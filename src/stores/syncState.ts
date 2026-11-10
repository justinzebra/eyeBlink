import { settingsEqual, type BlinkSettings } from '../domain/settings';
import type { PendingOperation } from './deviceStore';

/**
 * 設定同步進度。由三份設定推導而來，不另外儲存，
 * 因此不會出現「狀態文字和實際資料對不上」的情況。
 */
export type SyncState =
  'saving' | 'applying' | 'disconnected' | 'unsaved' | 'unapplied' | 'applied';

export interface SyncInput {
  pending: PendingOperation | null;
  connected: boolean;
  draft: BlinkSettings;
  saved: BlinkSettings;
  active: BlinkSettings;
}

export function resolveSyncState({
  pending,
  connected,
  draft,
  saved,
  active,
}: SyncInput): SyncState {
  if (pending === 'save') return 'saving';
  if (pending === 'apply') return 'applying';
  if (!connected) return 'disconnected';
  if (!settingsEqual(draft, saved)) return 'unsaved';
  return settingsEqual(saved, active) ? 'applied' : 'unapplied';
}
