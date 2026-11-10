#include "device_clock.h"

namespace blink {

namespace {
constexpr uint32_t SECONDS_PER_DAY = 86400;
constexpr uint32_t SECONDS_PER_MINUTE = 60;
constexpr uint8_t DAYS_PER_WEEK = 7;
// 1970-01-01 是星期四。
constexpr uint8_t EPOCH_WEEKDAY = 4;
}  // namespace

void DeviceClock::tick(uint32_t millisNow) {
  if (!started_) {
    started_ = true;
    lastMillis_ = millisNow;
    return;
  }
  // 無號數相減在 millis() 溢位歸零時仍會得到正確的經過時間。
  uptimeMs_ += static_cast<uint32_t>(millisNow - lastMillis_);
  lastMillis_ = millisNow;
}

void DeviceClock::setLocalEpoch(uint32_t localEpochSeconds) {
  baseEpochSeconds_ = localEpochSeconds;
  baseUptimeMs_ = uptimeMs_;
  synced_ = true;
}

uint32_t DeviceClock::localEpochSeconds() const {
  if (!synced_) return 0;
  return baseEpochSeconds_ + static_cast<uint32_t>((uptimeMs_ - baseUptimeMs_) / 1000);
}

LocalTime DeviceClock::localTime() const {
  LocalTime time;
  time.synced = synced_;
  const uint32_t epoch = localEpochSeconds();
  time.weekday = static_cast<uint8_t>((epoch / SECONDS_PER_DAY + EPOCH_WEEKDAY) % DAYS_PER_WEEK);
  time.minutes = static_cast<uint16_t>((epoch % SECONDS_PER_DAY) / SECONDS_PER_MINUTE);
  return time;
}

}  // namespace blink
