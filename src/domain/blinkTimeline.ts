import { blinkDurationMs, type DayModeSettings } from './settings';

export type BlinkPhase = 'open' | 'closing' | 'hold' | 'opening';

/** 眼瞼姿態：`progress` 0 為全開、1 為到達閉眼參考角度。 */
export interface BlinkPose {
  phase: BlinkPhase;
  progress: number;
}

/** 眨眼時間軸，時間皆為 epoch 毫秒。所有函式都是純函式，回傳新物件。 */
export interface BlinkTimeline {
  /** 進行中的眨眼開始時間；沒有眨眼時為 `null`。 */
  blinkStart: number | null;
  /** 下一次自動眨眼的開始時間。間隔從上一次眨眼「結束」起算。 */
  nextBlinkAt: number;
}

export const OPEN_POSE: BlinkPose = { phase: 'open', progress: 0 };
export const CLOSED_POSE: BlinkPose = { phase: 'hold', progress: 1 };

/** 一次循環的長度：完整眨眼加上眨完後的睜眼間隔。 */
function cycleMs(day: DayModeSettings): number {
  return blinkDurationMs(day) + day.intervalMs;
}

/** 從 `now` 重新起算間隔，並取消進行中的眨眼。 */
export function restartTimeline(now: number, intervalMs: number): BlinkTimeline {
  return { blinkStart: null, nextBlinkAt: now + intervalMs };
}

/** 立即開始一次眨眼，下次自動眨眼從這次眨完起算一個間隔。 */
export function startBlink(now: number, day: DayModeSettings): BlinkTimeline {
  return { blinkStart: now, nextBlinkAt: now + cycleMs(day) };
}

function clearFinishedBlink(
  timeline: BlinkTimeline,
  day: DayModeSettings,
  now: number,
): BlinkTimeline {
  const isFinished =
    timeline.blinkStart !== null && now - timeline.blinkStart >= blinkDurationMs(day);
  return isFinished ? { ...timeline, blinkStart: null } : timeline;
}

function startDueBlink(timeline: BlinkTimeline, day: DayModeSettings, now: number): BlinkTimeline {
  const isDue = timeline.blinkStart === null && day.enabled && now >= timeline.nextBlinkAt;
  if (!isDue) return timeline;
  // 分頁被背景節流時可能一次跳過多個循環：對齊到最近一次應開始的時間，不補播。
  const cycle = cycleMs(day);
  const missedCycles = Math.floor((now - timeline.nextBlinkAt) / cycle);
  const blinkStart = timeline.nextBlinkAt + missedCycles * cycle;
  return { blinkStart, nextBlinkAt: blinkStart + cycle };
}

/**
 * 把時間軸推進到 `now`。夜間期間不眨眼，並持續把下次眨眼往後推，
 * 讓夜間結束後從那一刻起算一個完整間隔。
 */
export function advanceTimeline(
  timeline: BlinkTimeline,
  day: DayModeSettings,
  now: number,
  isNight: boolean,
): BlinkTimeline {
  if (isNight) return restartTimeline(now, day.intervalMs);
  const settled = clearFinishedBlink(timeline, day, now);
  return clearFinishedBlink(startDueBlink(settled, day, now), day, now);
}

/** 依時間軸算出 `now` 當下的眼瞼姿態（日間用；夜間請直接用 `CLOSED_POSE`）。 */
export function poseAt(timeline: BlinkTimeline, day: DayModeSettings, now: number): BlinkPose {
  if (timeline.blinkStart === null) return OPEN_POSE;

  const elapsed = now - timeline.blinkStart;
  const holdStart = day.closeDurationMs;
  const openStart = holdStart + day.closedHoldMs;
  const end = openStart + day.openDurationMs;

  if (elapsed < 0 || elapsed >= end) return OPEN_POSE;
  if (elapsed < holdStart) return { phase: 'closing', progress: elapsed / day.closeDurationMs };
  if (elapsed < openStart) return CLOSED_POSE;
  return { phase: 'opening', progress: 1 - (elapsed - openStart) / day.openDurationMs };
}
