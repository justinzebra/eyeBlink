import { deviceText, type DeviceText } from '../lib/deviceText';
import { useDeviceStore } from '../stores';

/** 依目前的設備類型（模擬／實機）取得對應的介面文字。 */
export function useDeviceText(): DeviceText {
  return deviceText(useDeviceStore((state) => state.status.kind));
}
