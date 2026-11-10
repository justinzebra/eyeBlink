import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { ConnectionButton } from '../components/ConnectionButton';
import { DeviceActions } from '../components/DeviceActions';
import { DEVICE_NAME_MAX_LENGTH, normalizeDeviceName } from '../device/deviceName';
import type { DeviceKind } from '../device/types';
import { useDeviceText } from '../hooks/useDeviceText';
import { formatTime } from '../lib/formatTime';
import { switchDeviceKind, useDeviceStore } from '../stores';

const KIND_OPTIONS: { kind: DeviceKind; title: string; description: string }[] = [
  {
    kind: 'mock',
    title: '模擬設備',
    description: '在瀏覽器裡模擬，不需要硬體，也不會有馬達轉動。',
  },
  {
    kind: 'ble',
    title: 'ESP32 實機（藍牙）',
    description: '透過藍牙控制已燒錄韌體的 ESP32，實體伺服馬達會轉動。',
  },
];

const KIND_NOTES: Record<DeviceKind, string> = {
  mock: '設定儲存在這個瀏覽器裡。網頁關閉後模擬就會停止。',
  ble: '設定儲存在 ESP32 上。連線時會自動對時；網頁關閉或斷線後，設備仍會依已套用的設定自行運作。需使用電腦版 Chrome 或 Edge。',
};

function DeviceKindSelector() {
  const currentKind = useDeviceStore((state) => state.status.kind);
  const connected = useDeviceStore((state) => state.status.connected);

  const select = (kind: DeviceKind) => {
    if (kind === currentKind) return;
    const message =
      kind === 'ble'
        ? '切換到實機模式後，儲存並套用的設定會讓實體馬達轉動。\n僅限桌面模型測試，請勿裝在人身上。\n\n頁面將重新載入，未儲存的修改會遺失。確定要切換嗎？'
        : '頁面將重新載入，未儲存的修改會遺失。確定要切換到模擬設備嗎？';
    if (!window.confirm(message)) return;
    try {
      switchDeviceKind(kind);
    } catch {
      window.alert('無法記住設備類型，請確認瀏覽器允許這個網站儲存資料。');
    }
  };

  return (
    <section className="card">
      <h2>設備類型</h2>
      <p>切換後頁面會重新載入。請先中斷目前的連線再切換。</p>
      <div className="kind-options" role="radiogroup" aria-label="設備類型">
        {KIND_OPTIONS.map((option) => {
          const selected = option.kind === currentKind;
          return (
            <button
              key={option.kind}
              type="button"
              role="radio"
              aria-checked={selected}
              className={selected ? 'kind-option selected' : 'kind-option'}
              disabled={connected && !selected}
              onClick={() => select(option.kind)}
            >
              <strong>{option.title}</strong>
              <small>{option.description}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** 以 `key={savedName}` 掛載：設備名稱改變（連線、重啟、改名）時輸入框會重設。 */
function DeviceNameForm({ savedName }: { savedName: string }) {
  const connected = useDeviceStore((state) => state.status.connected);
  const busy = useDeviceStore((state) => state.pending !== null);
  const rename = useDeviceStore((state) => state.rename);
  const [name, setName] = useState(savedName);
  const isValid = normalizeDeviceName(name) !== null;

  return (
    <>
      <label>
        設備名稱
        <input
          maxLength={DEVICE_NAME_MAX_LENGTH}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="secondary mt-4"
        disabled={!connected || busy || !isValid}
        onClick={() => rename(name)}
      >
        儲存設備名稱
      </button>
    </>
  );
}

function DeviceManagement() {
  const status = useDeviceStore((state) => state.status);
  const canSimulate = useDeviceStore((state) => state.canSimulate);
  const text = useDeviceText();

  return (
    <section className="card">
      <h2>設備管理</h2>
      <p>{KIND_NOTES[status.kind]}</p>
      {canSimulate && <DeviceNameForm key={status.name} savedName={status.name} />}
      <dl>
        <div>
          <dt>設備類型</dt>
          <dd>{text.deviceLabel}</dd>
        </div>
        {!canSimulate && (
          <div>
            <dt>設備名稱</dt>
            <dd>{status.name}</dd>
          </div>
        )}
        <div>
          <dt>連線狀態</dt>
          <dd className={status.connected ? 'success' : ''}>
            {status.connected ? '已連線' : '未連線'}
          </dd>
        </div>
        <div>
          <dt>韌體版本</dt>
          <dd>{status.firmware}</dd>
        </div>
        <div>
          <dt>最後同步時間</dt>
          <dd>{formatTime(status.lastSync)}</dd>
        </div>
      </dl>
      <ConnectionButton />
    </section>
  );
}

function RestartPanel() {
  const connected = useDeviceStore((state) => state.status.connected);
  const busy = useDeviceStore((state) => state.pending !== null);
  const restart = useDeviceStore((state) => state.restart);
  const text = useDeviceText();

  return (
    <section className="card">
      <h2>儲存與重新啟動</h2>
      <p>儲存設定會寫入設備的儲存區。套用後，設備才會改用新的設定執行。</p>
      <div className="info-box">
        {text.restart}
        會捨棄未儲存的編輯與目前的執行狀態（包含手動夜間），重新讀取最後儲存的版本。此動作不會刪除儲存資料。
      </div>
      <button type="button" className="secondary" disabled={busy || !connected} onClick={restart}>
        <RotateCcw size={17} />
        {text.restart}
      </button>
    </section>
  );
}

export function DeviceSettings() {
  return (
    <>
      <DeviceKindSelector />
      <div className="two-col">
        <DeviceManagement />
        <RestartPanel />
      </div>
      <section className="card bottom-card">
        <div>
          <h2>設定同步</h2>
          <p>讀取設定會取代目前尚未儲存的編輯。</p>
        </div>
        <DeviceActions showConnection />
      </section>
    </>
  );
}
