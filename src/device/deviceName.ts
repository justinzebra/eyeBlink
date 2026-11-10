export const DEFAULT_DEVICE_NAME = '桌面模擬設備';
export const DEVICE_NAME_MAX_LENGTH = 30;

/** 回傳去除前後空白的名稱；不合法時回傳 `null`。 */
export function normalizeDeviceName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= DEVICE_NAME_MAX_LENGTH ? trimmed : null;
}
