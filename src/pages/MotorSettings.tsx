import { Copy, RotateCcw } from 'lucide-react';
import { DeviceActions } from '../components/DeviceActions';
import { MOTOR_SIDES, createUnsetMotor, type MotorSide } from '../domain/settings';
import { CLOSE_ANGLE_LIMITS } from '../domain/validation';
import { useSettingsStore } from '../stores';

const SIDE_LABELS: Record<MotorSide, string> = { left: '左側', right: '右側' };

function MotorSideCard({ side }: { side: MotorSide }) {
  const closeAngle = useSettingsStore((state) => state.draft.motor[side].closeAngle);
  const patchMotorSide = useSettingsStore((state) => state.patchMotorSide);
  const setCloseAngle = (angle: number | null) => patchMotorSide(side, { closeAngle: angle });

  return (
    <section className="card">
      <div className="section-head">
        <h2>{SIDE_LABELS[side]}模型</h2>
        <span className="tag">{closeAngle === null ? '尚未設定' : '已設定參考值'}</span>
      </div>
      <div className="angle-dial">
        <span>
          {closeAngle ?? '—'}
          <small>°</small>
        </span>
      </div>
      <label>
        睜眼參考角度
        <input value="0°" readOnly />
      </label>
      <label>
        閉眼參考角度（度）
        <input
          type="number"
          {...CLOSE_ANGLE_LIMITS}
          placeholder="尚未設定"
          value={closeAngle ?? ''}
          onChange={(event) =>
            setCloseAngle(event.target.value === '' ? null : event.target.valueAsNumber)
          }
        />
      </label>
      <input
        type="range"
        aria-label={SIDE_LABELS[side] + '角度滑桿'}
        {...CLOSE_ANGLE_LIMITS}
        value={closeAngle ?? CLOSE_ANGLE_LIMITS.min}
        onChange={(event) => setCloseAngle(event.target.valueAsNumber)}
      />
      <p className="caption">模型校正狀態：未經實體校正與安全驗證</p>
    </section>
  );
}

export function MotorSettings() {
  const motor = useSettingsStore((state) => state.draft.motor);
  const setMotor = useSettingsStore((state) => state.setMotor);

  return (
    <>
      <div className="info-box">
        角度僅供桌面模型展示與模擬。0–90° 是軟體展示範圍，並非人體安全範圍，也不代表已完成機械校正。
      </div>
      <div className="two-col">
        {MOTOR_SIDES.map((side) => (
          <MotorSideCard key={side} side={side} />
        ))}
      </div>
      <section className="card footer-actions">
        <div className="actions">
          <button
            type="button"
            className="secondary"
            onClick={() => setMotor({ ...motor, right: { ...motor.left } })}
          >
            <Copy size={17} />
            複製左側至右側
          </button>
          <button type="button" className="secondary" onClick={() => setMotor(createUnsetMotor())}>
            <RotateCcw size={17} />
            還原角度預設值
          </button>
        </div>
        <DeviceActions />
      </section>
      <p className="caption">
        韌體安全驗證接口已預留。真實控制仍需機械限位、力量限制、故障釋放與醫療安全驗證。
      </p>
    </>
  );
}
