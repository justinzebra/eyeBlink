import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStorageRepository } from '../device/mock/deviceRepository';
import { MockDeviceService } from '../device/mock/mockDeviceService';
import { MemoryStorage } from '../test/memoryStorage';
import { createDeviceStore } from './deviceStore';
import { createSettingsStore } from './settingsStore';
import { resolveSyncState, type SyncState } from './syncState';

const SAVE_DELAY_MS = 350;

function setup({ withSimulation = true } = {}) {
  const storage = new MemoryStorage();
  const device = new MockDeviceService({ repository: createStorageRepository(() => storage) });
  const settings = createSettingsStore();
  const store = createDeviceStore({
    device,
    simulation: withSimulation ? device : null,
    settings,
  });

  const syncState = (): SyncState => {
    const { pending, status, active } = store.getState();
    const { draft, saved } = settings.getState();
    return resolveSyncState({ pending, connected: status.connected, draft, saved, active });
  };
  const save = async () => {
    const pending = store.getState().saveSettings();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    await pending;
  };

  return { storage, device, settings, store, syncState, save };
}

describe('deviceStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T12:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  it('初始為未連線', () => {
    const { store, syncState } = setup();

    expect(store.getState().status.connected).toBe(false);
    expect(syncState()).toBe('disconnected');
  });

  it('連線後載入設備設定並顯示已套用', async () => {
    const { store, syncState } = setup();

    await store.getState().connect();

    expect(store.getState().status.connected).toBe(true);
    expect(store.getState().notice).toBe('已連接模擬設備');
    expect(syncState()).toBe('applied');
  });

  it('編輯 → 儲存 → 套用，同步狀態依序變化', async () => {
    const { store, settings, syncState, save } = setup();
    await store.getState().connect();

    settings.getState().patchDayMode({ intervalMs: 120_000 });
    expect(syncState()).toBe('unsaved');

    await save();
    expect(syncState()).toBe('unapplied');
    expect(store.getState().active.dayMode.intervalMs).toBe(600_000);

    await store.getState().applySettings();
    expect(syncState()).toBe('applied');
    expect(store.getState().active.dayMode.intervalMs).toBe(120_000);
  });

  it('儲存進行中顯示儲存中，並忽略同時送出的其他操作', async () => {
    const { store, settings, syncState } = setup();
    await store.getState().connect();
    settings.getState().patchDayMode({ intervalMs: 120_000 });

    const pending = store.getState().saveSettings();
    expect(syncState()).toBe('saving');
    await store.getState().disconnect();
    expect(store.getState().status.connected).toBe(true);

    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    await pending;
    expect(store.getState().pending).toBeNull();
  });

  it('有未儲存修改時拒絕套用', async () => {
    const { store, settings } = setup();
    await store.getState().connect();
    settings.getState().patchDayMode({ intervalMs: 120_000 });

    await store.getState().applySettings();

    expect(store.getState().error).toBe('請先儲存目前修改，再套用設定');
    expect(store.getState().active.dayMode.intervalMs).toBe(600_000);
  });

  it('儲存失敗時顯示錯誤，draft 保留且仍為尚未儲存', async () => {
    const { store, settings, storage, syncState, save } = setup();
    await store.getState().connect();
    settings.getState().patchDayMode({ intervalMs: 120_000 });
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    await save();

    expect(store.getState().error).toContain('模擬儲存失敗');
    expect(store.getState().notice).toBe('');
    expect(settings.getState().draft.dayMode.intervalMs).toBe(120_000);
    expect(syncState()).toBe('unsaved');
  });

  it('讀取設定會取代未儲存的編輯', async () => {
    const { store, settings } = setup();
    await store.getState().connect();
    settings.getState().patchDayMode({ intervalMs: 120_000 });

    await store.getState().readSettings();

    expect(settings.getState().draft.dayMode.intervalMs).toBe(600_000);
  });

  it('手動夜間立即生效且不影響設定同步狀態，重新啟動後回到關閉', async () => {
    const { store, syncState } = setup();
    await store.getState().connect();

    await store.getState().setManualNight(true);
    expect(store.getState().status.mode).toBe('night');
    expect(store.getState().status.source).toBe('manual');
    expect(store.getState().notice).toContain('手動夜間已開啟');
    expect(syncState()).toBe('applied');

    await store.getState().restart();
    expect(store.getState().status.mode).toBe('day');
    expect(store.getState().status.source).toBe('day');
  });

  it('未連線時操作失敗並顯示錯誤，不殘留進行中狀態', async () => {
    const { store } = setup();

    await store.getState().simulateBlink();

    expect(store.getState().error).toContain('未連線');
    expect(store.getState().pending).toBeNull();
  });

  it('中斷連線後回到未連線', async () => {
    const { store, syncState } = setup();
    await store.getState().connect();

    await store.getState().disconnect();

    expect(syncState()).toBe('disconnected');
    expect(store.getState().notice).toBe('已中斷模擬連線');
  });

  it('模擬工具：改名與模擬時鐘', async () => {
    const { store } = setup();
    await store.getState().connect();

    await store.getState().rename('床邊設備');
    await store.getState().setSimulationTime(new Date('2030-01-01T08:00:00'));

    expect(store.getState().status.name).toBe('床邊設備');
    expect(store.getState().status.now).toBe(new Date('2030-01-01T08:00:00').toISOString());
  });

  it('設備不提供模擬工具時，模擬指令被拒絕且 tick 不做事', async () => {
    const { store } = setup({ withSimulation: false });
    await store.getState().connect();

    await store.getState().rename('床邊設備');

    expect(store.getState().canSimulate).toBe(false);
    expect(store.getState().error).toBe('此設備不支援模擬工具');
    expect(() => store.getState().tick()).not.toThrow();
  });

  it('狀態沒有變化時 tick 不會觸發訂閱者', async () => {
    const { store } = setup();
    await store.getState().connect();
    const listener = vi.fn();
    store.subscribe(listener);

    store.getState().tick();
    store.getState().tick();
    expect(listener).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    store.getState().tick();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
