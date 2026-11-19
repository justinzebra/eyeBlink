// 硬體相關設定。換接腳、調整伺服方向或行程時，只需要改這個檔案。
#pragma once

#include <stdint.h>

namespace blink {
namespace config {

// 藍牙廣播名稱（瀏覽器的設備選擇視窗會顯示這個名稱）。
constexpr char DEVICE_NAME[] = "BlinkAssist";

// 韌體版本，會回報給前端顯示。
constexpr uint8_t FIRMWARE_VERSION_MAJOR = 1;
constexpr uint8_t FIRMWARE_VERSION_MINOR = 1;

// ---- 主晶振頻率（MHz）----
// Arduino-ESP32 3.x 一律假設主晶振是 40 MHz。少數開發板用的是 26 MHz，
// 不更正的話所有時脈都只有應有的 65%：序列埠要用 74880 才讀得懂、計時變慢、
// 伺服脈波變長，藍牙也掃不到。
//   0  = 不更正（一般 40 MHz 的板子用這個）
//   26 = 開機時更正為 26 MHz
// 必須與板子實際的晶振相符，填錯會讓時脈與伺服脈波全部走樣。
// 判斷方式：燒錄時 esptool 會印出「Crystal is 26MHz」或「Crystal is 40MHz」。
// 目前設為 26 是因為使用者手上這塊板子是 26 MHz；換成 40 MHz 的板子時務必改回 0。
constexpr uint8_t MAIN_XTAL_MHZ = 26;

// ---- 伺服馬達接腳（訊號線，MG90S 的橘色線）----
// 避免使用 GPIO 0/2/5/12/15（開機模式腳位）與 6–11（接內部 Flash）。
constexpr uint8_t LEFT_SERVO_PIN = 18;
constexpr uint8_t RIGHT_SERVO_PIN = 19;

// ---- 伺服安裝方向 ----
// 實際角度 = OPEN_DEG + DIRECTION × 閉眼角度。
// 兩顆伺服若鏡像安裝，把其中一顆改成 OPEN_DEG = 180、DIRECTION = -1。
constexpr int16_t LEFT_OPEN_DEG = 0;
constexpr int8_t LEFT_DIRECTION = +1;
constexpr int16_t RIGHT_OPEN_DEG = 0;
constexpr int8_t RIGHT_DIRECTION = +1;

// ---- 安全上限 ----
// 韌體願意接受的最大閉眼角度（度）。前端送來超過這個值的設定會被拒絕，
// 前端無法繞過。請依實際機構量測結果調低；90 只是與前端展示範圍一致的預設值，
// 不是人體安全值。
constexpr uint8_t MAX_CLOSE_ANGLE_DEG = 90;

// 伺服轉動速度上限（度／秒）。進入或離開夜間模式、套用新角度時，目標角度會瞬間改變；
// 這個上限讓馬達以受控的速度移動，而不是全速甩過去。
// 眨眼本身的速度由閉眼／睜眼時間決定，只有在超過這個上限時才會被限制。
constexpr float MAX_SERVO_SPEED_DEG_PER_SECOND = 300.0f;

// ---- MG90S 脈波規格 ----
constexpr uint32_t SERVO_FREQUENCY_HZ = 50;
constexpr uint8_t SERVO_PWM_RESOLUTION_BITS = 16;
constexpr uint32_t SERVO_MIN_PULSE_US = 500;   // 對應 0°
constexpr uint32_t SERVO_MAX_PULSE_US = 2400;  // 對應 180°
constexpr int16_t SERVO_MAX_PHYSICAL_DEG = 180;
// 核心 2.x 需要指定 LEDC 通道；核心 3.x 會自動配置，這兩個值不會用到。
constexpr uint8_t LEFT_SERVO_CHANNEL = 0;
constexpr uint8_t RIGHT_SERVO_CHANNEL = 1;

// ---- 更新頻率 ----
constexpr uint32_t LOOP_INTERVAL_MS = 10;            // 主迴圈與伺服更新週期
constexpr uint32_t STATUS_ACTIVE_INTERVAL_MS = 100;  // 眨眼進行中的狀態回報週期
constexpr uint32_t STATUS_IDLE_INTERVAL_MS = 1000;   // 靜止時的狀態回報週期

}  // namespace config
}  // namespace blink
