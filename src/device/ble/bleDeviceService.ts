import type { DeviceService, FirmwareSafetyGate } from '../deviceService';

export const BLE_UUIDS = {
  service: '12345678-1234-1234-1234-123456789000',
  settings: '12345678-1234-1234-1234-123456789001',
  status: '12345678-1234-1234-1234-123456789002',
} as const;

// 第二階段才實作 Web Bluetooth。禁止把 JSON 一次直接寫入 characteristic。
// 傳輸需協議版本、交易 ID、序號/總片數、長度、校驗、重組、ACK、逾時及重試。
export interface BlePacket {
  transactionId: string;
  sequence: number;
  total: number;
  payload: Uint8Array;
  checksum: string;
}

export interface BleTransport {
  requestDevice(): Promise<void>;
  send(packet: BlePacket): Promise<void>;
  waitForAck(transactionId: string, sequence: number): Promise<void>;
}

/**
 * 預留的實體設備進入點。完成機械與醫療安全驗證前一律拒絕建立，
 * 並且只回傳 `DeviceService`（不含 `SimulationTools`）。
 */
export function createBleDeviceService(safetyGate: FirmwareSafetyGate): DeviceService {
  void safetyGate;
  throw new Error('真實藍牙控制尚未開放；目前僅允許模擬設備');
}
