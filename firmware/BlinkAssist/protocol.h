// 藍牙通訊協議常數。必須與前端 src/device/ble/protocol.ts 以及
// docs/ble-protocol.md 保持一致；三者任何一處修改都要同步另外兩處。
#pragma once

#include <stddef.h>
#include <stdint.h>

namespace blink {
namespace protocol {

constexpr uint8_t PROTOCOL_VERSION = 1;

constexpr char SERVICE_UUID[] = "12345678-1234-1234-1234-123456789000";
constexpr char SAVED_SETTINGS_UUID[] = "12345678-1234-1234-1234-123456789001";   // READ
constexpr char STATUS_UUID[] = "12345678-1234-1234-1234-123456789002";           // READ, NOTIFY
constexpr char COMMAND_UUID[] = "12345678-1234-1234-1234-123456789003";          // WRITE
constexpr char RESULT_UUID[] = "12345678-1234-1234-1234-123456789004";           // NOTIFY
constexpr char ACTIVE_SETTINGS_UUID[] = "12345678-1234-1234-1234-123456789005";  // READ

constexpr size_t SETTINGS_BLOB_SIZE = 20;
constexpr size_t STATUS_SIZE = 16;
constexpr size_t RESULT_SIZE = 4;
constexpr size_t COMMAND_HEADER_SIZE = 2;  // seq + opcode
constexpr size_t COMMAND_MAX_PAYLOAD = SETTINGS_BLOB_SIZE;

constexpr uint8_t ANGLE_UNSET = 0xFF;
constexpr uint32_t NO_NEXT_BLINK = 0xFFFFFFFF;

enum class Opcode : uint8_t {
  SaveSettings = 0x01,    // payload：20 bytes 設定
  ApplySettings = 0x02,   // 無 payload
  SetManualNight = 0x03,  // payload：1 byte（0 關、1 開）
  BlinkNow = 0x04,        // 無 payload
  Reload = 0x05,          // 無 payload；重新載入已儲存設定並重設執行狀態
  SetTime = 0x06,         // payload：uint32 本地時間秒數
};

enum class ResultCode : uint8_t {
  Ok = 0,
  Malformed = 1,        // 長度不對
  UnknownOpcode = 2,
  InvalidSettings = 3,  // detail 為 SettingsError
  StorageFailed = 4,
  NightActive = 5,      // 夜間模式中，不可手動眨眼
  BlinkInProgress = 6,
};

}  // namespace protocol
}  // namespace blink
