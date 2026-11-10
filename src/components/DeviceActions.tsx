import { Check, Download, Save } from 'lucide-react';
import { useSettingsSync } from '../hooks/useSettingsSync';
import { useDeviceStore } from '../stores';
import { ConnectionButton } from './ConnectionButton';

interface DeviceActionsProps {
  /** 是否一併顯示連線／中斷按鈕。 */
  showConnection?: boolean;
}

/** 讀取、儲存、套用三個按鈕。流程固定為：先儲存，再套用。 */
export function DeviceActions({ showConnection = false }: DeviceActionsProps) {
  const connected = useDeviceStore((state) => state.status.connected);
  const busy = useDeviceStore((state) => state.pending !== null);
  const readSettings = useDeviceStore((state) => state.readSettings);
  const saveSettings = useDeviceStore((state) => state.saveSettings);
  const applySettings = useDeviceStore((state) => state.applySettings);
  const { isDirty, errors } = useSettingsSync();
  const unavailable = busy || !connected;

  return (
    <div className="actions">
      {showConnection && <ConnectionButton />}
      <button type="button" className="secondary" disabled={unavailable} onClick={readSettings}>
        <Download size={17} />
        讀取設定
      </button>
      <button
        type="button"
        className="secondary"
        disabled={unavailable || errors.length > 0}
        onClick={saveSettings}
      >
        <Save size={17} />
        儲存設定
      </button>
      <button
        type="button"
        className="primary"
        disabled={unavailable || isDirty}
        onClick={applySettings}
      >
        <Check size={17} />
        套用設定
      </button>
    </div>
  );
}
