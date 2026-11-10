import { useState } from 'react';
import { Clock, Moon } from 'lucide-react';
import { DeviceActions } from '../components/DeviceActions';
import { Toggle } from '../components/Toggle';
import type { ModeSource } from '../device/types';
import { toggleWeekday } from '../domain/settings';
import { formatTime } from '../lib/formatTime';
import { useDeviceStore, useSettingsStore } from '../stores';

/** 依週一到週日的顯示順序排列；`day` 為 0（日）到 6（六）。 */
const WEEKDAY_OPTIONS = [
  { day: 1, label: '一' },
  { day: 2, label: '二' },
  { day: 3, label: '三' },
  { day: 4, label: '四' },
  { day: 5, label: '五' },
  { day: 6, label: '六' },
  { day: 0, label: '日' },
] as const;

const SOURCE_LABELS: Record<ModeSource, string> = {
  manual: '手動夜間',
  schedule: '自動夜間排程',
  day: '日間設定',
};

function ManualNight() {
  const connected = useDeviceStore((state) => state.status.connected);
  const busy = useDeviceStore((state) => state.pending !== null);
  const manualEnabled = useDeviceStore((state) => state.status.source === 'manual');
  const setManualNight = useDeviceStore((state) => state.setManualNight);

  return (
    <section className="card night-manual">
      <div className="night-icon">
        <Moon size={32} />
      </div>
      <div className="grow">
        <h2>手動夜間模式</h2>
        <p>立即保持閉眼，直到手動解除。這是即時指令，不需要儲存或套用。</p>
        <Toggle
          label={manualEnabled ? '夜間模式已開啟' : '手動夜間模式已關閉'}
          description="開啟期間優先於自動排程；關閉後恢復依排程判斷。不會被儲存，重新啟動後一律為關閉。"
          checked={manualEnabled}
          disabled={!connected || busy}
          onChange={setManualNight}
        />
      </div>
    </section>
  );
}

function NightSchedule() {
  const night = useSettingsStore((state) => state.draft.nightMode);
  const patchNightMode = useSettingsStore((state) => state.patchNightMode);

  return (
    <section className="card">
      <h2>
        <Clock size={20} />
        自動夜間排程
      </h2>
      <Toggle
        label="啟用自動排程"
        description="由設備依照本地時間判斷運作模式"
        checked={night.scheduleEnabled}
        onChange={(scheduleEnabled) => patchNightMode({ scheduleEnabled })}
      />
      <div className="field-grid">
        <label>
          開始時間
          <input
            type="time"
            value={night.startTime}
            onChange={(event) => patchNightMode({ startTime: event.target.value })}
          />
          <small>進入夜間閉眼狀態</small>
        </label>
        <label>
          結束時間
          <input
            type="time"
            value={night.endTime}
            onChange={(event) => patchNightMode({ endTime: event.target.value })}
          />
          <small>返回日間模式</small>
        </label>
      </div>
      <span className="block-label" id="weekday-label">
        排程開始日
      </span>
      <div className="weekdays" role="group" aria-labelledby="weekday-label">
        {WEEKDAY_OPTIONS.map(({ day, label }) => {
          const selected = night.weekdays.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={selected}
              className={selected ? 'selected' : ''}
              onClick={() => patchNightMode({ weekdays: toggleWeekday(night.weekdays, day) })}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="info-box">
        支援跨日：週一 22:00 至隔天 07:00，請勾選星期一。手動解除後，若仍在排程內，模型會繼續閉眼。
      </div>
      <DeviceActions />
    </section>
  );
}

function ScheduleSimulator() {
  const status = useDeviceStore((state) => state.status);
  const busy = useDeviceStore((state) => state.pending !== null);
  const setSimulationTime = useDeviceStore((state) => state.setSimulationTime);
  const [time, setTime] = useState('');
  const unavailable = !status.connected || busy;

  const resetToRealTime = () => {
    setTime('');
    void setSimulationTime(null);
  };

  return (
    <section className="card">
      <h2>排程模擬工具</h2>
      <p>切換模擬設備的時鐘，測試開始、結束與跨日。不會更改電腦時間。</p>
      <label>
        模擬日期與時間
        <input
          type="datetime-local"
          value={time}
          onChange={(event) => setTime(event.target.value)}
        />
      </label>
      <div className="actions mt-4">
        <button
          type="button"
          className="secondary"
          disabled={unavailable || !time}
          onClick={() => setSimulationTime(new Date(time))}
        >
          前往模擬時間
        </button>
        <button
          type="button"
          className="secondary"
          disabled={unavailable}
          onClick={resetToRealTime}
        >
          恢復實際時間
        </button>
      </div>
      <dl>
        <div>
          <dt>設備目前時間</dt>
          <dd>{formatTime(status.now)}</dd>
        </div>
        <div>
          <dt>運作來源</dt>
          <dd>{SOURCE_LABELS[status.source]}</dd>
        </div>
        <div>
          <dt>下次排程切換</dt>
          <dd>{formatTime(status.nextSchedule)}</dd>
        </div>
      </dl>
      <p className="caption">
        只有已套用的排程會生效。瀏覽器關閉期間不會執行模擬動作；重新開啟並連線時，會依儲存設定及當下時間恢復判斷。
      </p>
    </section>
  );
}

export function NightMode() {
  const canSimulate = useDeviceStore((state) => state.canSimulate);

  return (
    <>
      <ManualNight />
      <div className="two-col">
        <NightSchedule />
        {canSimulate && <ScheduleSimulator />}
      </div>
    </>
  );
}
