// 設備時鐘。ESP32 沒有電池供電的時鐘，斷電後就不知道現在幾點，
// 必須由前端在每次連線時送來本地時間。未對時前，自動夜間排程不會啟動。
#pragma once

#include <stdint.h>

namespace blink {

struct LocalTime {
  bool synced;       // false 代表還沒對時，其餘欄位無意義
  uint8_t weekday;   // 0 為週日
  uint16_t minutes;  // 從午夜起算的分鐘數
};

class DeviceClock {
 public:
  // 每圈主迴圈呼叫一次，傳入 millis()。內部累加成 64 位元，不會有 49 天溢位問題。
  void tick(uint32_t millisNow);

  // 開機後經過的毫秒數。眨眼計時一律用這個，不受對時影響。
  uint64_t uptimeMs() const { return uptimeMs_; }

  // 以「本地時間秒數」對時：UTC 秒數加上時區位移，由前端算好送來。
  void setLocalEpoch(uint32_t localEpochSeconds);

  bool synced() const { return synced_; }
  uint32_t localEpochSeconds() const;
  LocalTime localTime() const;

 private:
  uint64_t uptimeMs_ = 0;
  uint32_t lastMillis_ = 0;
  bool started_ = false;
  bool synced_ = false;
  uint32_t baseEpochSeconds_ = 0;
  uint64_t baseUptimeMs_ = 0;
};

}  // namespace blink
