#include "ble_link.h"

#include <Arduino.h>
#if defined(CONFIG_BLUEDROID_ENABLED)
#include <BLE2902.h>
#endif
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <string.h>

namespace blink {

namespace {

constexpr uint8_t COMMAND_QUEUE_LENGTH = 4;
// 5 個 characteristic 各佔 2 個 handle，加上 2 個 CCCD 與服務本身；留一些餘裕。
constexpr uint32_t SERVICE_HANDLE_COUNT = 24;

QueueHandle_t commandQueue = nullptr;
volatile bool isConnected = false;

BLECharacteristic* savedSettingsChar = nullptr;
BLECharacteristic* activeSettingsChar = nullptr;
BLECharacteristic* statusChar = nullptr;
BLECharacteristic* resultChar = nullptr;

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override { isConnected = true; }

  void onDisconnect(BLEServer*) override {
    isConnected = false;
    // 斷線後繼續廣播，讓前端可以重新連線；設備本身照常依設定運作。
    BLEDevice::startAdvertising();
  }
};

class CommandCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* characteristic) override {
    const uint8_t* data = characteristic->getData();
    const size_t length = characteristic->getLength();
    // 連 seq 與 opcode 都沒有的封包無法回覆，直接忽略；前端會因逾時而回報失敗。
    if (data == nullptr || length < protocol::COMMAND_HEADER_SIZE) return;

    Command command = {};
    command.seq = data[0];
    command.opcode = data[1];
    const size_t payloadLength = length - protocol::COMMAND_HEADER_SIZE;
    if (payloadLength > protocol::COMMAND_MAX_PAYLOAD) {
      command.oversized = true;
    } else {
      command.payloadLength = static_cast<uint8_t>(payloadLength);
      memcpy(command.payload, data + protocol::COMMAND_HEADER_SIZE, payloadLength);
    }
    // 佇列滿時丟棄；前端一次只送一個指令並等待結果，正常不會發生。
    xQueueSend(commandQueue, &command, 0);
  }
};

BLECharacteristic* addCharacteristic(BLEService* service, const char* uuid, uint32_t properties) {
  BLECharacteristic* characteristic = service->createCharacteristic(uuid, properties);
#if defined(CONFIG_BLUEDROID_ENABLED)
  // ESP32-WROOM-32 使用 Bluedroid，通知用的 CCCD（0x2902）必須自己加。
  // NimBLE（較新的晶片）會自動建立，重複加入反而會讓通知失效。
  if ((properties & BLECharacteristic::PROPERTY_NOTIFY) != 0) {
    characteristic->addDescriptor(new BLE2902());
  }
#endif
  return characteristic;
}

}  // namespace

void BleLink::begin(const char* deviceName) {
  commandQueue = xQueueCreate(COMMAND_QUEUE_LENGTH, sizeof(Command));

  BLEDevice::init(deviceName);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService* service = server->createService(BLEUUID(protocol::SERVICE_UUID), SERVICE_HANDLE_COUNT);
  savedSettingsChar =
      addCharacteristic(service, protocol::SAVED_SETTINGS_UUID, BLECharacteristic::PROPERTY_READ);
  statusChar = addCharacteristic(
      service, protocol::STATUS_UUID,
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  BLECharacteristic* commandChar =
      addCharacteristic(service, protocol::COMMAND_UUID, BLECharacteristic::PROPERTY_WRITE);
  commandChar->setCallbacks(new CommandCallbacks());
  resultChar =
      addCharacteristic(service, protocol::RESULT_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  activeSettingsChar =
      addCharacteristic(service, protocol::ACTIVE_SETTINGS_UUID, BLECharacteristic::PROPERTY_READ);
  service->start();

  // 服務 UUID 必須放在廣播封包裡，瀏覽器才能用它篩選出這台設備。
  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(protocol::SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
}

bool BleLink::connected() const {
  return isConnected;
}

bool BleLink::takeCommand(Command& out) {
  return commandQueue != nullptr && xQueueReceive(commandQueue, &out, 0) == pdTRUE;
}

void BleLink::sendResult(uint8_t seq, uint8_t opcode, protocol::ResultCode code, uint8_t detail) {
  if (!isConnected) return;
  uint8_t result[protocol::RESULT_SIZE] = {seq, opcode, static_cast<uint8_t>(code), detail};
  resultChar->setValue(result, sizeof(result));
  resultChar->notify();
}

void BleLink::publishStatus(const uint8_t status[protocol::STATUS_SIZE], bool notify) {
  statusChar->setValue(const_cast<uint8_t*>(status), protocol::STATUS_SIZE);
  if (notify && isConnected) statusChar->notify();
}

void BleLink::setSavedSettings(const uint8_t blob[protocol::SETTINGS_BLOB_SIZE]) {
  savedSettingsChar->setValue(const_cast<uint8_t*>(blob), protocol::SETTINGS_BLOB_SIZE);
}

void BleLink::setActiveSettings(const uint8_t blob[protocol::SETTINGS_BLOB_SIZE]) {
  activeSettingsChar->setValue(const_cast<uint8_t*>(blob), protocol::SETTINGS_BLOB_SIZE);
}

}  // namespace blink
