# 接手報告（AI 助理請先讀完這份再動手）

這份文件是給接手本專案的 AI 助理看的。它說明專案現況、不能違反的限制、架構規則，以及還沒決定或還沒做的事。使用者操作說明在 `README.md`；這裡只寫 README 沒有、但接手時一定要知道的事。

## 1. 這是什麼

Blink Assist（眨眼輔助控制系統）：React 控制介面加上 ESP32 韌體，目標是用伺服馬達協助眼瞼開闔。前端可在兩種設備間切換：

- **模擬設備**（預設）：完全在瀏覽器裡執行。
- **ESP32 實機**：透過 Web Bluetooth 控制 ESP32-WROOM-32 上的韌體，驅動 MG90S 伺服馬達。

使用者手上有 ESP32-WROOM-32 與 MG90S，用 Arduino IDE 燒錄。**韌體只確認能編譯（Arduino-ESP32 3.3.12），寫這份報告時尚未在實體硬體上跑過。** 使用者回報實機問題時，先假設韌體或接線可能有錯，不要假設它是驗證過的。

使用者以繁體中文溝通，介面文字、註解、測試名稱、commit 訊息都用繁體中文。

## 2. 不能違反的限制

- **實機控制只限桌面模型。** 使用者已決定實作真實藍牙控制，用於桌面模型測試。但機械限位、力量限制、故障釋放與醫療安全驗證都還沒做，不要協助把它用在人身上，也不要把預設設備類型改成實機。
- **韌體的安全預設不可拿掉：** 角度預設為「未設定」（剛燒錄的設備不會動）、`config.h` 的 `MAX_CLOSE_ANGLE_DEG` 上限、`servo_driver.cpp` 輸出前的二次限制與轉速上限（`MAX_SERVO_SPEED_DEG_PER_SECOND`）、未對時不啟動排程、讀取儲存失敗時如實回報而不是悄悄換成預設值。
- **不可移除或淡化安全聲明。** 介面與 README 中「僅供模擬」「0–90° 不是人體安全範圍」「尚未通過醫療安全驗證」這類文字是刻意保留的。
- **角度與時間範圍不是安全值。** 前端的範圍只是為了提早提示；韌體會獨立再驗證一次，角度上限以韌體為準，前端不得放寬或繞過。
- **失敗不可假裝成功。** 任何設備操作失敗都要讓使用者看到錯誤訊息。

## 3. 環境

- 需要 **Node.js 20.19 以上**（Vite 7 的要求）。使用者這台電腦的系統 Node 曾是 16.20.2（nvm-windows），跑不動本專案；若 `npm` 指令出現語法或 engine 錯誤，先檢查 `node --version`，請使用者執行 `nvm install 22` 與 `nvm use 22`，不要自行更改系統設定。
- 平台是 Windows；路徑為 `C:\eyeBlink`。
- 技術棧：React 19、TypeScript 5.9（strict）、Zustand 5（vanilla store）、Vite 7、Tailwind 4（實際上只用到 preflight，樣式都是手寫 CSS）、Vitest 5、ESLint 10、Prettier 3。

常用指令：

```powershell
npm run dev            # 開發伺服器，http://127.0.0.1:5173/
npm run check          # 格式 + ESLint + 型別 + 測試；改完程式一定要跑，必須全過
npm run format         # Prettier 自動排版
npm run test:coverage  # 覆蓋率（目前約 91%，請維持在 80% 以上）
npm run build          # 型別檢查後打包到 dist/
```

## 4. 架構與依賴方向

```text
domain  ←  device  ←  stores  ←  hooks / components / pages / app
```

箭頭右邊可以引用左邊，**反向不行**，`eslint.config.js` 的 `no-restricted-imports` 會擋下。不要為了方便去關掉或繞過這些規則。

| 目錄              | 放什麼                                                              | 不可以                          |
| ----------------- | ------------------------------------------------------------------- | ------------------------------- |
| `src/domain/`     | 設定型別與預設值、驗證、排程判斷、眨眼時間軸。全部是純函式          | 引用 React、store、瀏覽器 API   |
| `src/device/`     | `DeviceService` 介面、狀態型別、模擬設備（`mock/`）、藍牙（`ble/`） | 引用 React、store、UI           |
| `src/stores/`     | `deviceStore`（所有設備操作）、`settingsStore`（表單）、同步狀態    | 直接依賴特定設備實作            |
| `src/hooks/`      | 模擬時鐘、同步狀態、hash 路由、離開前警告                           |                                 |
| `src/components/` | 共用元件，一個元件一個檔案                                          | 直接引用 `device/mock`、`ble`   |
| `src/pages/`      | 五個頁面                                                            | 直接呼叫設備，須透過 store      |
| `src/app/`        | 外框、狀態列、頁面清單 `pages.ts`                                   |                                 |
| `src/styles/`     | `base` → `shell` → `components` → `responsive`，順序即層疊順序      | 調換 `index.css` 的 import 順序 |

兩個組裝點，換設備或換接線只改這裡：

- `src/device/index.ts` 的 `createDeviceBinding(kind)`：依設備類型建立實作。實機回傳的 `simulation` 是 `null`。
- `src/stores/index.ts`：讀取使用者選的設備類型（存在 localStorage 的 `blink-assist.device-kind`）、建立 store、注入設備。設備在載入時就決定；`switchDeviceKind` 的做法是寫入選擇後重新載入頁面。

另外兩個不在 `src/` 的部分：

- `firmware/BlinkAssist/`：ESP32 韌體（Arduino IDE 專案，C++）。`config.h` 放接腳與安全上限；`settings.*`、`blink_engine.*`、`device_clock.*` 是不依賴 Arduino 的純邏輯；`ble_link.*`、`servo_driver.*`、`settings_storage.*` 接硬體；`.ino` 把它們接起來。接線與燒錄見 `firmware/README.md`。
- `docs/ble-protocol.md`：前端與韌體之間的合約。

## 5. 一定要懂的幾個概念

**設定有三份。**

- `draft`：表單編輯中（`settingsStore`）。
- `saved`：設備儲存區的內容（`settingsStore` 保留一份副本；模擬設備寫入 `localStorage`，鍵為 `blink-assist.mock-device.v1`）。
- `active`：設備實際執行中的設定（`deviceStore` 的 `active`，來自設備 snapshot）。

流程固定是「編輯 → 儲存 → 套用」。儲存不會改變執行中的行為，套用才會。

**同步狀態是推導出來的，不另外儲存。** `stores/syncState.ts` 的 `resolveSyncState` 比對三份設定，得出 `unsaved`／`unapplied`／`applied` 等狀態。不要新增一個手動維護的「目前狀態」欄位，那正是重構前出問題的地方。

**手動夜間是即時指令，不是設定。** 使用者已明確決定：它不儲存、不需要套用、不影響同步狀態，連線或重新啟動後一律為關閉。它存在模擬設備的 `manualNight` 欄位，介面由 `status.source === 'manual'` 判斷。`NightModeSettings` 裡**沒有** `manualEnabled`，請不要加回去。舊版儲存資料若帶有這個欄位，`cloneSettings` 會在讀取時捨棄。

**模式優先序：** 手動夜間 > 自動夜間排程 > 日間設定。手動夜間開啟時只是「優先於」排程，不會去關掉排程開關；手動關閉後若仍在排程時段內，會繼續保持閉眼。

**排程的星期是「開始日」。** 週一 22:00 至週二 07:00 屬於週一。判斷含開始、不含結束。

**眨眼靠時間推算，不靠計時器累加。** `domain/blinkTimeline.ts` 以純函式從時間軸算出姿態，所以分頁被背景節流也不會走樣；錯過的眨眼不補播。間隔定義是「這次開始到下次開始」。

**模擬設備的 `snapshot()` 會先把時鐘推進到現在再回傳。** 這是刻意的設計，不是疏忽。UI 以 `useDeviceClock` 每 50ms 呼叫一次 `tick()`；`deviceStore` 在狀態沒變時不會更新，避免整頁無謂重繪。`status.now` 只精確到秒也是為了這個。

**設定一律以新物件取代，不就地修改。** `defaultSettings` 已深度凍結，誤改會直接丟 `TypeError`。`snapshot().active` 是以參考共享的，修改它等於改到設備內部狀態。

**模擬專用功能獨立成 `SimulationTools`**（`tick`、`setSimulationTime`、`rename`）。實體設備不會提供這個介面，`deviceStore` 的 `canSimulate` 為 `false` 時相關介面會隱藏。不要把這些方法搬進 `DeviceService`。

**同一時間只允許一個分頁連線**，以 Web Locks 實作（`device/mock/deviceLock.ts`）。

**藍牙協議有三處必須同步：** `docs/ble-protocol.md`、`src/device/ble/protocol.ts`、韌體的 `protocol.h`／`settings.cpp`／`.ino` 的 `buildStatus`。改其中一處就要改另外兩處；不相容的修改要把協議版本加一。`protocol.test.ts` 裡的基準位元組同時寫在文件裡，是兩邊對照的依據。

**韌體的邏輯是前端 domain 的鏡像。** `blink_engine.cpp` 對應 `domain/blinkTimeline.ts` 與 `domain/schedule.ts`，`settings.cpp` 的驗證對應 `domain/validation.ts`。改行為時兩邊都要改，否則模擬和實機會不一致。韌體沒有單元測試（這台電腦沒有主機端 C++ 編譯器）。

**實機的每個指令都要等設備回覆才算成功。** `BleDeviceService.sendCommand` 寫入後等待結果通知，5 秒逾時或斷線就丟出錯誤。不要加入「寫入成功就當作完成」的捷徑。

**設備沒有時區、也沒有電池時鐘。** 前端每次連線送出「本地時間秒數」對時；設備斷電後在重新連線前不會啟動夜間排程。細節見協議文件的「時間」一節。

**介面文字依設備類型變化**，集中在 `src/lib/deviceText.ts`，元件用 `useDeviceText()` 取得。不要在元件裡寫死「模擬」字樣。

## 6. 常見修改怎麼做

- **新增設定欄位**：`domain/settings.ts`（型別、預設值、`cloneSettings`、`comparable`）→ `domain/validation.ts`（驗證與範圍）→ `settingsStore` 視需要加 patch 方法 → 頁面加輸入元件 → 補測試。`cloneSettings` 是逐欄位複製的，**漏加的欄位會被靜靜丟掉**，這一步最容易忘。
- **數值範圍**只寫在 `domain/validation.ts`（`DAY_LIMITS`、`CLOSE_ANGLE_LIMITS`），頁面從那裡取用，不要在元件裡再寫一次數字。
- **新增頁面**：在 `app/pages.ts` 加一筆，側邊欄與路由自動跟上。
- **新增設備操作**：先加到 `DeviceService` 介面 → 模擬設備實作 → `deviceStore.ts` 用 `perform(...)` 包一個 action 並在 `NOTICES` 加成功訊息 → 頁面呼叫 action。
- **元件讀取 store** 請傳 selector 只取需要的欄位，例如 `useDeviceStore((s) => s.status.connected)`。

## 7. 測試

- 藍牙測試以 `src/test/fakeBluetooth.ts` 的 `FakeEsp32` 模擬韌體的 GATT 服務，可指定下一個指令的回覆（成功、錯誤碼、或不回覆以測逾時）。
- 測試檔與原始碼放在一起（`*.test.ts(x)`），以繁體中文描述行為，採 Arrange-Act-Assert。
- 時間相關測試用 `vi.useFakeTimers()`，基準時間 `2026-11-09T12:00:00`（星期一）。模擬設備的儲存有 350ms 延遲，測試要 `advanceTimersByTimeAsync(350)`。
- `src/test/memoryStorage.ts` 是記憶體版 `Storage`；建立模擬設備時注入 `createStorageRepository(() => storage)`。
- `src/app/App.test.tsx` 是以 `renderToString` 做的渲染冒煙測試，沒有 jsdom，**不會測到點擊互動**。專案內目前沒有 E2E 測試；重構時的瀏覽器流程驗證是用臨時腳本做的，沒有進版控。
- 修 bug 或加功能請先寫會失敗的測試，再改實作。

## 8. 還沒做、或還沒決定的事

- **韌體尚未實機驗證**：只確認能編譯。第一次上板很可能需要調整（伺服方向、脈波範圍、電源問題）。
- **上板時最可能出問題的地方**（獨立審查指出、但沒有硬體無法確認）：
  - 儲存指令長 22 bytes，超過預設 MTU 的單次寫入上限，依賴藍牙的長寫入。若只有「儲存設定」失敗，考慮在韌體調高 MTU。
  - Windows 會快取設備的服務內容；韌體改過 characteristic 後若找不到服務或收不到通知，先在 Windows 藍牙設定移除設備再連。
  - 中斷連線後立刻重連，Windows 上偶爾會失敗。
  - 讀取 characteristic 與主迴圈更新數值之間沒有額外加鎖（函式庫內部有 semaphore），理論上狀態封包可能讀到新舊混合的內容。
- **手動夜間的畫面與馬達有時間差**：韌體有轉速上限，進出夜間時馬達是逐步移動的；狀態封包的「進度」是目標值，「角度」才是實際送出的值。
- **藍牙沒有配對或加密**：範圍內任何人都能連線下指令。用於桌面模型以外的場合前必須處理。
- **沒有位置回授、緊急停止、故障釋放、機械限位、力量限制，也沒有醫療安全驗證。**
- **韌體沒有自動化測試**，前端的藍牙測試用的是 `src/test/fakeBluetooth.ts` 的假設備，沒有對真實韌體跑過。
- **編譯韌體的工具**：使用者的電腦在重構當時沒有安裝 Arduino IDE 或 arduino-cli；驗證編譯時用的是臨時下載的 arduino-cli，沒有留在專案裡。注意工具鏈裝在很深的路徑下會因 Windows 路徑長度限制而解壓縮不完整。
- **手動夜間與自動排程是否互斥**：使用者問過「開手動夜間，自動夜間會不會關閉」。目前實作是兩者獨立、手動優先。已向使用者說明理由並詢問是否要改成互斥，**尚未得到明確答覆**。動這塊之前請先跟使用者確認。
- **鍵盤焦點**：`app/App.tsx` 在操作進行中會以 `<fieldset disabled>` 停用整頁表單，鍵盤使用者可能因此在每次操作後失去焦點。這是原本就有的行為，尚未在瀏覽器中確認，也還沒處理。
- **中斷連線後模型仍在動**：模擬設備中斷連線後，畫面仍顯示並持續更新最後的模型狀態。這是沿用原始設計（README 有說明），不是這次造成的。
- **`perform` 會靜靜忽略進行中時送出的第二個操作**：介面靠停用按鈕避免，但非 UI 的呼叫端分辨不出「沒做」和「成功」。
- **CSS 色碼沒有抽成變數**：只做了排版與拆檔，色碼仍散在各檔。
- **部分元件訂閱整個 `status`**（`Overview`、`NightMode`、`DeviceSettings`），眨眼期間會以約 20Hz 重繪。影響很小，尚未最佳化。
- **`npm audit` 有 10 個中度警告**，全部來自 ESLint 工具鏈的 minimatch，只影響開發環境。修正需要降版 ESLint，尚未處理。
- **Tailwind** 幾乎沒被使用，但移除會改變 preflight 的重設樣式，所以保留。

## 9. 目前版本狀態

- 分支 `refactor/layered-architecture`，尚未合併回 `main`。
- 前端：`npm run check` 全過（127 個測試）；模擬與實機兩種模式的介面都以瀏覽器實際操作確認過。實機模式的連線流程只對 `FakeEsp32` 測過。
- 韌體：以 Arduino-ESP32 3.3.12、開發板 ESP32 Dev Module 編譯通過（約 1.09 MB，佔預設分割區 83%，還有空間但不多；加功能前留意大小）。
- 下一步通常是：使用者把韌體燒進板子、照 `firmware/README.md` 測試，再回報結果。請根據他回報的現象調整，而不是預先大改。

## 10. 協作方式

- 使用者不一定熟悉 React；回報時先講結論與對他的影響，少用內部術語。
- 除非使用者要求，不要 commit 或 push。commit 訊息採 `<type>: <描述>`（feat、fix、refactor、docs、test、chore、perf、ci），不加 AI 署名。
- 改完程式後跑 `npm run check`，並如實回報結果；沒有驗證過的事情要明講。
- 涉及產品行為的取捨（例如第 8 節的互斥問題）交給使用者決定，不要自行假設。
- 架構或行為有重大改變時，請同步更新這份文件與 `README.md`。
