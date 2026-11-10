import {
  CLOSED_POSE,
  OPEN_POSE,
  advanceTimeline,
  poseAt,
  restartTimeline,
  startBlink,
  type BlinkTimeline,
} from '../../domain/blinkTimeline';
import { isScheduleActive, nextScheduleBoundary } from '../../domain/schedule';
import { cloneSettings, defaultSettings, type BlinkSettings } from '../../domain/settings';
import { validateSettings } from '../../domain/validation';
import { DEFAULT_DEVICE_NAME, DEVICE_NAME_MAX_LENGTH, normalizeDeviceName } from '../deviceName';
import type { SimulatedDeviceService } from '../deviceService';
import type { DeviceListener, DeviceSnapshot, ModeSource } from '../types';
import { noopLock, type DeviceLock } from './deviceLock';
import type { DeviceRepository } from './deviceRepository';

const FIRMWARE_VERSION = '模擬韌體 1.0.0';
/** 模擬寫入設備儲存區所需的時間。 */
const SAVE_DELAY_MS = 350;
const MS_PER_SECOND = 1000;

export interface MockDeviceOptions {
  repository: DeviceRepository;
  lock?: DeviceLock;
}

const toIso = (time: number): string => new Date(time).toISOString();
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 本機模擬設備。維護以下狀態：
 * - `saved`：已寫入儲存區，重新啟動時載入
 * - `active`：實際執行中，只有 `applySettings` 會改變
 * - `manualNight`：手動夜間，即時指令，不儲存；連線或重新啟動後一律為關閉
 * - `timeline`：眨眼時間軸，由時鐘推進
 *
 * 所有設定物件都以不可變方式替換，因此可以安全地把參考交給訂閱者。
 */
export class MockDeviceService implements SimulatedDeviceService {
  private readonly repository: DeviceRepository;
  private readonly lock: DeviceLock;
  private readonly listeners = new Set<DeviceListener>();
  private saved = cloneSettings(defaultSettings);
  private active = cloneSettings(defaultSettings);
  private name = DEFAULT_DEVICE_NAME;
  private connected = false;
  private manualNight = false;
  private lastSync: string | null = null;
  /** 第一次連線前沒有時間軸，模型保持睜眼。 */
  private timeline: BlinkTimeline | null = null;
  private clockOffsetMs = 0;

  constructor({ repository, lock = noopLock }: MockDeviceOptions) {
    this.repository = repository;
    this.lock = lock;
  }

  async connect(): Promise<void> {
    const wasConnected = this.connected;
    if (!(await this.lock.acquire())) {
      throw new Error('模擬設備已在另一個分頁連線，請先在該分頁中斷連線');
    }
    try {
      const persisted = this.repository.load();
      this.saved = persisted?.settings ?? cloneSettings(defaultSettings);
      this.name = persisted?.name ?? DEFAULT_DEVICE_NAME;
    } catch (error) {
      if (!wasConnected) this.lock.release();
      throw error;
    }
    this.active = cloneSettings(this.saved);
    this.manualNight = false;
    this.connected = true;
    this.resetTimeline();
    this.markSynced();
    this.notify();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.lock.release();
    this.notify();
  }

  async readSettings(): Promise<BlinkSettings> {
    this.requireConnection();
    this.markSynced();
    this.notify();
    return cloneSettings(this.saved);
  }

  async saveSettings(settings: BlinkSettings): Promise<void> {
    this.requireConnection();
    const errors = validateSettings(settings);
    if (errors.length > 0) throw new Error(errors.join('；'));
    const candidate = cloneSettings(settings);

    await delay(SAVE_DELAY_MS);
    this.requireConnection();
    try {
      this.repository.save({ settings: candidate, name: this.name });
    } catch {
      throw new Error('模擬儲存失敗：空間不足或瀏覽器禁止儲存，原設定未變更');
    }
    this.saved = candidate;
    this.markSynced();
    this.notify();
  }

  async applySettings(): Promise<void> {
    this.requireConnection();
    this.active = cloneSettings(this.saved);
    this.resetTimeline();
    this.markSynced();
    this.notify();
  }

  async setManualNight(enabled: boolean): Promise<void> {
    this.requireConnection();
    this.manualNight = enabled;
    this.resetTimeline();
    this.notify();
  }

  async simulateBlink(): Promise<void> {
    this.requireConnection();
    const now = this.now();
    if (this.modeSource(now) !== 'day') throw new Error('請先解除夜間模式再模擬眨眼');
    const timeline = this.syncTimeline(now);
    if (timeline !== null && timeline.blinkStart !== null) throw new Error('眨眼循環進行中');
    this.timeline = startBlink(now, this.active.dayMode.intervalMs);
    this.notify();
  }

  async restart(): Promise<void> {
    this.requireConnection();
    await this.connect();
  }

  async rename(name: string): Promise<void> {
    this.requireConnection();
    const normalized = normalizeDeviceName(name);
    if (normalized === null) throw new Error(`設備名稱須為 1 至 ${DEVICE_NAME_MAX_LENGTH} 個字`);
    try {
      this.repository.save({ settings: this.saved, name: normalized });
    } catch {
      throw new Error('設備名稱儲存失敗，請確認本機儲存空間與網站權限');
    }
    this.name = normalized;
    this.notify();
  }

  setSimulationTime(date: Date | null): void {
    this.requireConnection();
    if (date && !Number.isFinite(date.getTime())) throw new Error('請輸入有效的模擬時間');
    this.clockOffsetMs = date ? date.getTime() - Date.now() : 0;
    this.resetTimeline();
    this.notify();
  }

  tick(): void {
    this.notify();
  }

  /** 先把模擬時鐘推進到現在，再回傳當下狀態。 */
  snapshot(): DeviceSnapshot {
    const now = this.now();
    const source = this.modeSource(now);
    const isNight = source !== 'day';
    const timeline = this.syncTimeline(now);
    const { dayMode, nightMode, motor } = this.active;
    const pose = isNight ? CLOSED_POSE : timeline ? poseAt(timeline, dayMode, now) : OPEN_POSE;
    const angle = (closeAngle: number | null) =>
      closeAngle === null ? null : pose.progress * closeAngle;
    const hasNextBlink = !isNight && dayMode.enabled && timeline !== null;

    return {
      active: this.active,
      status: {
        connected: this.connected,
        kind: 'mock',
        name: this.name,
        firmware: FIRMWARE_VERSION,
        mode: isNight ? 'night' : dayMode.enabled ? 'day' : 'idle',
        source,
        phase: pose.phase,
        progress: pose.progress,
        leftAngle: angle(motor.left.closeAngle),
        rightAngle: angle(motor.right.closeAngle),
        nextSchedule: nextScheduleBoundary(nightMode, new Date(now)),
        nextBlink: hasNextBlink ? toIso(timeline.nextBlinkAt) : null,
        lastSync: this.lastSync,
        now: toIso(Math.floor(now / MS_PER_SECOND) * MS_PER_SECOND),
      },
    };
  }

  subscribe(listener: DeviceListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private now(): number {
    return Date.now() + this.clockOffsetMs;
  }

  private requireConnection(): void {
    if (!this.connected) throw new Error('設備未連線，請先連接模擬設備');
  }

  private modeSource(now: number): ModeSource {
    if (this.manualNight) return 'manual';
    return isScheduleActive(this.active.nightMode, new Date(now)) ? 'schedule' : 'day';
  }

  private resetTimeline(): void {
    this.timeline = restartTimeline(this.now(), this.active.dayMode.intervalMs);
  }

  private syncTimeline(now: number): BlinkTimeline | null {
    if (this.timeline === null) return null;
    const isNight = this.modeSource(now) !== 'day';
    this.timeline = advanceTimeline(this.timeline, this.active.dayMode, now, isNight);
    return this.timeline;
  }

  private markSynced(): void {
    this.lastSync = toIso(Date.now());
  }

  private notify(): void {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
