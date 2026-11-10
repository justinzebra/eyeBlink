import { useState } from 'react';
import { Bluetooth, RotateCcw, Search } from 'lucide-react';
import { DeviceActions } from '../components/DeviceActions';
import { DEVICE_NAME_MAX_LENGTH, normalizeDeviceName } from '../device/deviceName';
import { formatTime } from '../lib/formatTime';
import { useDeviceStore } from '../stores';

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

function DeviceSearch() {
  const connected = useDeviceStore((state) => state.status.connected);
  const busy = useDeviceStore((state) => state.pending !== null);
  const connect = useDeviceStore((state) => state.connect);
  const [hasSearched, setHasSearched] = useState(false);

  return (
    <>
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={() => setHasSearched(true)}
      >
        <Search size={17} />
        搜尋模擬設備
      </button>
      {hasSearched && (
        <div className="found-device">
          <Bluetooth />
          <div>
            <strong>桌面模擬設備</strong>
            <p>本機模擬服務 · 無實體藍牙連線</p>
          </div>
          <button type="button" className="primary" disabled={busy || connected} onClick={connect}>
            {connected ? '已連線' : '連接設備'}
          </button>
        </div>
      )}
    </>
  );
}

function DeviceManagement() {
  const status = useDeviceStore((state) => state.status);
  const canSimulate = useDeviceStore((state) => state.canSimulate);

  return (
    <section className="card">
      <h2>設備管理</h2>
      <p>目前使用本機模擬設備，無需藍牙硬體。</p>
      {canSimulate && <DeviceNameForm key={status.name} savedName={status.name} />}
      <dl>
        <div>
          <dt>設備類型</dt>
          <dd>模擬設備</dd>
        </div>
        <div>
          <dt>藍牙連線狀態</dt>
          <dd>未啟用真實藍牙</dd>
        </div>
        <div>
          <dt>模擬連線</dt>
          <dd>{status.connected ? '已連線' : '未連線'}</dd>
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
      <DeviceSearch />
    </section>
  );
}

function RestartPanel() {
  const connected = useDeviceStore((state) => state.status.connected);
  const busy = useDeviceStore((state) => state.pending !== null);
  const restart = useDeviceStore((state) => state.restart);

  return (
    <section className="card">
      <h2>模擬儲存與重新啟動</h2>
      <p>儲存設定會寫入瀏覽器的本機持久化儲存區。套用後，模擬設備才更新執行設定。</p>
      <div className="info-box">
        重新啟動將捨棄未儲存的編輯與執行設定，重新讀取最後儲存版本。此動作不會刪除儲存資料。
      </div>
      <button type="button" className="secondary" disabled={busy || !connected} onClick={restart}>
        <RotateCcw size={17} />
        模擬設備重新啟動
      </button>
      <h3>下一階段：真實設備</h3>
      <p>已預留藍牙通訊與韌體安全驗證接口。此版本無法搜尋或控制真實 ESP32。</p>
      <p className="caption">
        未來排程將由 ESP32 獨立執行，設定寫入設備儲存區。模擬版本仍需網頁開啟，不能代替離線韌體。
      </p>
    </section>
  );
}

export function DeviceSettings() {
  return (
    <>
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
