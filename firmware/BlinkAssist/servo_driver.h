// 以 ESP32 的 LEDC（硬體 PWM）直接驅動 MG90S，不需要額外安裝伺服函式庫。
#pragma once

#include <stdint.h>

namespace blink {

enum class Side : uint8_t { Left = 0, Right = 1 };

class ServoDriver {
 public:
  // 設定 PWM 並把兩側移到睜眼位置。
  void begin();

  // 設定某一側的「閉眼角度」（0 為睜眼）。實際輸出角度依 config.h 的安裝方向換算，
  // 並限制在 config::MAX_CLOSE_ANGLE_DEG 與伺服的物理行程內。
  // 每圈主迴圈呼叫一次。輸出會以 config::MAX_SERVO_SPEED_DEG_PER_SECOND 為上限逐步靠近目標。
  void writeCloseAngle(Side side, float closeAngleDeg);

  // 目前實際送給伺服的閉眼角度（已套用速度限制）。
  float closeAngle(Side side) const { return current_[static_cast<uint8_t>(side)]; }

 private:
  void writePhysicalAngle(Side side, float physicalDeg);

  float current_[2] = {0.0f, 0.0f};
};

}  // namespace blink
