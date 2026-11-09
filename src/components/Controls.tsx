import { Download, Save, Check, Link, Unlink } from 'lucide-react';
import { useDeviceStore } from '../stores/deviceStore';
import { useSettingsStore } from '../stores/settingsStore';
import { validateSettings } from '../types/settings';
export function DeviceActions({connection = false}: {connection?: boolean}) {
  const {status,busy,run} = useDeviceStore();
  const {draft,saved} = useSettingsStore();
  const dirty = JSON.stringify(draft)!==JSON.stringify(saved);
  return <div className="actions">
    {connection && <button className="secondary" disabled={busy} onClick={() => run(status.connected?'disconnect':'connect')}>{status.connected ? <Unlink size={17}/> : <Link size={17}/>} {status.connected?'中斷連線':'連接模擬設備'}</button>}
    <button className="secondary" disabled={busy||!status.connected} onClick={() => run('read')}><Download size={17}/>讀取設定</button>
    <button className="secondary" disabled={busy||!status.connected||validateSettings(draft).length>0} onClick={() => run('save')}><Save size={17}/>儲存設定</button>
    <button className="primary" disabled={busy||!status.connected||dirty} onClick={() => run('apply')}><Check size={17}/>套用設定</button>
  </div>;
}
export function Toggle({label,description,checked,onChange,disabled=false}: {label:string;description?:string;checked:boolean;onChange:(v:boolean)=>void;disabled?:boolean}) {
  return <div className="toggle-row"><div><strong>{label}</strong>{description&&<p>{description}</p>}</div><button type="button" className={'toggle '+(checked?'on':'')} role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={()=>onChange(!checked)}><span/></button></div>;
}
export function NumberField({label,value,min,max,step=1,unit,onChange,help}: {label:string;value:number;min:number;max:number;step?:number;unit:string;onChange:(v:number)=>void;help:string}) {
  return <label className="number-field"><span>{label}</span><div className="input-unit"><input type="number" min={min} max={max} step={step} value={Number.isNaN(value)?'':value} onChange={e=>onChange(e.target.valueAsNumber)}/><span>{unit}</span></div><input aria-label={label+'滑桿'} type="range" min={min} max={max} step={step} value={Number.isFinite(value)?value:min} onChange={e=>onChange(Number(e.target.value))}/><small>{help}</small></label>;
}
