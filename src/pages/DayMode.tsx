import { ArrowRight, Eye, Play } from 'lucide-react';
import { DeviceActions } from '../components/DeviceActions';
import { EyeModel } from '../components/EyeModel';
import { NumberField } from '../components/NumberField';
import { Toggle } from '../components/Toggle';
import { blinkDurationMs, type DayModeSettings } from '../domain/settings';
import { DAY_LIMITS } from '../domain/validation';
import { useDeviceStore, useSettingsStore } from '../stores';

const MS_PER_MINUTE = 60_000;
const MS_PER_SECOND = 1000;
const DURATION_STEP_MS = 50;
/** 介面以分鐘為單位輸入間隔，最小一分鐘。 */
const INTERVAL_MINUTES = { min: 1, max: DAY_LIMITS.intervalMs.max / MS_PER_MINUTE };

function BlinkParameters() {
  const day = useSettingsStore((state) => state.draft.dayMode);
  const patchDayMode = useSettingsStore((state) => state.patchDayMode);

  return (
    <section className="card">
      <h2>日間眨眼參數</h2>
      <p>定義一次完整眨眼的節奏與時間。</p>
      <Toggle
        label="啟用日間模式"
        description="夜間模式結束後，依此設定恢復運作"
        checked={day.enabled}
        onChange={(enabled) => patchDayMode({ enabled })}
      />
      <div className="field-grid">
        <NumberField
          label="眨眼間隔"
          unit="分鐘"
          value={day.intervalMs / MS_PER_MINUTE}
          {...INTERVAL_MINUTES}
          onChange={(minutes) => patchDayMode({ intervalMs: Math.round(minutes * MS_PER_MINUTE) })}
          help="本次開始至下次開始的間隔"
        />
        <NumberField
          label="閉眼時間"
          unit="毫秒"
          value={day.closeDurationMs}
          {...DAY_LIMITS.closeDurationMs}
          step={DURATION_STEP_MS}
          onChange={(closeDurationMs) => patchDayMode({ closeDurationMs })}
          help="從 0° 移動至閉眼參考角度"
        />
        <NumberField
          label="閉眼停留時間"
          unit="毫秒"
          value={day.closedHoldMs}
          {...DAY_LIMITS.closedHoldMs}
          step={DURATION_STEP_MS}
          onChange={(closedHoldMs) => patchDayMode({ closedHoldMs })}
          help="到達閉眼位置後的停留時間"
        />
        <NumberField
          label="睜眼時間"
          unit="毫秒"
          value={day.openDurationMs}
          {...DAY_LIMITS.openDurationMs}
          step={DURATION_STEP_MS}
          onChange={(openDurationMs) => patchDayMode({ openDurationMs })}
          help="從閉眼參考角度返回 0°"
        />
      </div>
    </section>
  );
}

/** 輸入框被清空時值為 NaN，顯示破折號而不是「NaN」。 */
const formatNumber = (value: number): string => (Number.isFinite(value) ? String(value) : '—');

function blinkSteps(day: DayModeSettings): { label: string; detail: string }[] {
  return [
    { label: '睜眼 · 0°', detail: '初始位置' },
    { label: '閉眼 · 參考角度', detail: `${formatNumber(day.closeDurationMs)} 毫秒` },
    { label: '停留', detail: `${formatNumber(day.closedHoldMs)} 毫秒` },
    { label: '睜眼 · 0°', detail: `${formatNumber(day.openDurationMs)} 毫秒` },
  ];
}

function BlinkCycle() {
  const day = useSettingsStore((state) => state.draft.dayMode);
  const connected = useDeviceStore((state) => state.status.connected);
  const busy = useDeviceStore((state) => state.pending !== null);
  const simulateBlink = useDeviceStore((state) => state.simulateBlink);
  const steps = blinkSteps(day);

  return (
    <section className="card">
      <div className="section-head">
        <h2>一次完整眨眼</h2>
        <span className="tag teal">
          總長 {formatNumber(blinkDurationMs(day) / MS_PER_SECOND)} 秒
        </span>
      </div>
      <div className="flow">
        {steps.map((step, index) => (
          <div key={index}>
            <Eye size={24} />
            <strong>{step.label}</strong>
            <small>{step.detail}</small>
            {index < steps.length - 1 && <ArrowRight className="flow-arrow" size={20} />}
          </div>
        ))}
      </div>
      <div className="footer-actions">
        <button
          type="button"
          className="secondary"
          disabled={!connected || busy}
          onClick={simulateBlink}
        >
          <Play size={17} />
          執行一次眨眼
        </button>
        <DeviceActions />
      </div>
    </section>
  );
}

export function DayMode() {
  return (
    <>
      <div className="two-col">
        <BlinkParameters />
        <div>
          <EyeModel />
          <div className="info-box">眨眼使用「已套用」參數；修改後請依序儲存、套用。</div>
        </div>
      </div>
      <BlinkCycle />
    </>
  );
}
