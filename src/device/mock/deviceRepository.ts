import { cloneSettings, type BlinkSettings } from '../../domain/settings';
import { isValidSettings, validateSettings } from '../../domain/validation';
import { DEFAULT_DEVICE_NAME, normalizeDeviceName } from '../deviceName';

// v2：眨眼間隔範圍改為 1–10 秒。舊鍵（v1）裡的資料可能超出新範圍，換鍵後不再讀取。
export const STORAGE_KEY = 'blink-assist.mock-device.v2';

export interface PersistedDevice {
  settings: BlinkSettings;
  name: string;
}

/** 模擬設備的持久化儲存區（對應未來 ESP32 的 NVS）。 */
export interface DeviceRepository {
  /** 沒有資料時回傳 `null`；無法讀取或資料損壞時丟出錯誤。 */
  load(): PersistedDevice | null;
  /** 寫入失敗時丟出錯誤，原有資料保持不變。 */
  save(device: PersistedDevice): void;
}

/**
 * 以 Web Storage 實作。傳入取得函式而非物件本身，
 * 因為瀏覽器禁止網站儲存時，光是存取 `localStorage` 就會丟出例外。
 */
export function createStorageRepository(getStorage: () => Storage): DeviceRepository {
  function read(): string | null {
    try {
      return getStorage().getItem(STORAGE_KEY);
    } catch {
      throw new Error('無法讀取模擬設備儲存區，請確認瀏覽器允許網站儲存資料');
    }
  }

  function parse(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error('模擬儲存資料損壞，無法解析設定');
    }
  }

  return {
    load() {
      const raw = read();
      if (!raw) return null;

      const parsed = parse(raw);
      const record = typeof parsed === 'object' && parsed !== null ? parsed : {};
      const { settings, name } = record as { settings?: unknown; name?: unknown };
      if (!isValidSettings(settings)) {
        throw new Error('模擬儲存資料損壞：' + validateSettings(settings).join('、'));
      }
      return {
        settings: cloneSettings(settings),
        name: normalizeDeviceName(name) ?? DEFAULT_DEVICE_NAME,
      };
    },

    save(device) {
      getStorage().setItem(STORAGE_KEY, JSON.stringify(device));
    },
  };
}
