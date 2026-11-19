// 眨眼與日夜模式的狀態機。純邏輯，不依賴 Arduino，也不直接碰馬達。
// 行為必須與前端的 src/domain/blinkTimeline.ts、src/domain/schedule.ts 一致。
#pragma once

#include <stdint.h>

#include "device_clock.h"
#include "settings.h"

namespace blink {

// 數值即狀態封包中的編碼，請勿更動順序。
enum class Mode : uint8_t { Idle = 0, Day = 1, Night = 2 };
enum class Source : uint8_t { Day = 0, Schedule = 1, Manual = 2 };
enum class Phase : uint8_t { Open = 0, Closing = 1, Hold = 2, Opening = 3 };

struct Pose {
  Phase phase;
  float progress;  // 0 為全開，1 為到達閉眼參考角度
};

enum class BlinkRequest : uint8_t { Started, NightActive, InProgress };

// 目前是否落在夜間排程內（含開始、不含結束）；未對時一律為否。
bool isScheduleActive(const Settings& settings, const LocalTime& time);

class BlinkEngine {
 public:
  // 換用新的執行設定，並從現在起重新計算眨眼間隔。
  void setSettings(const Settings& settings, uint64_t nowMs);

  // 手動夜間：即時指令，不儲存。開啟期間優先於自動排程。
  void setManualNight(bool enabled, uint64_t nowMs);

  // 立即眨眼一次，下次自動眨眼從這次眨完起算一個間隔。夜間或眨眼進行中會被拒絕。
  BlinkRequest requestBlink(uint64_t nowMs);

  // 把狀態推進到現在。每圈主迴圈呼叫一次。
  void update(uint64_t nowMs, const LocalTime& time);

  const Settings& settings() const { return settings_; }
  Mode mode() const;
  Source source() const { return source_; }
  Pose pose() const { return pose_; }
  // 距離下次自動眨眼的毫秒數；沒有排定時回傳 protocol::NO_NEXT_BLINK。
  uint32_t msUntilNextBlink(uint64_t nowMs) const;

 private:
  uint64_t cycleMs() const;
  void restartTimeline(uint64_t nowMs);
  Pose poseAt(uint64_t nowMs) const;

  Settings settings_ = defaultSettings();
  bool manualNight_ = false;
  Source source_ = Source::Day;
  Pose pose_ = {Phase::Open, 0.0f};
  bool blinking_ = false;
  uint64_t blinkStartMs_ = 0;
  uint64_t nextBlinkAtMs_ = 0;
};

}  // namespace blink
