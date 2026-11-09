import { Sun, Moon, CalendarClock, RefreshCw, Play } from 'lucide-react';
import { useDeviceStore } from '../stores/deviceStore';
import { DeviceActions } from '../components/Controls';
import { Model } from '../components/Model';
export const formatTime = (time:string|null) => time ? new Date(time).toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}) : '尚無資料';
export function Overview() {
  const {status,active,run,busy} = useDeviceStore();
  return <><div className="welcome"><div><span className="eyebrow">Blink Assist · 眨眼輔助控制系統</span><h2>每一次眨眼，都有節奏。</h2><p>在這裡查看設備狀態，調整白天與夜晚的運作方式。</p></div><div className="welcome-symbol"><Sun size={36}/><span>日夜有序 · 輕鬆照護</span></div></div>
    <div className="stats-grid"><div className="card stat"><Sun/><span>日間模式</span><strong>{active.dayMode.enabled?'已啟用':'已停用'}</strong><small>每 {active.dayMode.intervalMs/60000} 分鐘一次</small></div><div className="card stat"><Moon/><span>夜間模式</span><strong>{status.mode==='night'?'閉眼保持中':'待命中'}</strong><small>{status.source==='manual'?'手動夜間優先':status.source==='schedule'?'依自動排程運作':'依日間設定運作'}</small></div><div className="card stat"><CalendarClock/><span>下次排程切換</span><strong className="time-text">{status.nextSchedule?formatTime(status.nextSchedule):'尚未啟用'}</strong><small>{active.nightMode.manualEnabled?'手動夜間優先，排程暫不改變模式':'設備依照已套用設定判斷'}</small></div></div>
    <div className="overview-grid"><Model/><section className="card"><div className="section-head"><h2>設備資訊</h2><span className="tag">模擬模式</span></div><dl><div><dt>設備名稱</dt><dd>{status.name}</dd></div><div><dt>連線狀態</dt><dd className={status.connected?'success':''}>{status.connected?'模擬設備已連線':'設備未連線'}</dd></div><div><dt>目前運作模式</dt><dd>{status.mode==='night'?'夜間模式':status.mode==='day'?'日間模式':'待機模式'}</dd></div><div><dt>下次自動眨眼</dt><dd>{status.nextBlink?formatTime(status.nextBlink):'目前無眨眼排程'}</dd></div><div><dt>最後同步時間</dt><dd>{formatTime(status.lastSync)}</dd></div></dl><button className="secondary w-full" disabled={!status.connected||busy} onClick={()=>run('blink')}><Play size={17}/>模擬執行一次眨眼</button></section></div>
    <section className="card bottom-card"><div><h2><RefreshCw size={18}/>設定同步</h2><p>先儲存，再套用。設備只依照已套用的設定運作。</p></div><DeviceActions connection/></section></>;
}
