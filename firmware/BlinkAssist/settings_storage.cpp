#include "settings_storage.h"

#include <Preferences.h>
#include <string.h>

namespace blink {

namespace {
constexpr char NAMESPACE[] = "blink";
constexpr char SETTINGS_KEY[] = "settings";
constexpr bool READ_WRITE = false;
}  // namespace

LoadResult SettingsStorage::load(Settings& out) {
  // 以讀寫模式開啟：命名空間不存在時會自動建立，這樣才能分辨「從未儲存」與「開啟失敗」。
  Preferences preferences;
  if (!preferences.begin(NAMESPACE, READ_WRITE)) return LoadResult::Failed;
  if (!preferences.isKey(SETTINGS_KEY)) {
    preferences.end();
    return LoadResult::Empty;
  }

  uint8_t blob[protocol::SETTINGS_BLOB_SIZE];
  const size_t length = preferences.getBytes(SETTINGS_KEY, blob, sizeof(blob));
  preferences.end();
  if (length != sizeof(blob)) return LoadResult::Failed;

  // 以與藍牙相同的解碼與驗證把關；韌體升級後規則變嚴時，舊資料會被視為無效。
  return decodeSettings(blob, length, out) == SettingsError::None ? LoadResult::Loaded
                                                                   : LoadResult::Failed;
}

bool SettingsStorage::save(const Settings& settings) {
  uint8_t blob[protocol::SETTINGS_BLOB_SIZE];
  encodeSettings(settings, blob);

  Preferences preferences;
  if (!preferences.begin(NAMESPACE, READ_WRITE)) return false;
  const size_t written = preferences.putBytes(SETTINGS_KEY, blob, sizeof(blob));

  uint8_t readBack[protocol::SETTINGS_BLOB_SIZE];
  const size_t length = preferences.getBytes(SETTINGS_KEY, readBack, sizeof(readBack));
  preferences.end();

  return written == sizeof(blob) && length == sizeof(blob) &&
         memcmp(blob, readBack, sizeof(blob)) == 0;
}

}  // namespace blink
