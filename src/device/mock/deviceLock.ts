/** 確保同一時間只有一個分頁連接模擬設備，避免兩個分頁互相覆蓋儲存資料。 */
export interface DeviceLock {
  /** 取得鎖；已被其他分頁持有時回傳 `false`。重複呼叫是安全的。 */
  acquire(): Promise<boolean>;
  release(): void;
}

/** 不做任何互斥；用於測試，或瀏覽器不支援 Web Locks 時的退路。 */
export const noopLock: DeviceLock = {
  acquire: async () => true,
  release: () => {},
};

/**
 * 以 Web Locks API 實作跨分頁互斥。鎖會持有到 `release()`，
 * 分頁關閉或當機時瀏覽器會自動釋放，不會留下殘鎖。
 */
export function createWebLock(name: string, locks: LockManager | undefined): DeviceLock {
  if (!locks) return noopLock;
  let releaseHeld: (() => void) | null = null;

  return {
    acquire() {
      if (releaseHeld) return Promise.resolve(true);
      return new Promise<boolean>((resolve, reject) => {
        locks
          .request(name, { ifAvailable: true }, (lock) => {
            if (!lock) {
              resolve(false);
              return undefined;
            }
            // 回傳的 Promise 完成前，瀏覽器會一直持有這把鎖。
            return new Promise<void>((done) => {
              releaseHeld = () => {
                releaseHeld = null;
                done();
              };
              resolve(true);
            });
          })
          .catch(reject);
      });
    },
    release() {
      releaseHeld?.();
    },
  };
}
