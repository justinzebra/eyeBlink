import { BLE_UUIDS, ResultCode } from '../device/ble/protocol';

/** 測試用的假 ESP32：以最少的行為模擬韌體的 GATT 服務。 */

class FakeCharacteristic extends EventTarget {
  value: DataView | null = null;
  onWrite: (bytes: Uint8Array) => void = () => {};

  set(bytes: number[] | Uint8Array): void {
    this.value = new DataView(Uint8Array.from(bytes).buffer);
  }

  /** 更新值並送出通知。 */
  emit(bytes: number[] | Uint8Array): void {
    this.set(bytes);
    this.dispatchEvent(new Event('characteristicvaluechanged'));
  }

  readValue = async (): Promise<DataView> => {
    if (!this.value) throw new Error('no value');
    return this.value;
  };

  writeValueWithResponse = async (bytes: Uint8Array): Promise<void> => {
    this.onWrite(Uint8Array.from(bytes));
  };

  startNotifications = async (): Promise<this> => this;
}

export interface FakeStatusOptions {
  protocolVersion?: number;
  /** 見 docs/ble-protocol.md 的狀態旗標；預設為日間、睜眼、已對時。 */
  flags?: number;
  progress?: number;
  leftAngle?: number;
  rightAngle?: number;
  localEpochSeconds?: number;
  msUntilNextBlink?: number;
}

export function statusBytes({
  protocolVersion = 1,
  flags = 0x41,
  progress = 0,
  leftAngle = 0xff,
  rightAngle = 0xff,
  localEpochSeconds = 1_800_000_000,
  msUntilNextBlink = 600_000,
}: FakeStatusOptions = {}): Uint8Array {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  bytes.set([protocolVersion, 1, 0, flags, progress, leftAngle, rightAngle, 0]);
  view.setUint32(8, localEpochSeconds, true);
  view.setUint32(12, msUntilNextBlink, true);
  return bytes;
}

export interface SentCommand {
  seq: number;
  opcode: number;
  payload: number[];
}

export class FakeEsp32 {
  readonly device: BluetoothDevice;
  readonly commands: SentCommand[] = [];
  /** 下一個指令要回覆的結果；`null` 代表不回覆（模擬逾時）。用過即恢復成功。 */
  nextResult: { code: number; detail?: number } | null = { code: ResultCode.ok };
  connectCount = 0;
  /** 每收到一個指令就呼叫；用來在指令處理途中插入事件（例如狀態通知）。 */
  onCommand: () => void = () => {};
  /** 設為 true 時，寫入指令會直接失敗（模擬連線品質不佳）。 */
  failWrites = false;

  private readonly characteristics = {
    [BLE_UUIDS.savedSettings]: new FakeCharacteristic(),
    [BLE_UUIDS.activeSettings]: new FakeCharacteristic(),
    [BLE_UUIDS.status]: new FakeCharacteristic(),
    [BLE_UUIDS.command]: new FakeCharacteristic(),
    [BLE_UUIDS.result]: new FakeCharacteristic(),
  };
  private readonly target = new EventTarget();

  constructor(settingsBlob: Uint8Array, name = 'BlinkAssist') {
    this.setSaved(settingsBlob);
    this.setActive(settingsBlob);
    this.characteristics[BLE_UUIDS.status].set(statusBytes());
    this.characteristics[BLE_UUIDS.command].onWrite = (bytes) => this.handleCommand(bytes);

    const service = {
      getCharacteristic: async (uuid: string) => {
        const characteristic = this.characteristics[uuid as keyof typeof this.characteristics];
        if (!characteristic) throw new Error('characteristic not found: ' + uuid);
        return characteristic;
      },
    };
    const gatt = {
      connect: async () => {
        this.connectCount += 1;
        return { getPrimaryService: async () => service };
      },
      disconnect: () => this.dropConnection(),
    };
    this.device = Object.assign(this.target, { name, gatt }) as unknown as BluetoothDevice;
  }

  /** 假的 `navigator.bluetooth`：使用者在選擇視窗選了這台設備。 */
  get bluetooth(): Bluetooth {
    return { requestDevice: async () => this.device } as unknown as Bluetooth;
  }

  setSaved(blob: Uint8Array): void {
    this.characteristics[BLE_UUIDS.savedSettings].set(blob);
  }

  setActive(blob: Uint8Array): void {
    this.characteristics[BLE_UUIDS.activeSettings].set(blob);
  }

  setStatus(options: FakeStatusOptions): void {
    this.characteristics[BLE_UUIDS.status].set(statusBytes(options));
  }

  notifyStatus(options: FakeStatusOptions): void {
    this.characteristics[BLE_UUIDS.status].emit(statusBytes(options));
  }

  /** 模擬設備斷電或超出範圍。 */
  dropConnection(): void {
    this.target.dispatchEvent(new Event('gattserverdisconnected'));
  }

  private handleCommand(bytes: Uint8Array): void {
    if (this.failWrites) throw new DOMException('GATT operation failed', 'NetworkError');
    const [seq, opcode, ...payload] = bytes;
    this.commands.push({ seq, opcode, payload });
    this.onCommand();
    const result = this.nextResult;
    this.nextResult = { code: ResultCode.ok };
    if (result === null) return;
    // 真實設備在主迴圈處理後才回覆，所以結果一定晚於寫入完成。
    queueMicrotask(() =>
      this.characteristics[BLE_UUIDS.result].emit([seq, opcode, result.code, result.detail ?? 0]),
    );
  }
}
