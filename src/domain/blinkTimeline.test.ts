import { describe, expect, it } from 'vitest';
import {
  CLOSED_POSE,
  OPEN_POSE,
  advanceTimeline,
  poseAt,
  restartTimeline,
  startBlink,
} from './blinkTimeline';
import type { DayModeSettings } from './settings';

const day: DayModeSettings = {
  enabled: true,
  intervalMs: 60_000,
  closeDurationMs: 500,
  closedHoldMs: 300,
  openDurationMs: 500,
};
const T0 = 1_000_000;

describe('poseAt', () => {
  it('沒有進行中的眨眼時保持睜眼', () => {
    expect(poseAt(restartTimeline(T0, day.intervalMs), day, T0 + 10)).toEqual(OPEN_POSE);
  });

  it('依序經過閉眼、停留、睜眼，結束後回到睜眼', () => {
    const timeline = startBlink(T0, day);

    expect(poseAt(timeline, day, T0 + 250)).toEqual({ phase: 'closing', progress: 0.5 });
    expect(poseAt(timeline, day, T0 + 500)).toEqual(CLOSED_POSE);
    expect(poseAt(timeline, day, T0 + 1050)).toEqual({ phase: 'opening', progress: 0.5 });
    expect(poseAt(timeline, day, T0 + 1300)).toEqual(OPEN_POSE);
  });
});

describe('advanceTimeline', () => {
  it('還沒到下次眨眼時間時不改變時間軸', () => {
    const timeline = restartTimeline(T0, day.intervalMs);

    expect(advanceTimeline(timeline, day, T0 + 59_999, false)).toBe(timeline);
  });

  it('到達間隔時開始眨眼，下次時間從這次眨完起算', () => {
    const timeline = restartTimeline(T0, day.intervalMs);

    const advanced = advanceTimeline(timeline, day, T0 + 60_000, false);

    expect(advanced).toEqual({ blinkStart: T0 + 60_000, nextBlinkAt: T0 + 60_000 + 1300 + 60_000 });
  });

  it('手動觸發的眨眼，下次時間同樣從眨完起算', () => {
    expect(startBlink(T0, day)).toEqual({ blinkStart: T0, nextBlinkAt: T0 + 1300 + 60_000 });
  });

  it('間隔短於一次眨眼時，眨完仍會睜眼等待完整間隔', () => {
    const quick = { ...day, intervalMs: 1000 };
    const started = advanceTimeline(restartTimeline(T0, quick.intervalMs), quick, T0 + 1000, false);

    const finished = advanceTimeline(started, quick, T0 + 1000 + 1300, false);
    const beforeNext = advanceTimeline(finished, quick, T0 + 1000 + 1300 + 999, false);
    const next = advanceTimeline(beforeNext, quick, T0 + 1000 + 1300 + 1000, false);

    expect(finished.blinkStart).toBeNull();
    expect(beforeNext.blinkStart).toBeNull();
    expect(next.blinkStart).toBe(T0 + 3300);
  });

  it('眨眼結束後清除進行中的眨眼', () => {
    const timeline = startBlink(T0, day);

    expect(advanceTimeline(timeline, day, T0 + 1300, false).blinkStart).toBeNull();
  });

  it('跳過多個循環時對齊最近一次，不補播錯過的眨眼', () => {
    const timeline = restartTimeline(T0, day.intervalMs);
    const cycle = 1300 + 60_000;

    const advanced = advanceTimeline(timeline, day, T0 + 60_000 + cycle * 2 + 200, false);

    expect(advanced).toEqual({
      blinkStart: T0 + 60_000 + cycle * 2,
      nextBlinkAt: T0 + 60_000 + cycle * 3,
    });
  });

  it('停用日間模式時不自動開始眨眼', () => {
    const timeline = restartTimeline(T0, day.intervalMs);

    const advanced = advanceTimeline(timeline, { ...day, enabled: false }, T0 + 120_000, false);

    expect(advanced.blinkStart).toBeNull();
  });

  it('夜間取消眨眼，並把下次眨眼延到夜間結束後一個間隔', () => {
    const timeline = startBlink(T0, day);

    const advanced = advanceTimeline(timeline, day, T0 + 100, true);

    expect(advanced).toEqual({ blinkStart: null, nextBlinkAt: T0 + 100 + day.intervalMs });
  });

  it('不修改傳入的時間軸', () => {
    const timeline = Object.freeze(restartTimeline(T0, day.intervalMs));

    expect(() => advanceTimeline(timeline, day, T0 + 60_000, false)).not.toThrow();
    expect(timeline.blinkStart).toBeNull();
  });
});
