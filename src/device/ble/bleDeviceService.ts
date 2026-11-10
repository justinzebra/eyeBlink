import { nextScheduleBoundary } from '../../domain/schedule';
import { cloneSettings, defaultSettings, type BlinkSettings } from '../../domain/settings';
import { validateSettings } from '../../domain/validation';
import type { DeviceService } from '../deviceService';
import type { DeviceListener, DeviceSnapshot, DeviceStatus } from '../types';
import {
  BLE_UUIDS,
  Opcode,
  PROTOCOL_VERSION,
  ResultCode,
  decodeResult,
  decodeSettings,
  decodeStatus,
  encodeCommand,
  encodeSettings,
  encodeTimePayload,
  resultMessage,
  type BleStatus,
  type CommandResult,
} from './protocol';

const DEFAULT_NAME = 'ESP32 設備';
/** 等待設備回覆指令結果的上限。寫入 NVS 通常在數十毫秒內完成。 */
const COMMAND_TIMEOUT_MS = 5000;
const SEQ_MODULO = 256;
const MS_PER_SECOND = 1000;
/** 設備每次回報的「距離下次眨眼」會有些微抖動；差距小於這個值就沿用舊的顯示時間。 */
const NEXT_BLINK_TOLERANCE_MS = 1500;

const UNSUPPORTED_MESSAGE =
  '此瀏覽器不支援 Web Bluetooth。請使用電腦版 Chrome 或 Edge，並以 localhost 或 HTTPS 開啟';
const NOT_CONNECTED_MESSAGE = '設備未連線，請先連接 ESP32 設備';

interface Channels {
  savedSettings: BluetoothRemoteGATTCharacteristic;
  activeSettings: BluetoothRemoteGATTCharacteristic;
  status: BluetoothRemoteGATTCharacteristic;
  command: BluetoothRemoteGATTCharacteristic;
  result: BluetoothRemoteGATTCharacteristic;
}

interface PendingResult {
  resolve: (result: CommandResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const toIso = (time: number): string => new Date(time).toISOString();
const floorToSecond = (time: number): number => Math.floor(time / MS_PER_SECOND) * MS_PER_SECOND;

/** 使用者在瀏覽器的設備選擇視窗按了取消。 */
function isChooserCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

/**
 * 透過 Web Bluetooth 連接 ESP32 韌體的實體設備。
 *
 * 這裡不做任何排程或動作計算：設備自己執行，前端只送指令並顯示設備回報的狀態。
 * 每個指令都要等設備回覆結果才算成功；逾時或斷線一律視為失敗。
 * 刻意只實作 `DeviceService`，不提供 `SimulationTools`。
 */
export class BleDeviceService implements DeviceService {
  private readonly listeners = new Set<DeviceListener>();
  private readonly pendingResults = new Map<number, PendingResult>();
  private device: BluetoothDevice | null = null;
  private channels: Channels | null = null;
  /** 初始同步（版本確認、對時、讀回設定）完成後才算連上；在那之前不對外宣稱已連線。 */
  private ready = false;
  private active: BlinkSettings = cloneSettings(defaultSettings);
  private latest: BleStatus | null = null;
  private lastSync: string | null = null;
  private nextBlinkAt: number | null = null;
  private seq = 0;
  /** GATT 同一時間只能進行一個操作，所有讀寫都排進這條佇列。 */
  private gattQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly bluetooth: Bluetooth | undefined) {}

  async connect(): Promise<void> {
    if (!this.bluetooth) throw new Error(UNSUPPORTED_MESSAGE);
    const device = this.device ?? (await this.chooseDevice(this.bluetooth));
    this.device = device;
    try {
      this.channels = await this.openChannels(device);
      await this.synchronize();
    } catch (error) {
      // 下次連線時重新讓使用者選擇設備，避免卡在一台連不上的設備。
      device.removeEventListener('gattserverdisconnected', this.handleDisconnected);
      this.device = null;
      this.teardown('連線未完成');
      device.gatt?.disconnect();
      this.notify();
      throw error;
    }
    this.ready = true;
    this.markSynced();
    this.notify();
  }

  async disconnect(): Promise<void> {
    this.device?.gatt?.disconnect();
    this.teardown('設備已斷線，操作未完成');
    this.notify();
  }

  async readSettings(): Promise<BlinkSettings> {
    const settings = await this.readSettingsFrom(this.requireChannels().savedSettings);
    this.markSynced();
    this.notify();
    return settings;
  }

  async saveSettings(settings: BlinkSettings): Promise<void> {
    this.requireChannels();
    const errors = validateSettings(settings);
    if (errors.length > 0) throw new Error(errors.join('；'));
    await this.sendCommand(Opcode.saveSettings, encodeSettings(settings));
    this.markSynced();
    this.notify();
  }

  async applySettings(): Promise<void> {
    await this.sendCommand(Opcode.applySettings);
    await this.refreshActiveSettings();
    this.markSynced();
    this.notify();
  }

  async setManualNight(enabled: boolean): Promise<void> {
    await this.sendCommand(Opcode.setManualNight, Uint8Array.of(enabled ? 1 : 0));
  }

  async simulateBlink(): Promise<void> {
    await this.sendCommand(Opcode.blinkNow);
  }

  /** 讓設備重新載入已儲存的設定並重設執行狀態；藍牙連線不會中斷。 */
  async restart(): Promise<void> {
    await this.sendCommand(Opcode.reload);
    await this.refreshActiveSettings();
    this.markSynced();
    this.notify();
  }

  snapshot(): DeviceSnapshot {
    return { active: this.active, status: this.buildStatus() };
  }

  subscribe(listener: DeviceListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private get connected(): boolean {
    return this.ready && this.channels !== null;
  }

  private async chooseDevice(bluetooth: Bluetooth): Promise<BluetoothDevice> {
    try {
      const device = await bluetooth.requestDevice({
        filters: [{ services: [BLE_UUIDS.service] }],
      });
      device.addEventListener('gattserverdisconnected', this.handleDisconnected);
      return device;
    } catch (error) {
      if (isChooserCancelled(error)) throw new Error('尚未選擇設備，連線已取消', { cause: error });
      throw error;
    }
  }

  private async openChannels(device: BluetoothDevice): Promise<Channels> {
    if (!device.gatt) throw new Error('這台設備不支援藍牙 GATT 連線');
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(BLE_UUIDS.service);
    const channels: Channels = {
      savedSettings: await service.getCharacteristic(BLE_UUIDS.savedSettings),
      activeSettings: await service.getCharacteristic(BLE_UUIDS.activeSettings),
      status: await service.getCharacteristic(BLE_UUIDS.status),
      command: await service.getCharacteristic(BLE_UUIDS.command),
      result: await service.getCharacteristic(BLE_UUIDS.result),
    };
    channels.result.addEventListener('characteristicvaluechanged', this.handleResult);
    channels.status.addEventListener('characteristicvaluechanged', this.handleStatus);
    await channels.result.startNotifications();
    await channels.status.startNotifications();
    return channels;
  }

  /** 連線後的初始同步：確認協議版本、對時、讀回執行中的設定。 */
  private async synchronize(): Promise<void> {
    const { status } = this.requireChannels();
    const initial = decodeStatus(await this.enqueue(() => status.readValue()));
    if (initial.protocolVersion !== PROTOCOL_VERSION) {
      throw new Error(
        `韌體的通訊協議版本（${initial.protocolVersion}）與前端（${PROTOCOL_VERSION}）不一致，請更新韌體或前端`,
      );
    }
    await this.sendCommand(Opcode.setTime, encodeTimePayload(new Date()));
    await this.refreshActiveSettings();
    this.acceptStatus(decodeStatus(await this.enqueue(() => status.readValue())));
  }

  private async refreshActiveSettings(): Promise<void> {
    this.active = await this.readSettingsFrom(this.requireChannels().activeSettings);
  }

  private async readSettingsFrom(
    characteristic: BluetoothRemoteGATTCharacteristic,
  ): Promise<BlinkSettings> {
    const settings = decodeSettings(await this.enqueue(() => characteristic.readValue()));
    const errors = validateSettings(settings);
    if (errors.length > 0) throw new Error('設備回傳的設定無效：' + errors.join('、'));
    return settings;
  }

  /** 送出指令並等待設備回覆。只有設備回報成功才會正常返回。 */
  private async sendCommand(opcode: Opcode, payload?: Uint8Array): Promise<void> {
    const { command } = this.requireChannels();
    const seq = this.nextSeq();
    const result = this.waitForResult(seq);
    // 只等待「結果」：它會在設備回覆、逾時、斷線或寫入失敗時結束，
    // 因此即使寫入本身卡住，操作也會在逾時後回報失敗，不會讓介面一直停在處理中。
    this.enqueue(() => command.writeValueWithResponse(encodeCommand(seq, opcode, payload))).catch(
      () =>
        this.settleResult(seq, (pending) =>
          pending.reject(new Error('指令傳送失敗，操作未完成。請確認設備仍在範圍內後重試')),
        ),
    );
    const outcome = await result;
    if (outcome.code !== ResultCode.ok) throw new Error(resultMessage(outcome));
  }

  private waitForResult(seq: number): Promise<CommandResult> {
    return new Promise<CommandResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.settleResult(seq, (pending) =>
          pending.reject(new Error('設備沒有回應，操作未確認成功。請確認設備仍在範圍內後重試')),
        );
      }, COMMAND_TIMEOUT_MS);
      this.pendingResults.set(seq, { resolve, reject, timer });
    });
  }

  private settleResult(seq: number, settle: (pending: PendingResult) => void): void {
    const pending = this.pendingResults.get(seq);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingResults.delete(seq);
    settle(pending);
  }

  private nextSeq(): number {
    this.seq = (this.seq + 1) % SEQ_MODULO;
    return this.seq;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.gattQueue.then(operation, operation);
    this.gattQueue = run.catch(() => undefined);
    return run;
  }

  private requireChannels(): Channels {
    if (!this.channels) throw new Error(NOT_CONNECTED_MESSAGE);
    return this.channels;
  }

  private readonly handleResult = (event: Event): void => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    try {
      const result = decodeResult(value);
      this.settleResult(result.seq, (pending) => pending.resolve(result));
    } catch {
      // 無法解讀的結果封包不對應任何指令；等待中的指令會因逾時而回報失敗。
    }
  };

  private readonly handleStatus = (event: Event): void => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value || !this.channels) return;
    try {
      this.acceptStatus(decodeStatus(value));
    } catch {
      return; // 丟棄格式錯誤的狀態封包，保留上一筆有效狀態。
    }
    this.notify();
  };

  private readonly handleDisconnected = (event: Event): void => {
    // 忽略已經放棄的舊設備物件送來的事件，以免拆掉目前的連線。
    if (event.target !== this.device) return;
    if (!this.channels && this.pendingResults.size === 0) return;
    this.teardown('設備已斷線，操作未完成');
    this.notify();
  };

  /** 清掉連線相關的所有狀態，並讓等待中的指令以失敗結束。 */
  private teardown(reason: string): void {
    this.channels = null;
    this.ready = false;
    this.latest = null;
    this.nextBlinkAt = null;
    for (const seq of [...this.pendingResults.keys()]) {
      this.settleResult(seq, (pending) => pending.reject(new Error(reason)));
    }
  }

  private acceptStatus(status: BleStatus): void {
    this.latest = status;
    this.nextBlinkAt = this.resolveNextBlink(status.msUntilNextBlink);
  }

  private resolveNextBlink(msUntilNextBlink: number | null): number | null {
    if (msUntilNextBlink === null) return null;
    const estimate = Date.now() + msUntilNextBlink;
    const isStable =
      this.nextBlinkAt !== null && Math.abs(estimate - this.nextBlinkAt) < NEXT_BLINK_TOLERANCE_MS;
    return isStable ? this.nextBlinkAt : floorToSecond(estimate);
  }

  private markSynced(): void {
    this.lastSync = toIso(Date.now());
  }

  private buildStatus(): DeviceStatus {
    const latest = this.connected ? this.latest : null;
    const deviceTime = latest?.deviceTime ?? null;
    return {
      connected: this.connected,
      kind: 'ble',
      name: this.device?.name ?? DEFAULT_NAME,
      firmware: latest ? `韌體 ${latest.firmwareVersion}` : '尚未連線',
      mode: latest?.mode ?? 'idle',
      source: latest?.source ?? 'day',
      phase: latest?.phase ?? 'open',
      progress: latest?.progress ?? 0,
      leftAngle: latest?.leftAngle ?? null,
      rightAngle: latest?.rightAngle ?? null,
      nextSchedule: deviceTime ? nextScheduleBoundary(this.active.nightMode, deviceTime) : null,
      nextBlink: latest && this.nextBlinkAt !== null ? toIso(this.nextBlinkAt) : null,
      lastSync: this.lastSync,
      now: toIso(floorToSecond((deviceTime ?? new Date()).getTime())),
    };
  }

  private notify(): void {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
