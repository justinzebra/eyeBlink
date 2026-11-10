import type { BlinkPhase } from '../domain/blinkTimeline';
import { MOTOR_SIDES, type MotorSide } from '../domain/settings';
import { useDeviceStore } from '../stores';

const PHASE_LABELS: Record<BlinkPhase, string> = {
  open: '睜眼',
  closing: '閉眼中',
  hold: '閉眼停留',
  opening: '睜眼中',
};

const SIDE_LABELS: Record<MotorSide, string> = { left: '左側', right: '右側' };

/** 眼瞼開口的垂直幅度（SVG 單位）；progress 為 1 時上下眼瞼在中線閉合。 */
const LID_TRAVEL = 50;

/** 上下眼瞼圍成的眼形路徑；`progress` 0 為全開、1 為閉合。 */
function eyeOutline(progress: number): string {
  const upperLid = 5 + progress * LID_TRAVEL;
  const lowerLid = 105 - progress * LID_TRAVEL;
  return `M20 55 Q110 ${upperLid} 200 55 Q110 ${lowerLid} 20 55Z`;
}

interface EyeProps {
  side: MotorSide;
  progress: number;
  angle: number | null;
  hasReferenceAngle: boolean;
}

function Eye({ side, progress, angle, hasReferenceAngle }: EyeProps) {
  const outline = eyeOutline(progress);
  const clipId = `eye-clip-${side}`;

  return (
    <div className="eye-side">
      <svg viewBox="0 0 220 110" role="img" aria-label={SIDE_LABELS[side] + '模型'}>
        <defs>
          <clipPath id={clipId}>
            <path d={outline} />
          </clipPath>
        </defs>
        <path d={outline} fill="#fff" stroke="#2c647c" strokeWidth="3" />
        <g clipPath={`url(#${clipId})`}>
          <circle cx="110" cy="55" r="29" fill="#51acae" />
          <circle cx="110" cy="55" r="13" fill="#224b62" />
          <circle cx="119" cy="45" r="6" fill="white" />
        </g>
      </svg>
      <span>{SIDE_LABELS[side]}模型</span>
      <strong>
        {angle?.toFixed(1) ?? '—'}
        <small> °</small>
      </strong>
      <small>{hasReferenceAngle ? '已設定展示參考角度' : '參考角度尚未設定'}</small>
    </div>
  );
}

/** 即時顯示模擬設備的雙眼姿態。 */
export function EyeModel() {
  const status = useDeviceStore((state) => state.status);
  const motor = useDeviceStore((state) => state.active.motor);
  const angles: Record<MotorSide, number | null> = {
    left: status.leftAngle,
    right: status.rightAngle,
  };

  return (
    <section className="card model-card">
      <div className="section-head">
        <h2>即時模型</h2>
        <span className="tag teal">純軟體模擬</span>
      </div>
      <div className="eyes" aria-label={'模型狀態：' + PHASE_LABELS[status.phase]}>
        {MOTOR_SIDES.map((side) => (
          <Eye
            key={side}
            side={side}
            progress={status.progress}
            angle={angles[side]}
            hasReferenceAngle={motor[side].closeAngle !== null}
          />
        ))}
      </div>
      <div className="model-phase">
        <span className="pulse" />
        {PHASE_LABELS[status.phase]}
        <span>{status.mode === 'night' ? '持續閉眼模擬' : '睜眼 → 閉眼 → 停留 → 睜眼'}</span>
      </div>
      <p className="caption">未設定角度時，眼形僅示意動作進度。此模型不代表人體安全範圍。</p>
    </section>
  );
}
