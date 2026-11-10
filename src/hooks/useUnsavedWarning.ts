import { useEffect } from 'react';

/** 有未儲存的修改時，關閉或重新整理分頁前請瀏覽器跳出確認。 */
export function useUnsavedWarning(hasUnsavedChanges: boolean): void {
  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);
}
