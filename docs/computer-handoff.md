# Travel 換機交接

更新日期：2026-07-16

這份文件用於把目前尚未上板的 Travel 工作安全帶到另一台電腦。專案是 GitHub Pages 靜態前端，沒有 npm 建置步驟。

## 目前狀態

- Repository：`https://github.com/Kim-YCH/Travel`
- 正式分支：`main`
- 前端版本：`20260716.1`
- Apps Script 後端版本：`20260716.1`
- 本機 `main` 目前包含尚未推到 `origin/main` 的修改。
- 尚未推送正式分支，也尚未部署新版 Apps Script。
- 後端已修改；正式使用共同旅費錢包前必須重新部署 Apps Script。

## 本次已完成

- 行程保留 `交通` 類型；交通資訊只顯示班次、航廈／月台與出發時間，舊 metadata 仍可讀取。
- 正式與備案可雙向互轉，更新原資料的 `is_alternative`，不建立重複 ID。
- 設定頁可開關共同旅費錢包，設定存於 `trips.shared_wallet_enabled`。
- Apps Script 會自動建立 `SharedWalletTransactions`，獨立保存 deposit 與 payment。
- `公帳` 不再是成員、付款人或分攤對象；舊公帳 expense 保留但排除於一般分帳。
- 分帳摘要分開顯示個人分帳支出、共同錢包支出與旅程實際支出。
- 行程地圖定位與探點搜尋仍保留；前端不得重新加入 Google Places Photo。

## 尚待實機測試

1. 新增一筆 `交通` 行程，填入班次、航廈／月台與出發時間，重新整理後確認仍正常顯示。
2. 開啟共同旅費錢包，以實際日期新增存入及支出，確認餘額與三種支出摘要正確。
3. 將正式行程轉備案，再轉回正式，重新整理後確認只剩同一筆資料且排序正確。
4. 手機檢查正式與備案的三個操作按鈕是否容易點擊，卡片文字是否沒有重疊。
5. 第 13 項分享功能尚未修改；建議後續採 `navigator.share()`，不支援時退回剪貼簿。

## 舊電腦：安全推送換機分支

GitHub Pages 若由 `main` 發布，直接推送 `main` 可能讓未測版本上板。換機時先建立獨立分支：

```powershell
cd C:\Users\Administrator\py\data\git\Travel
git status -sb
git switch -c transfer/20260716.1
git push -u origin transfer/20260716.1
```

推送完成後確認遠端分支存在：

```powershell
git branch -vv
git ls-remote --heads origin transfer/20260716.1
```

不要執行 `git push origin main`，直到實機測試完成並決定上板。

## 新電腦：第一次取得專案

先確認 GitHub CLI 已登入：

```powershell
git --version
gh --version
gh auth status
```

尚未安裝時可使用 Windows Package Manager：

```powershell
winget install --id Git.Git -e
winget install --id GitHub.cli -e
winget install --id OpenJS.NodeJS.LTS -e
gh auth login
```

Clone 並切到換機分支：

```powershell
cd D:\Work
gh repo clone Kim-YCH/Travel
cd Travel
git fetch origin
git switch --track origin/transfer/20260716.1
git status -sb
git log -8 --oneline
```

`D:\Work` 可以換成新電腦預計存放專案的資料夾。

## 新電腦：已經有舊 Clone

先檢查是否有未保存修改：

```powershell
cd D:\Work\Travel
git status --short
```

若上面有輸出，先停止並提交或另外備份那些修改。工作樹乾淨時再執行：

```powershell
git fetch origin
git switch --track origin/transfer/20260716.1
git status -sb
```

若本機已經建立過同名分支，改用：

```powershell
git switch transfer/20260716.1
git pull --ff-only
```

## 本機啟動與檢查

專案不需要 `npm install`。在專案根目錄啟動靜態伺服器：

```powershell
python -m http.server 8000
```

瀏覽器開啟：

```text
http://127.0.0.1:8000/
```

若 `8000` 已被使用，可改成 `8001`。基本檢查指令：

```powershell
node --check app.js
Get-ChildItem js -File -Filter *.js | ForEach-Object { node --check $_.FullName }
git diff --check
git status -sb
```

Node.js 只用於語法檢查，網站執行本身不需要 Node 或 npm。

## 測試完成後上板

確認換機分支測試正常後，再把它快轉合併到 `main`：

```powershell
git switch main
git pull --ff-only origin main
git merge --ff-only transfer/20260716.1
git push origin main
```

推送 `main` 可能觸發 GitHub Pages 發布。共同旅費錢包需要先把 `apps-script-backend.gs` 建立為新的 Apps Script 部署版本。

## 給新 Codex 對話的開場指令

```text
請先閱讀 docs/computer-handoff.md、docs/workflow.md、docs/architecture.md，
再執行 git status -sb 與 git log -8 --oneline。
目前先在 transfer/20260716.1 測試，不要推送 main；確認功能後再部署 Apps Script。
保留 GitHub Pages + Vue 3 CDN + Apps Script + Google Sheets 架構。
```
