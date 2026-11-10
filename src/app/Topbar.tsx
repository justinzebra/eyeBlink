import { ChevronRight } from 'lucide-react';
import { useDeviceText } from '../hooks/useDeviceText';
import { useDeviceStore } from '../stores';

export function Topbar({ pageTitle }: { pageTitle: string }) {
  const connected = useDeviceStore((state) => state.status.connected);
  const text = useDeviceText();

  return (
    <header className="topbar">
      <div>
        設備工作台 <ChevronRight size={14} /> <strong>{pageTitle}</strong>
      </div>
      <div>
        <span className="tag">{text.modeTag}</span>
        <span className={connected ? 'connection connected' : 'connection'}>
          <i />
          {connected ? text.connected : '設備未連線'}
        </span>
      </div>
    </header>
  );
}
