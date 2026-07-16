# Travel 專案工作流

本文件保存跨對話都要沿用的開發規則。Codex 無法讀取其他聊天室，因此固定需求與工作方式以此檔案為準。

## 固定技術邊界

- 保留 `index.html` 單頁入口。
- 保留 Vue 3 CDN，不導入 React、Vite 或 npm 建置流程。
- `style.css` 負責版面與功能樣式，`cloud-theme.css` 負責主題。
- Apps Script 繼續處理 CRUD、翻譯、天氣與 Google Sheets 存取。
- Google Sheets 繼續作為輕量資料庫。
- 未經明確要求，不更換 `config.js` 的 `API_URL`。
- 前端不得呼叫或顯示 Google Places 圖片。

## 一般修改流程

1. 先讀本文件、`docs/architecture.md` 與 `git status -sb`。
2. 搜尋現有變數、函式與資料欄位，確認真正的呼叫路徑。
3. 保留既有命名與資料結構，採最小且完整的修改。
4. 修改後執行 JavaScript 語法檢查與 `git diff --check`。
5. UI 改動需檢查手機尺寸、文字溢出、按鈕可點擊範圍與地圖高度。
6. 確認版本號與所有靜態資源 query string 一致。
7. 只有使用者明確要求時才推送 GitHub 或部署 Apps Script。

## UI/UX 工作流

適用於新增畫面、設計、review、fix 與 improve：

- 延續目前 Cloud Blue 視覺，但避免滿版藍紫漸層與卡片堆疊。
- 旅遊工具以手機操作效率為優先，不製作 Landing Page 或行銷 Hero。
- 常用命令使用熟悉圖示；選項使用 select、切換使用 segmented control。
- 固定工具列、地圖、按鈕、icon 與時間線尺寸，避免資料載入後位移。
- 所有長名稱、地址與備註都必須能換行或截斷，不得重疊。

## 除錯工作流

遇到錯誤時依序執行：

1. `reproduce`：確認問題與重現條件。
2. `localize`：定位到前端、Apps Script、Sheets 或外部 API。
3. `reduce`：縮小到最小失敗路徑。
4. `fix`：修正根因，避免順手大改無關程式。
5. `guard`：加入可重複的語法、關鍵字或操作驗證。
6. 完整走一次原始使用流程。

## 架構與拆檔順序

- 第一階段：`api.js`、`cache.js`、`utils.js`。
- 第二階段：`maps.js`、`places.js`。
- 第三階段：`itinerary.js`、`hotels.js`、`expenses.js`。
- 每次只搬一組內聚邏輯；相同邏輯換位置後也必須重新驗證。
- Project Scaffolding 類 Skill 只用於新專案或明確要求的大型重整。

## Places 與地圖規則

- Place Details 僅能要求名稱、地址、座標、`place_id` 與必要類型。
- 不得加入 `photos`、圖片 URL、圖片補抓或圖片過期刷新。
- `行程定位` 只能使用資料庫中已保存的 `lat/lng`。
- 無座標資料不列入定位清單。
- 定位可執行 `panTo`、必要 zoom、marker 高亮與 info window。
- `探點搜尋` 可使用 Autocomplete、限定欄位的 Place Details 與 Geocoding，但只顯示暫時 marker，不新增行程。
- 探點與行程定位面板必須互斥開啟，且探點不得要求 Places Photo 或其他圖片欄位。

## 功能資料規則

- 交通資訊沿用 itinerary `message`，首行為版本化 JSON envelope；目前只顯示班次、航廈／月台與 itinerary `time` 出發時間，舊交通欄位資料不得被清除。
- 共同旅費錢包開關使用 `trips.shared_wallet_enabled`；存入與支出只寫入 `SharedWalletTransactions`，不得寫入 `people` 或 `expenses`。
- 一般分帳只處理真實旅伴。舊資料若包含 `公帳`，只在前端排除並提示，不得自動刪除或轉換。
- 錢包存入不是支出；旅程實際支出為個人分帳支出加上錢包 payment。
- 正式與備案互轉必須更新原 ID、`is_alternative` 與兩側排序，不得複製成另一筆資料。

## 版本與快取

- 版本格式使用 `YYYYMMDD.NN`。
- 同步更新 `config.js`、`cache-refresh.js`、`index.html` 註解及所有 CSS/JS query string。
- 有獨立版本常數的前端腳本也要同步。
- Apps Script 後端版本可與前端一致，但部署仍是獨立動作。

## GitHub 與部署

1. 檢查工作樹與預計提交的檔案。
2. 只暫存本次需求相關變更。
3. 完成檢查後建立清楚的本機提交。
4. 使用者說「推送」或「上板」後才執行 `git push`。
5. Apps Script 後端有修改時，另外提醒需要建立新部署版本。
