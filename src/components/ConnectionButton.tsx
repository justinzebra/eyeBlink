import { Link, Unlink, type LucideIcon } from 'lucide-react';
import { useDeviceText } from '../hooks/useDeviceText';
import { useDeviceStore } from '../stores';

interface ConnectionButtonProps {
  /** 覆寫圖示；預設依連線狀態顯示連結／中斷圖示。 */
  icon?: LucideIcon;
  iconSize?: number;
}

export function ConnectionButton({ icon, iconSize = 17 }: ConnectionButtonProps) {
  const connected = useDeviceStore((state) => state.status.connected);
  const busy = useDeviceStore((state) => state.pending !== null);
  const connect = useDeviceStore((state) => state.connect);
  const disconnect = useDeviceStore((state) => state.disconnect);
  const text = useDeviceText();
  const Icon = icon ?? (connected ? Unlink : Link);

  return (
    <button
      type="button"
      className="secondary"
      disabled={busy}
      onClick={connected ? disconnect : connect}
    >
      <Icon size={iconSize} />
      {connected ? '中斷連線' : text.connect}
    </button>
  );
}
