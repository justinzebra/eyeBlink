import { renderToString } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../test/memoryStorage';
import { PAGES, findPage } from './pages';

// 冒煙測試：在沒有瀏覽器的環境下，確認每一頁都能完成第一次渲染而不出錯。
describe('App', () => {
  beforeAll(() => {
    vi.stubGlobal('window', { localStorage: new MemoryStorage() });
  });

  it('未連線時渲染總覽頁與同步狀態', async () => {
    const { default: App } = await import('./App');

    const html = renderToString(<App />);

    expect(html).toContain('控制總覽');
    expect(html).toContain('設備未連線');
    expect(html).toContain('連接模擬設備');
  });

  it.each(PAGES.map((page) => [page.title, page] as const))('%s 頁可以渲染', (_title, page) => {
    const Page = page.component;

    expect(() => renderToString(<Page />)).not.toThrow();
  });

  it('未知或空白的路由回到第一頁', () => {
    expect(findPage('')).toBe(PAGES[0]);
    expect(findPage('unknown')).toBe(PAGES[0]);
    expect(findPage('night').title).toBe('夜間模式');
  });
});
