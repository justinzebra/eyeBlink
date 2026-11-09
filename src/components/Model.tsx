import { useDeviceStore } from '../stores/deviceStore';
const phases = {open:'睜眼',closing:'閉眼中',hold:'閉眼停留',opening:'睜眼中'};
export function Model() {
  const {status,active} = useDeviceStore();
  return <section className="card model-card"><div className="section-head"><h2>即時模型</h2><span className="tag teal">純軟體模擬</span></div>
    <div className="eyes" aria-label={'模型狀態：'+phases[status.phase]}>{(['left','right'] as const).map((side,i)=><div className="eye-side" key={side}><svg viewBox="0 0 220 110" role="img" aria-label={(i===0?'左':'右')+'側模型'}><defs><clipPath id={'eye-'+side}><path d={`M20 55 Q110 ${5+status.progress*50} 200 55 Q110 ${105-status.progress*50} 20 55Z`}/></clipPath></defs><path d={`M20 55 Q110 ${5+status.progress*50} 200 55 Q110 ${105-status.progress*50} 20 55Z`} fill="#fff" stroke="#2c647c" strokeWidth="3"/><g clipPath={`url(#eye-${side})`}><circle cx="110" cy="55" r="29" fill="#51acae"/><circle cx="110" cy="55" r="13" fill="#224b62"/><circle cx="119" cy="45" r="6" fill="white"/></g></svg><span>{i===0?'左側':'右側'}模型</span><strong>{(i===0?status.leftAngle:status.rightAngle)?.toFixed(1) ?? '—'}<small> °</small></strong><small>{active.motor[side].closeAngle===null?'參考角度尚未設定':'已設定展示參考角度'}</small></div>)}</div>
    <div className="model-phase"><span className="pulse"/>{phases[status.phase]}<span>{status.mode==='night'?'持續閉眼模擬':'睜眼 → 閉眼 → 停留 → 睜眼'}</span></div>
    <p className="caption">未設定角度時，眼形僅示意動作進度。此模型不代表人體安全範圍。</p>
  </section>;
}
