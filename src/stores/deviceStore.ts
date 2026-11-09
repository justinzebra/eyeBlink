import { create } from 'zustand';
import { mockDevice } from '../services/mockDeviceService';
import { clone } from '../types/settings';
import type { DeviceSnapshot, OperationState } from '../types/device';
import { useSettingsStore } from './settingsStore';
interface DeviceState extends DeviceSnapshot {
  operation: OperationState; busy: boolean; notice: string; error: string;
  run: (action: 'connect'|'disconnect'|'read'|'save'|'apply'|'blink'|'restart'|'manual'|'rename'|'time', value?: string | boolean | Date | null) => Promise<void>;
}
export const useDeviceStore = create<DeviceState>((set,get) => ({
  ...mockDevice.snapshot(), operation: '設備未連線', busy: false, notice: '', error: '',
  run: async (action,value) => {
    if (get().busy) return;
    set({ busy: true, error: '', notice: '', ...(action === 'save' ? {operation: '儲存中'} : action === 'apply' ? {operation: '套用中'} : {}) });
    try {
      const settings = useSettingsStore.getState();
      if (action === 'connect' || action === 'restart') {
        await mockDevice[action](); settings.load(await mockDevice.readSettings());
        useSettingsStore.setState({applied: clone(mockDevice.snapshot().active)});
        set({operation:'已套用',notice: action === 'restart' ? '模擬設備已重新啟動，並從持久化儲存區載入設定' : '已連接模擬設備'});
      } else if (action === 'disconnect') { await mockDevice.disconnect(); set({operation:'設備未連線',notice:'已中斷模擬連線'}); }
      else if (action === 'read') { settings.load(await mockDevice.readSettings()); set({operation:'已儲存',notice:'已讀取設備儲存設定，取代尚未儲存的編輯'}); }
      else if (action === 'save') {
        const candidate = clone(settings.draft); await mockDevice.saveSettings(candidate);
        useSettingsStore.setState({saved:candidate}); set({operation:'已儲存',notice:'設定已寫入模擬設備儲存區，請按套用設定使其生效'});
      } else if (action === 'apply') {
        if (JSON.stringify(settings.draft) !== JSON.stringify(settings.saved)) throw new Error('請先儲存目前修改，再套用設定');
        await mockDevice.applySettings(); useSettingsStore.setState({applied:clone(mockDevice.snapshot().active)});
        set({operation:'已套用',notice:'模擬設備已套用儲存設定'});
      } else if (action === 'manual') {
        await mockDevice.setManualNight(Boolean(value)); settings.edit(s => { s.nightMode.manualEnabled = Boolean(value); });
        set({notice:'手動指令已在模擬設備生效；需儲存設定才會在重新啟動後保留'});
      } else if (action === 'blink') { await mockDevice.simulateBlink(); set({notice:'模擬完整眨眼循環已開始，使用目前已套用的時間參數'}); }
      else if (action === 'rename') { await mockDevice.rename(String(value)); set({notice:'模擬設備名稱已儲存'}); }
      else if (action === 'time') { mockDevice.setSimulationTime(value instanceof Date ? value : null); set({notice:'模擬設備時鐘已更新'}); }
    } catch (error) {
      set({error: error instanceof Error ? error.message : '操作失敗', ...(action === 'save' ? {operation:'儲存失敗'} : !get().status.connected ? {operation:'設備未連線'} : action === 'apply' ? {operation:'已儲存'} : {})});
    } finally { set({busy:false}); }
  },
}));
mockDevice.subscribe(snapshot => useDeviceStore.setState(snapshot));
