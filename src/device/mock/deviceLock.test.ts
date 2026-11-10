import { describe, expect, it } from 'vitest';
import { createWebLock, noopLock } from './deviceLock';

/** 模擬瀏覽器的 Web Locks：同名的鎖同時只能有一個持有者。 */
function createFakeLockManager(): LockManager {
  const held = new Set<string>();
  const request = async (
    name: string,
    _options: LockOptions,
    callback: (lock: Lock | null) => unknown,
  ) => {
    if (held.has(name)) return callback(null);
    held.add(name);
    try {
      return await callback({ name, mode: 'exclusive' });
    } finally {
      held.delete(name);
    }
  };
  return { request, query: async () => ({}) } as unknown as LockManager;
}

describe('createWebLock', () => {
  it('第一個分頁取得鎖，第二個分頁被拒絕', async () => {
    const locks = createFakeLockManager();
    const firstTab = createWebLock('device', locks);
    const secondTab = createWebLock('device', locks);

    expect(await firstTab.acquire()).toBe(true);
    expect(await secondTab.acquire()).toBe(false);
  });

  it('釋放後其他分頁可以取得', async () => {
    const locks = createFakeLockManager();
    const firstTab = createWebLock('device', locks);
    const secondTab = createWebLock('device', locks);
    await firstTab.acquire();

    firstTab.release();
    await Promise.resolve();

    expect(await secondTab.acquire()).toBe(true);
  });

  it('同一個分頁重複取得仍視為成功，重複釋放不會出錯', async () => {
    const lock = createWebLock('device', createFakeLockManager());

    expect(await lock.acquire()).toBe(true);
    expect(await lock.acquire()).toBe(true);
    lock.release();
    expect(() => lock.release()).not.toThrow();
  });

  it('瀏覽器不支援 Web Locks 時退回不互斥', async () => {
    const lock = createWebLock('device', undefined);

    expect(lock).toBe(noopLock);
    expect(await lock.acquire()).toBe(true);
    expect(() => lock.release()).not.toThrow();
  });
});
