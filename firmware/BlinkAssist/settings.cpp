#include "settings.h"

#include "config.h"

namespace blink {

namespace {

constexpr uint32_t INTERVAL_MIN_MS = 1000;
constexpr uint32_t INTERVAL_MAX_MS = 86400000;
constexpr uint16_t MOVE_MIN_MS = 100;
constexpr uint16_t DURATION_MAX_MS = 10000;

constexpr uint8_t FLAG_DAY_ENABLED = 0x01;
constexpr uint8_t FLAG_SCHEDULE_ENABLED = 0x02;
constexpr uint8_t FLAG_RESERVED_MASK = 0xFC;
constexpr uint8_t WEEKDAY_MASK = 0x7F;

uint16_t readU16(const uint8_t* p) {
  return static_cast<uint16_t>(p[0] | (p[1] << 8));
}

uint32_t readU32(const uint8_t* p) {
  return static_cast<uint32_t>(p[0]) | (static_cast<uint32_t>(p[1]) << 8) |
         (static_cast<uint32_t>(p[2]) << 16) | (static_cast<uint32_t>(p[3]) << 24);
}

void writeU16(uint8_t* p, uint16_t value) {
  p[0] = static_cast<uint8_t>(value & 0xFF);
  p[1] = static_cast<uint8_t>(value >> 8);
}

void writeU32(uint8_t* p, uint32_t value) {
  p[0] = static_cast<uint8_t>(value & 0xFF);
  p[1] = static_cast<uint8_t>((value >> 8) & 0xFF);
  p[2] = static_cast<uint8_t>((value >> 16) & 0xFF);
  p[3] = static_cast<uint8_t>(value >> 24);
}

bool isValidAngle(uint8_t angle) {
  return angle == protocol::ANGLE_UNSET || angle <= config::MAX_CLOSE_ANGLE_DEG;
}

}  // namespace

Settings defaultSettings() {
  Settings s;
  s.dayEnabled = true;
  s.intervalMs = 600000;
  s.closeDurationMs = 500;
  s.closedHoldMs = 300;
  s.openDurationMs = 500;
  s.scheduleEnabled = false;
  s.startMinutes = 22 * 60;
  s.endMinutes = 7 * 60;
  s.weekdays = WEEKDAY_MASK;
  // 角度預設為未設定：剛燒錄完的設備在使用者明確設定前不會轉動馬達。
  s.leftCloseAngle = protocol::ANGLE_UNSET;
  s.rightCloseAngle = protocol::ANGLE_UNSET;
  return s;
}

uint32_t blinkDurationMs(const Settings& s) {
  return static_cast<uint32_t>(s.closeDurationMs) + s.closedHoldMs + s.openDurationMs;
}

SettingsError validateSettings(const Settings& s) {
  const bool timingInRange =
      s.intervalMs >= INTERVAL_MIN_MS && s.intervalMs <= INTERVAL_MAX_MS &&
      s.closeDurationMs >= MOVE_MIN_MS && s.closeDurationMs <= DURATION_MAX_MS &&
      s.closedHoldMs <= DURATION_MAX_MS &&
      s.openDurationMs >= MOVE_MIN_MS && s.openDurationMs <= DURATION_MAX_MS;
  if (!timingInRange) return SettingsError::DayTiming;
  if (s.intervalMs < blinkDurationMs(s)) return SettingsError::IntervalTooShort;

  if (s.startMinutes >= MINUTES_PER_DAY || s.endMinutes >= MINUTES_PER_DAY ||
      (s.weekdays & ~WEEKDAY_MASK) != 0) {
    return SettingsError::ScheduleTime;
  }
  if (s.scheduleEnabled && (s.startMinutes == s.endMinutes || s.weekdays == 0)) {
    return SettingsError::ScheduleIncomplete;
  }

  if (!isValidAngle(s.leftCloseAngle) || !isValidAngle(s.rightCloseAngle)) {
    return SettingsError::Angle;
  }
  return SettingsError::None;
}

// 位元組配置見 docs/ble-protocol.md，多位元組欄位為 little-endian。
SettingsError decodeSettings(const uint8_t* data, size_t length, Settings& out) {
  if (data == nullptr || length != protocol::SETTINGS_BLOB_SIZE) return SettingsError::Format;
  if (data[0] != SETTINGS_VERSION) return SettingsError::Version;
  const uint8_t flags = data[1];
  if ((flags & FLAG_RESERVED_MASK) != 0 || data[19] != 0) return SettingsError::Format;

  Settings s;
  s.dayEnabled = (flags & FLAG_DAY_ENABLED) != 0;
  s.scheduleEnabled = (flags & FLAG_SCHEDULE_ENABLED) != 0;
  s.intervalMs = readU32(data + 2);
  s.closeDurationMs = readU16(data + 6);
  s.closedHoldMs = readU16(data + 8);
  s.openDurationMs = readU16(data + 10);
  s.startMinutes = readU16(data + 12);
  s.endMinutes = readU16(data + 14);
  s.weekdays = data[16];
  s.leftCloseAngle = data[17];
  s.rightCloseAngle = data[18];

  const SettingsError error = validateSettings(s);
  if (error == SettingsError::None) out = s;
  return error;
}

void encodeSettings(const Settings& s, uint8_t out[protocol::SETTINGS_BLOB_SIZE]) {
  out[0] = SETTINGS_VERSION;
  out[1] = static_cast<uint8_t>((s.dayEnabled ? FLAG_DAY_ENABLED : 0) |
                                (s.scheduleEnabled ? FLAG_SCHEDULE_ENABLED : 0));
  writeU32(out + 2, s.intervalMs);
  writeU16(out + 6, s.closeDurationMs);
  writeU16(out + 8, s.closedHoldMs);
  writeU16(out + 10, s.openDurationMs);
  writeU16(out + 12, s.startMinutes);
  writeU16(out + 14, s.endMinutes);
  out[16] = s.weekdays;
  out[17] = s.leftCloseAngle;
  out[18] = s.rightCloseAngle;
  out[19] = 0;
}

}  // namespace blink
