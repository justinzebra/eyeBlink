import { useCallback, useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

const readRoute = (): string => window.location.hash.replace(/^#\/?/, '');
const readServerRoute = (): string => '';

/**
 * 把目前頁面存在網址的 hash（例如 `#/night`），
 * 重新整理或分享連結時會停留在同一頁，瀏覽器上一頁也能使用。
 */
export function useHashRoute(): [route: string, navigate: (route: string) => void] {
  const route = useSyncExternalStore(subscribe, readRoute, readServerRoute);
  const navigate = useCallback((next: string) => {
    window.location.hash = '/' + next;
  }, []);
  return [route, navigate];
}
