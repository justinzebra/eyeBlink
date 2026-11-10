import { useEffect } from 'react';
import { useDeviceStore } from '../stores';

/** 畫面更新頻率。動作依實際時間計算，所以分頁被節流也不會走樣。 */
const TICK_INTERVAL_MS = 50;

/** 定期推進模擬設備的時鐘。整個應用程式只需在根元件呼叫一次。 */
export function useDeviceClock(): void {
  const tick = useDeviceStore((state) => state.tick);
  useEffect(() => {
    const timer = window.setInterval(tick, TICK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [tick]);
}
