# Travel 換機交接

更新日期：2026-07-16

這份文件用於把目前尚未上板的 Travel 工作安全帶到另一台電腦。專案是 GitHub Pages 靜態前端，沒有 npm 建置步驟。

## 目前狀態

- Repository：`https://github.com/Kim-YCH/Travel`
- 正式分支：`main`
- 前端版本：`20260708.14`
- Apps Script 後端版本：`20260708.11`
- 最新功能基準提交：`55d908c Add transport schedules and shared travel wallet`
- 本機 `main` 目前包含尚未推到 `origin/main` 的修改。
- 尚未推送正式分支，也尚未部署新版 Apps Script。
- 後端本次沒有修改，因此換機後不需要重新部署 Apps Script。

## 本次已完成

- 行程新增 `交通` 類型；在編輯卡片中可填方式、班次、航廈／月台、座位與報到時間。
- 交通資料沿用 itinerary `message` 欄位，以版本化 metadata envelope 保存，不新增 Sheet 欄位。
- 分帳頁新增共同旅費錢包；成員可存入公費，支出付款人可選 `公帳`。
- 公費存入不列入消費總額；公帳實際支出仍列入消費與分攤。
- 備案卡新增轉正式行程按鈕，更新原資料的 `is_alternative`，不建立重複 ID。
- 行程地圖定位與探點搜尋仍保留；前端不得重新加入 Google Places Photo。

## 尚待實機測試

1. 新增一筆 `交通` 行程，再從編輯卡片填入班次資料，重新整理後確認仍正常顯示。
2. 由兩位成員存入公費，再建立一筆付款人為 `公帳` 的支出，確認餘額與分攤正確。
3. 將一筆備案轉成正式行程，重新整理後確認只剩同一筆資料且排序正確。
4. 手機檢查三個備案操作按鈕是否容易點擊，卡片文字是否沒有重疊。
5. 第 13 項分享功能尚未修改；建議後續採 `navigator.share()`，不支援時退回剪貼簿。

## 舊電腦：安全推送換機分支

GitHub Pages 若由 `main` 發布，直接推送 `main` 可能讓未測版本上板。換機時先建立獨立分支：

```powershell
cd C:\Users\Administrator\py\data\git\Travel
git status -sb
git switch -c transfer/20260708.14
git push -u origin transfer/20260708.14
```

推送完成後確認遠端分支存在：

```powershell
git branch -vv
git ls-remote --heads origin transfer/20260708.14
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
git switch --track origin/transfer/20260708.14
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
git switch --track origin/transfer/20260708.14
git status -sb
```

若本機已經建立過同名分支，改用：

```powershell
git switch transfer/20260708.14
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
git merge --ff-only transfer/20260708.14
git push origin main
```

推送 `main` 可能觸發 GitHub Pages 發布。Apps Script 後端仍維持 `20260708.11`，不要建立新部署。

## 給新 Codex 對話的開場指令

```text
請先閱讀 docs/computer-handoff.md、docs/workflow.md、docs/architecture.md，
再執行 git status -sb 與 git log -8 --oneline。
目前先在 transfer/20260708.14 測試，不要推送 main，也不要部署 Apps Script。
保留 GitHub Pages + Vue 3 CDN + Apps Script + Google Sheets 架構。
```
