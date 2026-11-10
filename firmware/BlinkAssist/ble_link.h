// 藍牙 GATT 服務。只負責收發位元組，不含任何業務邏輯：
// 收到的指令放進佇列，由主迴圈取出處理，避免在藍牙工作執行緒裡動馬達或寫 Flash。
#pragma once

#include <stddef.h>
#include <stdint.h>

#include "protocol.h"

namespace blink {

struct Command {
  uint8_t seq;
  uint8_t opcode;
  uint8_t payload[protocol::COMMAND_MAX_PAYLOAD];
  uint8_t payloadLength;
  bool oversized;  // payload 超過上限，內容已捨棄
};

class BleLink {
 public:
  void begin(const char* deviceName);

  bool connected() const;

  // 取出一筆待處理的指令；沒有時回傳 false。
  bool takeCommand(Command& out);

  // 回覆指令結果。前端收到這個通知才會認定操作成功或失敗。
  void sendResult(uint8_t seq, uint8_t opcode, protocol::ResultCode code, uint8_t detail = 0);

  // 更新可讀取的值；notify 為 true 且有連線時同時推送通知。
  void publishStatus(const uint8_t status[protocol::STATUS_SIZE], bool notify);
  void setSavedSettings(const uint8_t blob[protocol::SETTINGS_BLOB_SIZE]);
  void setActiveSettings(const uint8_t blob[protocol::SETTINGS_BLOB_SIZE]);
};

}  // namespace blink
