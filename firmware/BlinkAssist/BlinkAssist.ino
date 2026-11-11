// Blink Assist 韌體 —— ESP32-WROOM-32 + 兩顆 MG90S
//
// 【重要】目前僅供桌面模型測試。尚未完成機械限位、力量限制、故障釋放與
// 醫療安全驗證，請勿裝在人身上。
//
// 開發板選「ESP32 Dev Module」。不需要安裝額外函式庫。
// 接線、燒錄步驟與通訊協議見 firmware/README.md 與 docs/ble-protocol.md。
//
// 檔案分工：
//   config.h            接腳、伺服方向、安全上限（換硬體只改這裡）
//   protocol.h          藍牙協議常數（須與前端一致）
//   settings.*          設定結構、驗證、編解碼
//   settings_storage.*  NVS 斷電保存
//   device_clock.*      開機時間與對時
//   blink_engine.*      眨眼與日夜模式狀態機
//   servo_driver.*      PWM 輸出
//   ble_link.*          藍牙收發
//   本檔                把以上接起來：處理指令、更新馬達、回報狀態

#include <Arduino.h>
#include <string.h>

#include "soc/rtc.h"

#include "ble_link.h"
#include "blink_engine.h"
#include "config.h"
#include "device_clock.h"
#include "protocol.h"
#include "servo_driver.h"
#include "settings.h"
#include "settings_storage.h"

using namespace blink;

namespace {

SettingsStorage storage;
DeviceClock deviceClock;
BlinkEngine engine;
ServoDriver servos;
BleLink ble;

// 已寫入 NVS 的設定。engine 內的是「執行中」的設定，兩者只有在套用後才一致。
Settings savedSettings = defaultSettings();

uint8_t lastStatus[protocol::STATUS_SIZE] = {0};
uint64_t lastStatusNotifyMs = 0;

void publishSavedSettings() {
  uint8_t blob[protocol::SETTINGS_BLOB_SIZE];
  encodeSettings(savedSettings, blob);
  ble.setSavedSettings(blob);
}

void publishActiveSettings() {
  uint8_t blob[protocol::SETTINGS_BLOB_SIZE];
  encodeSettings(engine.settings(), blob);
  ble.setActiveSettings(blob);
}

// 讓執行中的設定等於已儲存的設定。
void applySavedSettings() {
  engine.setSettings(savedSettings, deviceClock.uptimeMs());
  publishActiveSettings();
}

// ---- 指令處理：每個函式回傳要回覆給前端的結果 ----

struct Outcome {
  protocol::ResultCode code;
  uint8_t detail;
};

const Outcome OK = {protocol::ResultCode::Ok, 0};
const Outcome MALFORMED = {protocol::ResultCode::Malformed, 0};

Outcome handleSaveSettings(const Command& command) {
  Settings candidate;
  const SettingsError error = decodeSettings(command.payload, command.payloadLength, candidate);
  if (error != SettingsError::None) {
    return {protocol::ResultCode::InvalidSettings, static_cast<uint8_t>(error)};
  }
  // 確認寫入 NVS 成功後才更新記憶體中的值並回覆成功。
  if (!storage.save(candidate)) return {protocol::ResultCode::StorageFailed, 0};
  savedSettings = candidate;
  publishSavedSettings();
  return OK;
}

Outcome handleSetManualNight(const Command& command) {
  if (command.payloadLength != 1 || command.payload[0] > 1) return MALFORMED;
  engine.setManualNight(command.payload[0] == 1, deviceClock.uptimeMs());
  return OK;
}

Outcome handleBlinkNow() {
  switch (engine.requestBlink(deviceClock.uptimeMs())) {
    case BlinkRequest::NightActive:
      return {protocol::ResultCode::NightActive, 0};
    case BlinkRequest::InProgress:
      return {protocol::ResultCode::BlinkInProgress, 0};
    case BlinkRequest::Started:
      break;
  }
  return OK;
}

Outcome handleReload() {
  Settings loaded = defaultSettings();
  // 讀取失敗時維持現狀並回報失敗，不要悄悄換成預設值；從未儲存過則使用預設值。
  if (storage.load(loaded) == LoadResult::Failed) return {protocol::ResultCode::StorageFailed, 0};
  savedSettings = loaded;
  publishSavedSettings();
  engine.setManualNight(false, deviceClock.uptimeMs());
  applySavedSettings();
  return OK;
}

Outcome handleSetTime(const Command& command) {
  if (command.payloadLength != 4) return MALFORMED;
  uint32_t localEpochSeconds;
  memcpy(&localEpochSeconds, command.payload, sizeof(localEpochSeconds));  // ESP32 為 little-endian
  deviceClock.setLocalEpoch(localEpochSeconds);
  return OK;
}

Outcome handleCommand(const Command& command) {
  if (command.oversized) return MALFORMED;

  switch (static_cast<protocol::Opcode>(command.opcode)) {
    case protocol::Opcode::SaveSettings:
      return handleSaveSettings(command);
    case protocol::Opcode::ApplySettings:
      if (command.payloadLength != 0) return MALFORMED;
      applySavedSettings();
      return OK;
    case protocol::Opcode::SetManualNight:
      return handleSetManualNight(command);
    case protocol::Opcode::BlinkNow:
      if (command.payloadLength != 0) return MALFORMED;
      return handleBlinkNow();
    case protocol::Opcode::Reload:
      if (command.payloadLength != 0) return MALFORMED;
      return handleReload();
    case protocol::Opcode::SetTime:
      return handleSetTime(command);
  }
  return {protocol::ResultCode::UnknownOpcode, 0};
}

void processCommands() {
  Command command;
  while (ble.takeCommand(command)) {
    const Outcome outcome = handleCommand(command);
    // 立刻重新判斷模式，讓同一圈內的下一個指令看到最新狀態（例如剛開啟手動夜間後的眨眼請求）。
    engine.update(deviceClock.uptimeMs(), deviceClock.localTime());
    ble.sendResult(command.seq, command.opcode, outcome.code, outcome.detail);
  }
}

// ---- 馬達與狀態回報 ----

// 未設定參考角度的那一側保持在睜眼位置，不轉動。
float closeAngleFor(uint8_t referenceAngle, float progress) {
  return referenceAngle == protocol::ANGLE_UNSET ? 0.0f : progress * referenceAngle;
}

// 回報實際送給伺服的角度（已套用速度限制），而不是目標角度。
uint8_t reportedAngle(uint8_t referenceAngle, Side side) {
  if (referenceAngle == protocol::ANGLE_UNSET) return protocol::ANGLE_UNSET;
  return static_cast<uint8_t>(servos.closeAngle(side) + 0.5f);
}

void driveServos() {
  const Pose pose = engine.pose();
  const Settings& settings = engine.settings();
  servos.writeCloseAngle(Side::Left, closeAngleFor(settings.leftCloseAngle, pose.progress));
  servos.writeCloseAngle(Side::Right, closeAngleFor(settings.rightCloseAngle, pose.progress));
}

// 位元組配置見 docs/ble-protocol.md。
void buildStatus(uint8_t out[protocol::STATUS_SIZE]) {
  const Pose pose = engine.pose();
  const Settings& settings = engine.settings();
  const uint32_t localEpoch = deviceClock.localEpochSeconds();
  const uint32_t nextBlink = engine.msUntilNextBlink(deviceClock.uptimeMs());

  out[0] = protocol::PROTOCOL_VERSION;
  out[1] = config::FIRMWARE_VERSION_MAJOR;
  out[2] = config::FIRMWARE_VERSION_MINOR;
  out[3] = static_cast<uint8_t>(static_cast<uint8_t>(engine.mode()) |
                                (static_cast<uint8_t>(engine.source()) << 2) |
                                (static_cast<uint8_t>(pose.phase) << 4) |
                                (deviceClock.synced() ? 0x40 : 0));
  out[4] = static_cast<uint8_t>(pose.progress * 255.0f + 0.5f);
  out[5] = reportedAngle(settings.leftCloseAngle, Side::Left);
  out[6] = reportedAngle(settings.rightCloseAngle, Side::Right);
  out[7] = 0;
  memcpy(out + 8, &localEpoch, sizeof(localEpoch));
  memcpy(out + 12, &nextBlink, sizeof(nextBlink));
}

// 模式、來源、階段或對時狀態改變時立刻通知；眨眼進行中每 100ms、其餘每秒通知一次。
void reportStatus() {
  uint8_t status[protocol::STATUS_SIZE];
  buildStatus(status);

  const uint64_t now = deviceClock.uptimeMs();
  const bool moving = engine.pose().phase != Phase::Open && engine.mode() != Mode::Night;
  const uint32_t interval =
      moving ? config::STATUS_ACTIVE_INTERVAL_MS : config::STATUS_IDLE_INTERVAL_MS;
  const bool flagsChanged = status[3] != lastStatus[3];  // 模式、來源、階段、對時狀態
  const bool due = now - lastStatusNotifyMs >= interval;
  if (!flagsChanged && !due) return;

  ble.publishStatus(status, true);
  memcpy(lastStatus, status, sizeof(lastStatus));
  lastStatusNotifyMs = now;
}

}  // namespace

// 板子的主晶振不是 40 MHz 時，把時脈更正為實際頻率。
// 做法與 Arduino 核心對 F_XTAL_MHZ 的處理相同：更新晶振頻率、暫時切到晶振時脈，
// 再重新鎖定 PLL 回到原本的 CPU 頻率。
static void correctMainXtal() {
  if (config::MAIN_XTAL_MHZ == 0) {
    return;
  }
  rtc_clk_xtal_freq_update((rtc_xtal_freq_t)config::MAIN_XTAL_MHZ);
  rtc_clk_cpu_freq_set_xtal();
  setCpuFrequencyMhz(F_CPU / 1000000);
}

void setup() {
  // 一定要最先做：伺服 PWM、計時與藍牙都依賴正確的時脈。
  correctMainXtal();

  // 先把馬達移到睜眼位置，再做其他初始化。
  servos.begin();
  deviceClock.tick(millis());

  // 沒有資料或讀取失敗時維持預設值：角度未設定，馬達不會動。
  storage.load(savedSettings);
  engine.setSettings(savedSettings, deviceClock.uptimeMs());

  ble.begin(config::DEVICE_NAME);
  publishSavedSettings();
  publishActiveSettings();

  uint8_t status[protocol::STATUS_SIZE];
  buildStatus(status);
  ble.publishStatus(status, false);
}

void loop() {
  deviceClock.tick(millis());
  processCommands();
  engine.update(deviceClock.uptimeMs(), deviceClock.localTime());
  driveServos();
  reportStatus();
  delay(config::LOOP_INTERVAL_MS);
}
