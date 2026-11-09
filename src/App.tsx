import { useState } from 'react';
import { Eye,LayoutDashboard,Sun,Moon,SlidersHorizontal,Bluetooth,ShieldCheck,ChevronRight,CheckCircle2,AlertCircle } from 'lucide-react';
import { useDeviceEngine } from './hooks/useDeviceEngine';
import { useDeviceStore } from './stores/deviceStore';
import { useSettingsStore } from './stores/settingsStore';
import { validateSettings } from './types/settings';
import { Overview } from './pages/Overview';
import { DayMode } from './pages/DayMode';
import { NightMode } from './pages/NightMode';
import { MotorSettings } from './pages/MotorSettings';
import { DeviceSettings } from './pages/DeviceSettings';
const pages = [{title:'控制總覽',sub:'掌握設備狀態與日夜運作節奏',icon:LayoutDashboard,component:Overview},{title:'日間模式',sub:'設定每一次完整眨眼的節奏',icon:Sun,component:DayMode},{title:'夜間模式',sub:'手動閉眼保持與自動日夜排程',icon:Moon,component:NightMode},{title:'馬達設定',sub:'調整左右側桌面模型的參考角度',icon:SlidersHorizontal,component:MotorSettings},{title:'設備設定',sub:'管理模擬連線、儲存與設備資訊',icon:Bluetooth,component:DeviceSettings}];
export default function App() {
  useDeviceEngine(); const [page,setPage]=useState(0);
  const {status,operation,error,notice,busy,run}=useDeviceStore(); const {draft,saved}=useSettingsStore();
  const dirty=JSON.stringify(draft)!==JSON.stringify(saved); const errors=validateSettings(draft); const Page=pages[page].component;
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-icon"><Eye size={28}/></div><div><strong>眨眼輔助</strong><small>智慧照護控制系統</small></div></div><div className="sidebar-label">設備工作台</div><nav aria-label="主要頁面">{pages.map((p,i)=><button key={p.title} className={page===i?'active':''} aria-current={page===i?'page':undefined} onClick={()=>setPage(i)}><p.icon size={20}/>{p.title}{page===i&&<ChevronRight size={16}/>}</button>)}</nav><div className="sidebar-bottom"><div className="safe-icon"><ShieldCheck size={22}/></div><strong>安心從模擬開始</strong><p>目前僅供軟體模型測試，<br/>不會輸出實體馬達訊號。</p><span className="tag teal">第一階段 · 模擬模式</span></div><div className="sidebar-footer">眨眼輔助控制系統 · 版本 1.0</div></aside>
    <div className="main-shell"><header className="topbar"><div>設備工作台 <ChevronRight size={14}/> <strong>{pages[page].title}</strong></div><div><span className="tag">模擬模式</span><span className={'connection '+(status.connected?'connected':'')}><i/>{status.connected?'模擬設備已連線':'設備未連線'}</span></div></header><main><div className="page-heading"><div><span className="eyebrow">眨眼輔助控制系統</span><h1>{pages[page].title}</h1><p>{pages[page].sub}</p></div><button className="secondary" disabled={busy} onClick={()=>run(status.connected?'disconnect':'connect')}><Bluetooth size={18}/>{status.connected?'中斷連線':'連接模擬設備'}</button></div>
    <div className="state-strip"><span><i className={dirty?'dot amber':'dot'}/>{busy?operation:!status.connected?'設備未連線':dirty?'尚未儲存':operation}</span><span>所有動作僅在桌面模型中模擬</span></div>
    <div aria-live="polite">{(error||notice)&&<div className={error?'notice error':'notice'}>{error?<AlertCircle size={18}/>:<CheckCircle2 size={18}/>}<span>{error||notice}</span></div>}</div>{errors.length>0&&<div className="notice error" role="alert">{errors.join('；')}</div>}
    <fieldset disabled={busy} className="page-content"><Page/></fieldset><footer className="main-footer"><ShieldCheck size={15}/> 僅供桌面模型展示與模擬，尚未通過醫療安全驗證。</footer></main></div></div>;
}
