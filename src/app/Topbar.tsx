import { ChevronRight } from 'lucide-react';
import { useDeviceStore } from '../stores';

export function Topbar({ pageTitle }: { pageTitle: string }) {
  const connected = useDeviceStore((state) => state.status.connected);

  return (
    <header className="topbar">
      <div>
        設備工作台 <ChevronRight size={14} /> <strong>{pageTitle}</strong>
      </div>
      <div>
        <span className="tag">模擬模式</span>
        <span className={connected ? 'connection connected' : 'connection'}>
          <i />
          {connected ? '模擬設備已連線' : '設備未連線'}
        </span>
      </div>
    </header>
  );
}
