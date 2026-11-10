// 把設定存進 ESP32 的 NVS（斷電後仍保留）。
#pragma once

#include "settings.h"

namespace blink {

enum class LoadResult : uint8_t {
  Loaded,  // 讀到有效設定
  Empty,   // 從未儲存過（剛燒錄的設備）
  Failed,  // 儲存區無法開啟，或內容無效
};

class SettingsStorage {
 public:
  // 讀取已儲存的設定。只有 Loaded 時才會寫入 out。
  LoadResult load(Settings& out);

  // 寫入並讀回確認。只有確實寫入成功才回傳 true。
  bool save(const Settings& settings);
};

}  // namespace blink
