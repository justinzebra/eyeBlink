// 設定資料、驗證與二進位編解碼。純邏輯，不依賴 Arduino。
// 驗證規則必須與前端 src/domain/validation.ts 一致，但以這裡為準：
// 前端只是提早提示，真正的把關在韌體。
#pragma once

#include <stddef.h>
#include <stdint.h>

#include "protocol.h"

namespace blink {

constexpr uint8_t SETTINGS_VERSION = 1;
constexpr uint16_t MINUTES_PER_DAY = 1440;

struct Settings {
  // 日間眨眼
  bool dayEnabled;
  uint32_t intervalMs;       // 這次開始到下次開始
  uint16_t closeDurationMs;
  uint16_t closedHoldMs;
  uint16_t openDurationMs;
  // 自動夜間排程
  bool scheduleEnabled;
  uint16_t startMinutes;     // 從午夜起算的分鐘數
  uint16_t endMinutes;
  uint8_t weekdays;          // bit n = 星期 n（0 為週日）；代表排程「開始日」
  // 閉眼參考角度；protocol::ANGLE_UNSET 代表尚未設定，該側不會轉動
  uint8_t leftCloseAngle;
  uint8_t rightCloseAngle;
};

// 數值對應 ResultCode::InvalidSettings 的 detail。
enum class SettingsError : uint8_t {
  None = 0,
  Version = 1,
  DayTiming = 2,
  IntervalTooShort = 3,
  ScheduleTime = 4,
  ScheduleIncomplete = 5,
  Angle = 6,
  Format = 7,
};

Settings defaultSettings();

// 一次完整眨眼（閉眼 + 停留 + 睜眼）的時間。
uint32_t blinkDurationMs(const Settings& settings);

SettingsError validateSettings(const Settings& settings);

// 解碼並驗證。成功回傳 SettingsError::None 並寫入 out。
SettingsError decodeSettings(const uint8_t* data, size_t length, Settings& out);

void encodeSettings(const Settings& settings, uint8_t out[protocol::SETTINGS_BLOB_SIZE]);

}  // namespace blink
