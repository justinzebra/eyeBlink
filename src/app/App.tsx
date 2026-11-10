import { Bluetooth, ShieldCheck } from 'lucide-react';
import { ConnectionButton } from '../components/ConnectionButton';
import { useDeviceText } from '../hooks/useDeviceText';
import { useDeviceClock } from '../hooks/useDeviceClock';
import { useHashRoute } from '../hooks/useHashRoute';
import { useSettingsSync } from '../hooks/useSettingsSync';
import { useUnsavedWarning } from '../hooks/useUnsavedWarning';
import { useDeviceStore } from '../stores';
import { findPage } from './pages';
import { Sidebar } from './Sidebar';
import { StatusBanner } from './StatusBanner';
import { Topbar } from './Topbar';

export default function App() {
  useDeviceClock();
  const [route, navigate] = useHashRoute();
  const { isDirty } = useSettingsSync();
  useUnsavedWarning(isDirty);
  const busy = useDeviceStore((state) => state.pending !== null);
  const text = useDeviceText();
  const page = findPage(route);
  const Page = page.component;

  return (
    <div className="app-shell">
      <Sidebar activePageId={page.id} onNavigate={navigate} />
      <div className="main-shell">
        <Topbar pageTitle={page.title} />
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">眨眼輔助控制系統</span>
              <h1>{page.title}</h1>
              <p>{page.subtitle}</p>
            </div>
            <ConnectionButton icon={Bluetooth} iconSize={18} />
          </div>
          <StatusBanner />
          {/* 操作進行中時停用整頁表單，避免送出互相衝突的指令。 */}
          <fieldset disabled={busy} className="page-content">
            <Page />
          </fieldset>
          <footer className="main-footer">
            <ShieldCheck size={15} /> {text.footer}
          </footer>
        </main>
      </div>
    </div>
  );
}
