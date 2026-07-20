# 更新紀錄

版本格式 `YYYYMMDD.NN`，與 `config.js` 的 `APP_VERSION` 一致。
每次改動請在最上方新增一節，並註明是否需要重新部署 Apps Script。

---

## 20260720.2

### 新增

**離線可用（Service Worker）**
新增 `sw.js`，快取 App Shell 與三個 CDN 框架。在此之前，App 雖然有離線寫入佇列與
localStorage 快取，但那些只在分頁「已經開著」時有用 —— 加到主畫面後在沒訊號的地方
重新開啟會是整頁空白。現在可以離線啟動並讀取已快取的旅程資料。

- 本地資源用 cache-first：靜態檔都帶 `?v=` 版本，換版即換 URL，不會拿到舊檔。
- 導覽請求用 network-first，退回快取的 `index.html`，重新部署後能拿到新版。
- Apps Script、Google Maps、Open-Meteo 一律走網路不快取。JSONP 回應帶一次性
  callback 名稱，快取只會拿到過期資料。
- 註冊寫在 `cache-refresh.js`，`file://` 與非 localhost 的 http 會跳過。
- 「刷新版本 / 重新載入」按鈕除了清 cache，也會叫等待中的新 SW 立刻接手。

**分帳結算方案**
原本的 `balanceSheet` 只顯示每個人的淨額（誰多付、誰少付），但旅程結束時要做的是轉帳。
新增 `TravelExpenses.buildSettlementPlan()`，用貪婪配對（欠最多的還給被欠最多的）算出
實際轉帳清單，N 個人最多 N-1 筆。顯示在個人分帳模式的餘額下方。

分攤除不盡時會產生 0.0001 這類零頭，以 0.5 元為門檻忽略，不會跑出無意義的轉帳。
共同錢包模式不套用結算 —— 那裡的餘額語意是「存入 vs 使用」，不是互相欠款。

**共同錢包紀錄可編輯**
後端 `shared_wallet_edit` 早就寫好也部署了，但前端只呼叫 add 與 delete，金額打錯只能
刪掉重加。現在錢包紀錄列多了編輯鈕與編輯 modal，存入與公費支出都能改。

前端會先自行計算修改後的餘額，餘額會變負時直接擋下並顯示具體數字，而不是送出去等後端
回一個通用錯誤。編輯表單的使用者勾選與新增表單分開，避免兩邊互相污染。

**交通資訊顯示座位與報到時間**
`TRAVEL_TRANSPORT_V1` envelope 一直有存 `seat` 與 `checkin`，但編輯畫面只有班次與
航廈兩個欄位，資料存了卻看不到。現在編輯 modal 補上這兩欄，行程卡片摘要也會顯示。

班次與航廈本身看得懂，座位與報到時間加了標籤（`座位 32A`、`報到 18:20`）避免混淆。
資料模型與序列化都沒動，舊資料直接就能顯示。

### 需要的動作

- **不需要重新部署 Apps Script。** 這一版沒有改後端。
- 首次載入新版時 Service Worker 會註冊並快取資源，之後才有離線能力。

---

## 20260720.1

### 修復

**repo 的 Apps Script 後端補齊**
`apps-script-backend.gs` 落後於線上部署，缺少整套共同錢包後端：11 個函式
（`getOrCreateSharedWalletSheet_`、`handleSharedWalletMutation_`、
`readSharedWalletTransactions_` 等）與 5 個 action
（`shared_wallet_get` / `add` / `edit` / `delete` / `setting_update`）。

前端本來就在呼叫這些 action，所以照 repo 那份重新部署會讓共同錢包整個失效。線上版本是
repo 版本的嚴格超集，直接取用。

**版本號不同步**
`prep-checklist.js` 的 query string 停在與其他資源不同的版本，一併對齊。

### 重構

`app.js` 從 4854 行減到 3755 行（−23%），行為不變。原本所有邏輯都擠在單一
`setup()` 裡，約 250 個函式共用 130 個 ref。

拆出的模組（IIFE + 凍結的 `window.Travel*` 命名空間，維持無 build step）：

| 模組 | 內容 |
| --- | --- |
| `js/itinerary.js` | 行程記錄模型、類型／色調／圖示判定、交通 envelope |
| `js/hotels.js` | 住宿記錄模型與日期區間邏輯 |
| `js/expenses.js` | 費用與錢包記錄模型、人員正規化、舊公帳偵測 |
| `js/maps.js` | 色碼工具與 marker pin SVG |
| `js/weather.js` | 天氣代碼／UV 對應，以及預報載入 factory |
| `js/export.js` | 行程文字與備份 HTML 產生器（純函式） |
| `js/probe-search.js` | 探點搜尋子系統 |
| `js/places.js` | Place Details 欄位清單 + autocomplete factory |
| `js/utils.js` | 新增 escapeHtml、linkifyMessage、formatTime、timeToNum |

其他：

- 刪掉 `TravelX.y || (內建版)` 這種 fallback。它們與 `js/*.js` 逐字重複，等於每個修正
  都要改兩處。改為缺模組就在啟動時丟出具名錯誤。
- 備案／新增住宿／編輯住宿三處的 autocomplete 是近乎逐字重複的 44 行副本，收斂成
  `TravelPlaces.createPredictionSearch`。
- **沒有**合併 `searchPlacesInput` 與 `searchProbePlacesInput`。兩者都走翻譯搜尋，但探點
  版多了地圖邊界、過期查詢防護、中文標籤補抓與不同的 debounce。合併會改到行為。

### 新增

`tests/run.js` —— 無外部相依，執行 `node tests/run.js`：

1. 所有前端 JS 的語法檢查
2. 純模組單元測試
3. **在 stub 環境實際執行 `app.js` 的 `setup()`**，抓出搬移後的未定義參照
4. **模板綁定覆蓋率**：`index.html` 用到的識別字是否都由 `setup()` 提供
5. 靜態資源版本一致性

第 3、4 項是重構時的主要防護 —— 語法檢查抓不到跨檔案的斷鏈。

### 需要的動作

- **需要重新部署 Apps Script。** repo 的 `.gs` 更新不等於線上生效。
