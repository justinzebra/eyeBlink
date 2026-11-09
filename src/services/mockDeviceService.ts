import { clone, defaultSettings, validateSettings, type BlinkSettings } from '../types/settings';
import type { DeviceSnapshot, DeviceStatus } from '../types/device';
import type { DeviceService } from './deviceService';
import { nextSchedule, scheduleActive } from './schedule';
export const STORAGE_KEY = 'blink-assist.mock-device.v1';
export class MockDeviceService implements DeviceService {
  private saved = clone(defaultSettings);
  private active = clone(defaultSettings);
  private connected = false;
  private listeners = new Set<(snapshot: DeviceSnapshot) => void>();
  private lastSync: string | null = null;
  private blinkStart: number | null = null;
  private nextBlinkAt = 0;
  private clockOffset = 0;
  private name = '桌面模擬設備';
  constructor(private storage: Storage = localStorage) {
    // 讀取發生在 connect；損壞資料不可偷偷顯示為已讀取成功。
  }
  private now() { return Date.now() + this.clockOffset; }
  private requireConnection() { if (!this.connected) throw new Error('設備未連線，請先連接模擬設備'); }
  private load() {
    let raw: string | null;
    try { raw = this.storage.getItem(STORAGE_KEY); }
    catch { throw new Error('無法讀取模擬設備儲存區，請確認瀏覽器允許網站儲存資料'); }
    if (!raw) { this.saved = clone(defaultSettings); return; }
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { throw new Error('模擬儲存資料損壞，無法解析設定'); }
    const errors = validateSettings(parsed?.settings);
    if (errors.length) throw new Error('模擬儲存資料損壞：' + errors.join('、'));
    this.saved = clone(parsed.settings);
    this.name = typeof parsed.name === 'string' ? parsed.name : '桌面模擬設備';
  }
  async connect() {
    this.load(); this.active = clone(this.saved); this.connected = true;
    this.nextBlinkAt = this.now() + this.active.dayMode.intervalMs;
    this.blinkStart = null; this.lastSync = new Date().toISOString(); this.emit();
  }
  async disconnect() { this.connected = false; this.emit(); }
  async readSettings() { this.requireConnection(); this.lastSync = new Date().toISOString(); this.emit(); return clone(this.saved); }
  async saveSettings(settings: BlinkSettings) {
    this.requireConnection(); const candidate = clone(settings);
    const errors = validateSettings(candidate); if (errors.length) throw new Error(errors.join('；'));
    await new Promise(resolve => setTimeout(resolve, 350));
    this.requireConnection();
    try { this.storage.setItem(STORAGE_KEY, JSON.stringify({ settings: candidate, name: this.name })); }
    catch { throw new Error('模擬儲存失敗：空間不足或瀏覽器禁止儲存，原設定未變更'); }
    this.saved = candidate; this.lastSync = new Date().toISOString(); this.emit();
  }
  async applySettings() {
    this.requireConnection(); this.active = clone(this.saved); this.blinkStart = null;
    this.nextBlinkAt = this.now() + this.active.dayMode.intervalMs;
    this.lastSync = new Date().toISOString(); this.emit();
  }
  async setManualNight(enabled: boolean) {
    this.requireConnection(); this.active.nightMode.manualEnabled = enabled;
    this.blinkStart = null; this.nextBlinkAt = this.now() + this.active.dayMode.intervalMs; this.emit();
  }
  async simulateBlink() {
    this.requireConnection();
    if (this.active.nightMode.manualEnabled || scheduleActive(this.active,new Date(this.now()))) throw new Error('請先解除夜間模式再模擬眨眼');
    if (this.blinkStart !== null) throw new Error('眨眼循環進行中');
    this.blinkStart = this.now(); this.nextBlinkAt = this.now() + this.active.dayMode.intervalMs; this.emit();
  }
  async restart() { this.requireConnection(); await this.connect(); }
  async rename(name: string) {
    this.requireConnection(); if (!name.trim() || name.trim().length > 30) throw new Error('設備名稱須為 1 至 30 個字');
    try { this.storage.setItem(STORAGE_KEY,JSON.stringify({ settings: this.saved, name: name.trim() })); }
    catch { throw new Error('設備名稱儲存失敗，請確認本機儲存空間與網站權限'); }
    this.name = name.trim(); this.emit();
  }
  setSimulationTime(date: Date | null) {
    this.requireConnection(); if (date && !Number.isFinite(+date)) throw new Error('請輸入有效的模擬時間');
    this.clockOffset = date ? +date - Date.now() : 0; this.blinkStart = null;
    this.nextBlinkAt = this.now() + this.active.dayMode.intervalMs; this.emit();
  }
  snapshot(): DeviceSnapshot {
    const now = this.now(), d = this.active.dayMode;
    const manual = this.active.nightMode.manualEnabled, scheduled = scheduleActive(this.active,new Date(now));
    const night = manual || scheduled;
    let phase: DeviceStatus['phase'] = night ? 'hold' : 'open', progress = night ? 1 : 0;
    if (night) { this.blinkStart = null; this.nextBlinkAt = now + d.intervalMs; }
    else {
      if (this.blinkStart === null && d.enabled && this.nextBlinkAt > 0 && now >= this.nextBlinkAt) {
        this.blinkStart = this.nextBlinkAt + Math.floor((now-this.nextBlinkAt)/d.intervalMs)*d.intervalMs;
        this.nextBlinkAt = this.blinkStart + d.intervalMs;
      }
      if (this.blinkStart !== null) {
        const elapsed = now-this.blinkStart;
        if (elapsed < d.closeDurationMs) { phase = 'closing'; progress = elapsed/d.closeDurationMs; }
        else if (elapsed < d.closeDurationMs+d.closedHoldMs) { phase = 'hold'; progress = 1; }
        else if (elapsed < d.closeDurationMs+d.closedHoldMs+d.openDurationMs) { phase = 'opening'; progress = 1-(elapsed-d.closeDurationMs-d.closedHoldMs)/d.openDurationMs; }
        else this.blinkStart = null;
      }
    }
    return { active: clone(this.active), status: { connected: this.connected, kind: 'mock', name: this.name, firmware: '模擬韌體 1.0.0', mode: night ? 'night' : d.enabled ? 'day' : 'idle', source: manual ? 'manual' : scheduled ? 'schedule' : 'day', phase, progress,
      leftAngle: this.active.motor.left.closeAngle === null ? null : progress*this.active.motor.left.closeAngle,
      rightAngle: this.active.motor.right.closeAngle === null ? null : progress*this.active.motor.right.closeAngle,
      nextSchedule: nextSchedule(this.active,new Date(now)), nextBlink: !night && d.enabled && this.nextBlinkAt > 0 ? new Date(this.nextBlinkAt).toISOString() : null, lastSync: this.lastSync, now: new Date(now).toISOString() } };
  }
  emit() { const snapshot = this.snapshot(); this.listeners.forEach(fn => fn(snapshot)); }
  subscribe(listener: (snapshot: DeviceSnapshot) => void) { this.listeners.add(listener); listener(this.snapshot()); return () => { this.listeners.delete(listener); }; }
}
export const mockDevice = new MockDeviceService();
