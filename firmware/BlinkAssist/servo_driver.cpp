#include "servo_driver.h"

#include <Arduino.h>

#include "config.h"

namespace blink {

namespace {

constexpr uint32_t PERIOD_US = 1000000UL / config::SERVO_FREQUENCY_HZ;
constexpr uint32_t MAX_DUTY = (1UL << config::SERVO_PWM_RESOLUTION_BITS) - 1;
// 每圈主迴圈最多移動的角度。主迴圈實際週期只會比設定值長，所以速度只會更慢、不會更快。
constexpr float MAX_STEP_DEG =
    config::MAX_SERVO_SPEED_DEG_PER_SECOND * config::LOOP_INTERVAL_MS / 1000.0f;

float clampFloat(float value, float low, float high) {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

uint8_t pinOf(Side side) {
  return side == Side::Left ? config::LEFT_SERVO_PIN : config::RIGHT_SERVO_PIN;
}

void attachPwm(Side side) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcAttach(pinOf(side), config::SERVO_FREQUENCY_HZ, config::SERVO_PWM_RESOLUTION_BITS);
#else
  const uint8_t channel =
      side == Side::Left ? config::LEFT_SERVO_CHANNEL : config::RIGHT_SERVO_CHANNEL;
  ledcSetup(channel, config::SERVO_FREQUENCY_HZ, config::SERVO_PWM_RESOLUTION_BITS);
  ledcAttachPin(pinOf(side), channel);
#endif
}

void writeDuty(Side side, uint32_t duty) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWrite(pinOf(side), duty);
#else
  ledcWrite(side == Side::Left ? config::LEFT_SERVO_CHANNEL : config::RIGHT_SERVO_CHANNEL, duty);
#endif
}

}  // namespace

void ServoDriver::begin() {
  attachPwm(Side::Left);
  attachPwm(Side::Right);
  // 開機時不知道馬達實際位置，只能直接輸出睜眼位置。
  writePhysicalAngle(Side::Left, config::LEFT_OPEN_DEG);
  writePhysicalAngle(Side::Right, config::RIGHT_OPEN_DEG);
}

void ServoDriver::writeCloseAngle(Side side, float closeAngleDeg) {
  // 第二道防線：即使上層邏輯出錯，也不會超過韌體設定的最大閉眼角度。
  const float target = clampFloat(closeAngleDeg, 0.0f, config::MAX_CLOSE_ANGLE_DEG);
  float& current = current_[static_cast<uint8_t>(side)];
  current = clampFloat(target, current - MAX_STEP_DEG, current + MAX_STEP_DEG);
  const float limited = current;
  const bool isLeft = side == Side::Left;
  const float openDeg = isLeft ? config::LEFT_OPEN_DEG : config::RIGHT_OPEN_DEG;
  const float direction = isLeft ? config::LEFT_DIRECTION : config::RIGHT_DIRECTION;
  writePhysicalAngle(side, openDeg + direction * limited);
}

void ServoDriver::writePhysicalAngle(Side side, float physicalDeg) {
  const float deg = clampFloat(physicalDeg, 0.0f, config::SERVO_MAX_PHYSICAL_DEG);
  const float pulseUs =
      config::SERVO_MIN_PULSE_US +
      (config::SERVO_MAX_PULSE_US - config::SERVO_MIN_PULSE_US) * deg /
          config::SERVO_MAX_PHYSICAL_DEG;
  const uint32_t duty = static_cast<uint32_t>(pulseUs * MAX_DUTY / PERIOD_US);
  writeDuty(side, duty);
}

}  // namespace blink
