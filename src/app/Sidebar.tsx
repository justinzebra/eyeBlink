import { ChevronRight, Eye, ShieldCheck } from 'lucide-react';
import { PAGES } from './pages';

interface SidebarProps {
  activePageId: string;
  onNavigate: (pageId: string) => void;
}

export function Sidebar({ activePageId, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">
          <Eye size={28} />
        </div>
        <div>
          <strong>眨眼輔助</strong>
          <small>智慧照護控制系統</small>
        </div>
      </div>
      <div className="sidebar-label">設備工作台</div>
      <nav aria-label="主要頁面">
        {PAGES.map((page) => {
          const isActive = page.id === activePageId;
          return (
            <button
              key={page.id}
              type="button"
              className={isActive ? 'active' : ''}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onNavigate(page.id)}
            >
              <page.icon size={20} />
              {page.title}
              {isActive && <ChevronRight size={16} />}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="safe-icon">
          <ShieldCheck size={22} />
        </div>
        <strong>安心從模擬開始</strong>
        <p>
          目前僅供軟體模型測試，
          <br />
          不會輸出實體馬達訊號。
        </p>
        <span className="tag teal">第一階段 · 模擬模式</span>
      </div>
      <div className="sidebar-footer">眨眼輔助控制系統 · 版本 1.0</div>
    </aside>
  );
}
