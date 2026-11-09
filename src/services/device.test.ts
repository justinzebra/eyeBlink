import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clone,defaultSettings,validateSettings } from '../types/settings';
import { scheduleActive,nextSchedule } from './schedule';
class MemoryStorage implements Storage {
  data = new Map<string,string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  key(index:number) { return [...this.data.keys()][index]??null; }
  getItem(key:string) { return this.data.get(key)??null; }
  setItem(key:string,value:string) { this.data.set(key,value); }
  removeItem(key:string) { this.data.delete(key); }
}
vi.stubGlobal('localStorage',new MemoryStorage());
const {MockDeviceService,STORAGE_KEY} = await import('./mockDeviceService');
describe('排程邊界',()=>{
  const settings=clone(defaultSettings);
  settings.nightMode={manualEnabled:false,scheduleEnabled:true,startTime:'22:00',endTime:'07:00',weekdays:[1]};
  it('以開始日判定跨日，包含開始、不包含結束',()=>{
    expect(scheduleActive(settings,new Date('2026-11-09T21:59:59'))).toBe(false);
    expect(scheduleActive(settings,new Date('2026-11-09T22:00:00'))).toBe(true);
    expect(scheduleActive(settings,new Date('2026-11-10T06:59:59'))).toBe(true);
    expect(scheduleActive(settings,new Date('2026-11-10T07:00:00'))).toBe(false);
    expect(scheduleActive(settings,new Date('2026-11-10T22:00:00'))).toBe(false);
  });
  it('非跨日與週日跨週一',()=>{
    const s=clone(settings); s.nightMode.startTime='09:00'; s.nightMode.endTime='17:00';
    expect(scheduleActive(s,new Date('2026-11-09T12:00:00'))).toBe(true);
    expect(scheduleActive(s,new Date('2026-11-09T17:00:00'))).toBe(false);
    s.nightMode={...settings.nightMode,weekdays:[0]};
    expect(scheduleActive(s,new Date('2026-11-09T02:00:00'))).toBe(true);
  });
  it('找出跨日的下次結束邊界',()=>{
    expect(nextSchedule(settings,new Date('2026-11-10T03:00:00'))).toBe(new Date('2026-11-10T07:00:00').toISOString());
  });
});
describe('設備儲存與執行',()=>{
  beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-09T12:00:00'));});
  afterEach(()=>vi.useRealTimers());
  async function save(device:InstanceType<typeof MockDeviceService>,settings:typeof defaultSettings) {
    const promise=device.saveSettings(settings); await vi.advanceTimersByTimeAsync(350); await promise;
  }
  it('未連線不可讀寫或動作',async()=>{
    const d=new MockDeviceService(new MemoryStorage());
    await expect(d.readSettings()).rejects.toThrow('未連線');
    await expect(d.saveSettings(defaultSettings)).rejects.toThrow('未連線');
    await expect(d.applySettings()).rejects.toThrow('未連線');
    await expect(d.simulateBlink()).rejects.toThrow('未連線');
  });
  it('儲存與套用獨立，重啟讀取持久化設定',async()=>{
    const storage=new MemoryStorage(),d=new MockDeviceService(storage); await d.connect();
    const s=clone(defaultSettings);s.dayMode.intervalMs=120000;
    await save(d,s); expect(d.snapshot().active.dayMode.intervalMs).toBe(600000);
    await d.applySettings();expect(d.snapshot().active.dayMode.intervalMs).toBe(120000);
    await d.setManualNight(true);expect(d.snapshot().status.mode).toBe('night');
    await d.restart();expect(d.snapshot().status.mode).toBe('day');
    const another=new MockDeviceService(storage);await another.connect();expect((await another.readSettings()).dayMode.intervalMs).toBe(120000);
  });
  it('完整眨眼經歷閉眼、停留、睜眼並回到零',async()=>{
    const d=new MockDeviceService(new MemoryStorage());await d.connect();
    const s=clone(defaultSettings);s.motor.left.closeAngle=30;s.motor.right.closeAngle=40;
    await save(d,s);await d.applySettings();await d.simulateBlink();
    await vi.advanceTimersByTimeAsync(250);expect(d.snapshot().status.leftAngle).toBe(15);
    await vi.advanceTimersByTimeAsync(250);expect(d.snapshot().status.phase).toBe('hold');
    await vi.advanceTimersByTimeAsync(300);expect(d.snapshot().status.phase).toBe('opening');
    await vi.advanceTimersByTimeAsync(500);expect(d.snapshot().status.phase).toBe('open');expect(d.snapshot().status.rightAngle).toBe(0);
  });
  it('日間自動眨眼依開始至開始間隔執行',async()=>{
    const d=new MockDeviceService(new MemoryStorage());await d.connect();
    await vi.advanceTimersByTimeAsync(600000);expect(d.snapshot().status.phase).toBe('closing');
    await vi.advanceTimersByTimeAsync(1300);expect(d.snapshot().status.phase).toBe('open');
    await vi.advanceTimersByTimeAsync(598700);expect(d.snapshot().status.phase).toBe('closing');
  });
  it('停用日間模式不執行自動眨眼',async()=>{
    const d=new MockDeviceService(new MemoryStorage());await d.connect();const s=clone(defaultSettings);s.dayMode.enabled=false;
    await save(d,s);await d.applySettings();await vi.advanceTimersByTimeAsync(600000);expect(d.snapshot().status.phase).toBe('open');expect(d.snapshot().status.mode).toBe('idle');
  });
  it('手動夜間優先，解除後重新判斷排程並在結束返回日間',async()=>{
    const d=new MockDeviceService(new MemoryStorage());await d.connect();const s=clone(defaultSettings);
    s.nightMode={manualEnabled:false,scheduleEnabled:true,startTime:'22:00',endTime:'07:00',weekdays:[1]};
    await save(d,s);await d.applySettings();await d.setManualNight(true);
    expect(d.snapshot().status.source).toBe('manual');
    d.setSimulationTime(new Date('2026-11-10T03:00:00'));await d.setManualNight(false);
    expect(d.snapshot().status.source).toBe('schedule');expect(d.snapshot().status.mode).toBe('night');
    d.setSimulationTime(new Date('2026-11-10T07:00:00'));expect(d.snapshot().status.mode).toBe('day');
  });
  it('儲存失敗不能覆蓋已儲存值',async()=>{
    const storage=new MemoryStorage(),d=new MockDeviceService(storage);await d.connect();
    vi.spyOn(storage,'setItem').mockImplementation(()=>{throw new Error('空間不足');});
    const pending=d.saveSettings(defaultSettings);const check=expect(pending).rejects.toThrow('空間不足');await vi.advanceTimersByTimeAsync(350);await check;
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });
  it('損壞資料不會假裝連線成功',async()=>{
    const storage=new MemoryStorage();storage.setItem(STORAGE_KEY,JSON.stringify({settings:{version:99}}));
    const d=new MockDeviceService(storage);await expect(d.connect()).rejects.toThrow('損壞');expect(d.snapshot().status.connected).toBe(false);
  });
  it('驗證拒絕錯誤時間、角度及重疊眨眼',()=>{
    const s=clone(defaultSettings);s.dayMode.intervalMs=1000;s.motor.left.closeAngle=180;s.nightMode.startTime='25:00';
    expect(validateSettings(s).length).toBeGreaterThanOrEqual(3);
  });
});
