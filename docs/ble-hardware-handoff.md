# ESP32 藍牙連線故障接手報告

更新日期為 2026-11-12，時區 Asia/Taipei。

## 接手目的與目前結果

使用者希望 Blink Assist 網頁透過 BLE 連接手上的 ESP32，先在馬達拔除的狀態驗證通訊。目前韌體已成功燒錄，診斷版本也跑完開機流程，但 Windows 與 Chrome 都找不到目標設備，實機 GATT 連線尚未成功。

主要疑點是這塊板子的主晶振。兩版 esptool 都回報 26 MHz，而該系列 ESP32 的 Wi-Fi／藍牙規格要求 40 MHz。這是有多項證據支持的推論，仍缺少晶振實體量測、第二台接收器及另一塊板子的交叉測試，請勿直接宣稱已證明板子損壞或是假貨。

使用者目前沒有另一塊板子。上一位助理提出 USB 通訊與向賣家換貨兩個方向，使用者尚未選擇，最新要求是撰寫本報告。USB 通訊尚未實作，也尚未取得改走 USB 產品流程的決定。

## 環境與硬體

| 項目               | 實際觀察                                                                         |
| ------------------ | -------------------------------------------------------------------------------- |
| 專案               | `D:\eyeblink`                                                                    |
| 分支               | `refactor/layered-architecture`                                                  |
| 最近核對的提交     | `b8c206e`，新增 ESP32 韌體與藍牙實機控制                                         |
| Arduino IDE        | 2.3.10，位於 `C:\Users\iyang\Arduino IDE`                                        |
| Arduino CLI        | IDE 隨附的 `resources\app\lib\backend\resources\arduino-cli.exe`                 |
| ESP32 核心         | Arduino-ESP32 3.3.12                                                             |
| 晶片讀值           | ESP32-D0WD-V3，revision v3.1，4 MB Flash                                         |
| 晶振讀值           | 26 MHz                                                                           |
| esptool 讀出的 MAC | `48:9d:31:c4:96:b8`，勿假設此值必然等於 BLE 位址                                 |
| USB 裝置           | Silicon Labs CP210x USB to UART Bridge，COM3，驅動狀態 OK                        |
| 電腦藍牙           | Realtek Bluetooth Adapter，可收到其他 BLE 裝置的廣播                             |
| 板子外觀           | 金屬罩標示 `ESP-32`，30 pin、Micro USB、CP2102，照片不足以確認完整模組型號或真偽 |
| 馬達               | 使用者多次明確確認兩顆馬達都沒接                                                 |
| Node.js            | v24.22.1                                                                         |

本報告記錄當時狀態，下一次操作前重新查詢 COM 埠、執行程序與檔案是否存在。

## 已執行的測試與證據

### 編譯與燒錄

1. 原始韌體以 `esp32:esp32:esp32` 編譯及上傳成功，程式約 1.09 MB，占 83%。
2. 為排查 Flash 相容性，再以 `esp32:esp32:esp32:FlashMode=dio,FlashFreq=40` 編譯、上傳成功。
3. 上傳紀錄有 `Hash of data verified.`，最後有 `Hard resetting via RTS pin...`。這些證據確認資料寫入成功及工具執行重啟。
4. esptool 5.3.1 與 4.5.1 都從同一塊板子讀到 26 MHz，後者也使用 `--no-stub` 查詢。
5. 使用者之後自行貼上的 Arduino IDE 紀錄也顯示寫入成功及 26 MHz。該次映像大小與助理先前建立的檔案略有差異，尚未比對使用者當時的草稿內容。

`FlashFreq=40` 指 Flash 的時脈。它和實體主晶振是不同參數，不能據此聲稱已把板子的主晶振改成 40 MHz。已安裝 SDK 的 `sdkconfig` 使用 `CONFIG_XTAL_FREQ=40`。

### 序列診斷

原始韌體沒有在 `setup()` 印出初始化進度。助理複製完整韌體到暫存目錄，增加序列訊息並以 `DebugLevel=error` 編譯。診斷版在 BLE 初始化失敗時停留並印出錯誤，方便觀察。

診斷版的輸出設定為 `Serial.begin(115200)`，但在主機以 **74,880 baud** 讀取時，取得以下可辨識訊息。以下按程式執行順序列出，擷取工具曾對輸出行去重並排序，因此保留的終端摘要本身不代表時間順序。

```text
BLINK_DIAG setup
BLINK_DIAG before BLE
BLINK_DIAG BLE init=1
BLINK_DIAG BLE advertising start=1
BLINK_DIAG setup done
```

74,880 / 115,200 等於 26 / 40，與晶振讀值及 SDK 設定不一致的情況相符。尚未用示波器或頻率計量測實體訊號。

`BLEDevice::init()` 與 `advertising->start()` 回傳成功，能確認軟體初始化與啟動請求的結果。沒有擷取並驗證 GAP 非同步廣播完成事件，也沒有接收器收到該設備廣播的證據。

早期在 115,200 baud 曾收到重複、截斷與亂碼的 ROM 字串，助理曾描述為「反覆重啟」。後續診斷在 74,880 baud 跑完 `setup()`，因此持續重啟並未獲得穩定證實。接手時不要把早期描述當成已確認根因。

診斷結束後，助理已將原本的 DIO／40 MHz Flash 組態韌體刷回，寫入雜湊驗證成功。診斷修改僅存在暫存副本。

### 藍牙與前端

- Chrome 可開啟 Web Bluetooth 裝置選擇視窗，畫面顯示「找不到相容的裝置」。
- 前端 `src/device/ble/bleDeviceService.ts` 以服務 UUID `12345678-1234-1234-1234-123456789000` 篩選設備。
- 韌體 `ble_link.cpp` 有加入同一個服務 UUID，設定 scan response 並啟動廣播。
- 另以 Python Bleak／Windows WinRT 執行多次不限定服務 UUID 的掃描，每次可收到約 29–48 個附近 BLE 裝置。
- 掃描後按名稱含 `BlinkAssist`、服務 UUID、或上述 MAC 的相同前綴尋找目標，均無匹配。隨機位址且缺少名稱與服務的廣播仍可能無法歸屬，這項測試不能排除所有異常廣播形式。
- 已排除「只有網頁服務 UUID 篩選太嚴而看不到正常 BlinkAssist 廣播」這個簡單解釋，但尚未用手機或第二個藍牙接收器交叉測試。
- 尚未成功驗證真實 GATT 服務探索、狀態通知、對時、儲存 ACK、套用設定與斷電保存。

前端啟動於 `http://127.0.0.1:5173/`，HTTP 與控制總覽載入成功。先前補齊依賴後，`npm run check` 通過 127 個測試，`npm run build` 通過。這些測試包含假設備，不能代替實機驗證。

### 獨立供電

使用者把 USB 線從電腦移至 PowerFalcon PS25WS-ACF1 充電器，標示每孔 5.2 V、最高 2.4 A、總功率 25 W，仍從板子的 Micro USB 孔供電。板子亮燈，電腦 COM3 消失，掃描仍找不到 BlinkAssist。之後使用者已接回電腦，COM3 恢復。

這個測試確認板子可由該 USB 電源取得電力，尚未量測供電紋波、壓降或驗證獨立運作的排程。馬達一直保持拔除。

## 判斷與下一步

Espressif 的 ESP32 Series Datasheet 在 Clocks and Timers 中明列 Wi-Fi／Bluetooth 使用 40 MHz 主晶振。ESP32 硬體設計指南也要求 40 MHz。ESP-IDF 文件另外提到，26 MHz 板子的主晶振設定不符可能造成序列亂碼。能為一般 CPU 程式設定 26 MHz，不代表該配置獲得 ESP32 藍牙支援。

- [ESP32 晶片規格書](https://documentation.espressif.com/esp32_datasheet_en.html)
- [ESP32 主晶振硬體要求](https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32/schematic-checklist.html#external-crystal-clock-source-compulsory)
- [ESP-IDF 主晶振設定與亂碼說明](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/get-started/start-project.html)

目前沒有在這塊板子上驗證成功的純軟體 BLE 修復方法。最有力的疑點為主晶振不符合無線功能要求，證據包括兩版工具讀值、序列速度比例及兩種供電下均收不到廣播。

後續可先用手機 BLE 掃描工具作第二個接收器，或由有設備的人量測／確認晶振。若取得已知正常、40 MHz 的 ESP32 開發板，用相同韌體交叉測試，再驗證前端完整連線流程。使用者目前沒有備用板，需如實說明這項硬體依賴。

若使用者選擇 USB 通訊，需要新增 Web Serial 前端與韌體序列協議，仍維持設備回覆後才宣稱成功，以及設備端獨立排程。還需量測這塊板子的計時與 PWM 是否準確，不能直接沿用目前 SDK 對 40 MHz 的假設。USB 方案目前只有討論，尚未開發。

## 操作限制與暫存證據

遵守根目錄 AGENTS.md 的所有安全限制。實機只供桌面模型，尚未完成機械限位、力量限制、故障釋放與醫療安全驗證。調查期間沒有進行馬達動作驗證。除非使用者另有要求，不要 commit 或 push。

以下檔案位於本機暫存區，可能被系統清除，不是專案執行依賴。

| 位置                                                                                    | 內容                                                                          |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `%TEMP%\blink-assist-dio-2a9aa70b`                                                      | 原本韌體的 DIO／40 MHz Flash 組態建置產物，包含已刷回的 `BlinkAssist.ino.bin` |
| `%TEMP%\blink-assist-diag-2a9aa70b\BlinkAssist`                                         | 加入序列訊息的診斷版副本                                                      |
| `%TEMP%\blink-assist-diag-2a9aa70b\Capture-Startup.ps1`                                 | 重啟並擷取 COM3 訊息的腳本                                                    |
| `%TEMP%\blink-assist-diag-2a9aa70b\startup-74880.bin`                                   | 診斷版可辨識輸出的原始位元組                                                  |
| `%TEMP%\blink-assist-ble-2a9aa70b`                                                      | 以 `pip --target` 安裝的 Bleak 及臨時驗證腳本；腳本尚未通過設備探索階段       |
| `C:\Users\iyang\.codex\attachments\5c2fc721-6fb0-4f17-915d-3d8d81bb0ef4\貼上的文字.txt` | 使用者貼上的成功燒錄紀錄                                                      |

舊版 AGENTS.md 裡「沒有 Arduino IDE／CLI」及「尚未在板上執行」屬於本次調查之前的歷史狀態。現在已成功上傳並執行診斷韌體，但 BLE 實機連線及馬達功能仍未驗證。
