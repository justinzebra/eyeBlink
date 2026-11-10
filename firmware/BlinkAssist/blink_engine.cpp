#include "blink_engine.h"

namespace blink {

namespace {
constexpr uint8_t DAYS_PER_WEEK = 7;
const Pose OPEN_POSE = {Phase::Open, 0.0f};
const Pose CLOSED_POSE = {Phase::Hold, 1.0f};

bool hasWeekday(uint8_t mask, uint8_t weekday) {
  return (mask & (1u << weekday)) != 0;
}
}  // namespace

// 星期以排程「開始日」為準：週一 22:00 至週二 07:00 屬於週一。
bool isScheduleActive(const Settings& s, const LocalTime& time) {
  if (!s.scheduleEnabled || !time.synced) return false;
  if (s.startMinutes == s.endMinutes) return false;

  const bool startsToday = hasWeekday(s.weekdays, time.weekday);
  if (s.startMinutes < s.endMinutes) {
    return startsToday && time.minutes >= s.startMinutes && time.minutes < s.endMinutes;
  }
  const uint8_t yesterday = static_cast<uint8_t>((time.weekday + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK);
  const bool startedYesterday = hasWeekday(s.weekdays, yesterday);
  return (startsToday && time.minutes >= s.startMinutes) ||
         (startedYesterday && time.minutes < s.endMinutes);
}

void BlinkEngine::setSettings(const Settings& settings, uint64_t nowMs) {
  settings_ = settings;
  restartTimeline(nowMs);
}

void BlinkEngine::setManualNight(bool enabled, uint64_t nowMs) {
  manualNight_ = enabled;
  restartTimeline(nowMs);
}

BlinkRequest BlinkEngine::requestBlink(uint64_t nowMs) {
  if (source_ != Source::Day) return BlinkRequest::NightActive;
  if (blinking_) return BlinkRequest::InProgress;
  blinking_ = true;
  blinkStartMs_ = nowMs;
  nextBlinkAtMs_ = nowMs + settings_.intervalMs;
  pose_ = poseAt(nowMs);
  return BlinkRequest::Started;
}

void BlinkEngine::update(uint64_t nowMs, const LocalTime& time) {
  if (manualNight_) {
    source_ = Source::Manual;
  } else if (isScheduleActive(settings_, time)) {
    source_ = Source::Schedule;
  } else {
    source_ = Source::Day;
  }

  if (source_ != Source::Day) {
    // 夜間不眨眼，並持續把下次眨眼往後推：夜間結束後從那一刻起算一個完整間隔。
    restartTimeline(nowMs);
    pose_ = CLOSED_POSE;
    return;
  }

  if (blinking_ && nowMs - blinkStartMs_ >= blinkDurationMs(settings_)) blinking_ = false;

  if (!blinking_ && settings_.dayEnabled && nowMs >= nextBlinkAtMs_) {
    // 正常情況下 missed 為 0；若主迴圈被長時間卡住，對齊到最近一次應開始的時間，不補播。
    const uint64_t missed = (nowMs - nextBlinkAtMs_) / settings_.intervalMs;
    blinkStartMs_ = nextBlinkAtMs_ + missed * settings_.intervalMs;
    nextBlinkAtMs_ = blinkStartMs_ + settings_.intervalMs;
    blinking_ = nowMs - blinkStartMs_ < blinkDurationMs(settings_);
  }

  pose_ = poseAt(nowMs);
}

Mode BlinkEngine::mode() const {
  if (source_ != Source::Day) return Mode::Night;
  return settings_.dayEnabled ? Mode::Day : Mode::Idle;
}

uint32_t BlinkEngine::msUntilNextBlink(uint64_t nowMs) const {
  if (source_ != Source::Day || !settings_.dayEnabled) return protocol::NO_NEXT_BLINK;
  if (nextBlinkAtMs_ <= nowMs) return 0;
  return static_cast<uint32_t>(nextBlinkAtMs_ - nowMs);
}

void BlinkEngine::restartTimeline(uint64_t nowMs) {
  blinking_ = false;
  nextBlinkAtMs_ = nowMs + settings_.intervalMs;
}

Pose BlinkEngine::poseAt(uint64_t nowMs) const {
  if (!blinking_) return OPEN_POSE;

  const uint32_t elapsed = static_cast<uint32_t>(nowMs - blinkStartMs_);
  const uint32_t holdStart = settings_.closeDurationMs;
  const uint32_t openStart = holdStart + settings_.closedHoldMs;
  const uint32_t end = openStart + settings_.openDurationMs;

  if (elapsed >= end) return OPEN_POSE;
  if (elapsed < holdStart) {
    return {Phase::Closing, static_cast<float>(elapsed) / settings_.closeDurationMs};
  }
  if (elapsed < openStart) return CLOSED_POSE;
  return {Phase::Opening,
          1.0f - static_cast<float>(elapsed - openStart) / settings_.openDurationMs};
}

}  // namespace blink
