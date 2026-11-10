import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useSettingsSync } from '../hooks/useSettingsSync';
import { useDeviceStore } from '../stores';
import type { SyncState } from '../stores/syncState';

const SYNC_LABELS: Record<SyncState, string> = {
  saving: '儲存中',
  applying: '套用中',
  disconnected: '設備未連線',
  unsaved: '尚未儲存',
  unapplied: '已儲存，尚未套用',
  applied: '已套用',
};

/** 需要使用者接著操作的狀態，以琥珀色圓點提示。 */
const NEEDS_ATTENTION: readonly SyncState[] = ['unsaved', 'unapplied'];

/** 同步狀態列，加上操作結果與表單驗證訊息。 */
export function StatusBanner() {
  const error = useDeviceStore((state) => state.error);
  const notice = useDeviceStore((state) => state.notice);
  const { syncState, errors } = useSettingsSync();
  const message = error || notice;

  return (
    <>
      <div className="state-strip">
        <span>
          <i className={NEEDS_ATTENTION.includes(syncState) ? 'dot amber' : 'dot'} />
          {SYNC_LABELS[syncState]}
        </span>
        <span>所有動作僅在桌面模型中模擬</span>
      </div>
      <div aria-live="polite">
        {message && (
          <div className={error ? 'notice error' : 'notice'}>
            {error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{message}</span>
          </div>
        )}
      </div>
      {errors.length > 0 && (
        <div className="notice error" role="alert">
          {errors.join('；')}
        </div>
      )}
    </>
  );
}
