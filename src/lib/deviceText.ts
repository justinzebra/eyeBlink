import type { DeviceKind } from '../device/types';

/** 會隨設備類型改變的介面文字。新增設備類型時 TypeScript 會要求補齊這裡。 */
export interface DeviceText {
  /** 設備的稱呼，例如「模擬設備」。 */
  deviceLabel: string;
  modeTag: string;
  connect: string;
  connected: string;
  /** 狀態列右側的提醒。 */
  scopeNote: string;
  /** 即時模型右上角的標籤，說明畫面上的姿態從哪裡來。 */
  modelTag: string;
  blinkOnce: string;
  restart: string;
  footer: string;
  sidebarTitle: string;
  sidebarNote: string;
  sidebarTag: string;
  /** 馬達設定頁最上方的角度說明。 */
  angleNote: string;
  /** 實機模式才有的常駐警告；模擬模式為 null。 */
  warning: string | null;
}

const DEVICE_TEXT: Record<DeviceKind, DeviceText> = {
  mock: {
    deviceLabel: '模擬設備',
    modeTag: '模擬模式',
    connect: '連接模擬設備',
    connected: '模擬設備已連線',
    scopeNote: '所有動作僅在桌面模型中模擬',
    modelTag: '純軟體模擬',
    blinkOnce: '模擬執行一次眨眼',
    restart: '模擬設備重新啟動',
    footer: '僅供桌面模型展示與模擬，尚未通過醫療安全驗證。',
    sidebarTitle: '安心從模擬開始',
    sidebarNote: '目前僅供軟體模型測試，不會輸出實體馬達訊號。',
    sidebarTag: '模擬模式',
    angleNote:
      '角度僅供桌面模型展示與模擬。0–90° 是軟體展示範圍，並非人體安全範圍，也不代表已完成機械校正。',
    warning: null,
  },
  ble: {
    deviceLabel: 'ESP32 設備',
    modeTag: '實機模式',
    connect: '連接 ESP32 設備',
    connected: 'ESP32 已連線',
    scopeNote: '指令會讓實體馬達轉動',
    modelTag: '設備回報狀態',
    blinkOnce: '執行一次眨眼',
    restart: '重新載入設備設定',
    footer: '實機模式僅供桌面模型測試，尚未通過醫療安全驗證，請勿裝在人身上。',
    sidebarTitle: '實機測試中',
    sidebarNote: '指令會驅動實體伺服馬達。僅限桌面模型，請勿裝在人身上。',
    sidebarTag: '實機模式',
    angleNote:
      '套用後角度會直接送到實體伺服馬達，請從小角度開始測試。0–90° 是軟體允許輸入的範圍，並非人體安全範圍；實際上限由韌體 config.h 的 MAX_CLOSE_ANGLE_DEG 決定，超過會被設備拒絕。',
    warning: '實機模式：儲存並套用的設定會讓實體馬達轉動。僅限桌面模型測試，請勿裝在人身上。',
  },
};

export function deviceText(kind: DeviceKind): DeviceText {
  return DEVICE_TEXT[kind];
}
