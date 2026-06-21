# 蛋糕店路過通知系統 — 部署教學

這份教學完全不需要寫程式，跟著步驟做就可以了。整個流程大概會用到：

- 一個 **GitHub** 帳號（放程式碼）
- 一個 **Render** 帳號（讓程式碼 24 小時跑在網路上，免費方案即可）
- 你已經申請好的 **LINE 官方帳號 Messaging API** 金鑰

預計花費時間：第一次設定大約 30–45 分鐘，之後不用再重複這些步驟。

---

## 系統能做到什麼、限制是什麼（請先讀過一遍）

1. **只能通知「已經加好友＋已完成綁定」的客戶**。LINE 的規定是：店家不能直接用手機號碼傳訊息給人，只能傳給已加好友、且系統知道對方 LINE 帳號代碼（userId）的人。所以：
   - 客戶要先加 LINE 官方帳號好友（你目前大部分客戶已經加了 ✅）
   - 每位客戶要**完成一次性的「綁定」**：回覆手機末3碼給官方帳號，系統就會自動把他的 LINE 帳號跟你資料庫裡的客戶資料對起來。之後就可以一直收到通知，不用再綁一次。
   - 系統裡有一個「廣播邀請綁定訊息」按鈕，可以一次邀請所有現有好友來綁定。

2. **「路線3公里內」是用「起點到終點直線」計算，不是真實道路距離**。對日常送貨判斷已經很夠用；如果想要更精準的「實際開車路線」，未來可以再升級加裝路徑規劃功能（需要額外申請 Google Maps API，會有費用）。

3. **資料庫是用一個簡單的檔案存資料**，足夠應付 50～數百筆客戶。缺點是：以後如果有人「重新部署程式碼」（例如修改功能再上傳），資料可能會被清空。系統裡有「匯出備份／匯入備份」功能，建議每次新增一批客戶後就匯出存一份，養成習慣即可，不會有資料遺失風險。

4. **Render 免費方案會在沒人使用 15 分鐘後自動休眠**，下次打開網頁時可能要等 30～50 秒才會喚醒，是正常現象，稍等一下即可。

---

## 步驟一：把程式碼放到 GitHub

1. 到 [github.com](https://github.com) 註冊一個帳號（如果還沒有的話）。
2. 登入後，右上角點 `+` → `New repository`。
3. Repository name 填 `cake-notify`（或任何你喜歡的名字），其餘保持預設，按 `Create repository`。
4. 進到新建立的頁面，會看到 `uploading an existing file` 的連結，點下去。
5. 把我提供給你的整個資料夾（`cake-notify`）裡的所有檔案、資料夾**直接拖曳上傳**（`node_modules` 資料夾不用上傳，沒有的話也沒關係，部署時會自動安裝）。
6. 下方填寫一句說明（例如「first commit」），按 `Commit changes`。

> 如果你不熟悉 GitHub 操作，也可以請任何懂一點點電腦的朋友幫忙做這一步，大概 5 分鐘就能完成，之後步驟都在網頁上點一點就好。

---

## 步驟二：在 Render 部署

1. 到 [render.com](https://render.com) 註冊帳號，建議直接選「使用 GitHub 帳號登入」，這樣可以直接串接你剛剛建立的 repository。
2. 登入後，按 `New` → `Web Service`。
3. 選擇你剛剛上傳的 `cake-notify` repository，按 `Connect`。
4. 設定畫面中：
   - **Name**：自己取一個名字，例如 `my-cake-notify`
   - **Region**：選 Singapore（離台灣最近）
   - **Branch**：`main`
   - **Build Command**：`npm install`
   - **Start Command**：`npm start`
   - **Instance Type**：選 `Free`
5. 往下捲到 **Environment Variables**，按 `Add Environment Variable`，依序加入這三個：

   | Key | Value |
   |---|---|
   | `ADMIN_PASSWORD` | 自己設一個登入密碼（例如 `cake2026!`），等一下打開網頁時會用到 |
   | `LINE_CHANNEL_ACCESS_TOKEN` | 你的 LINE Messaging API Channel access token |
   | `LINE_CHANNEL_SECRET` | 你的 LINE Messaging API Channel secret |

   這兩組 LINE 金鑰可以在 [LINE Developers Console](https://developers.line.biz/console/) → 選擇你的 Channel → `Messaging API` 分頁裡找到。

6. 按下方的 `Create Web Service`，Render 就會開始安裝、部署，大約 2–5 分鐘。
7. 部署完成後，畫面上方會出現一個網址，類似 `https://my-cake-notify.onrender.com`，這就是你之後要打開使用的網址，建議存到手機書籤。

---

## 步驟三：設定 LINE Webhook（讓客戶可以「綁定」）

1. 回到 [LINE Developers Console](https://developers.line.biz/console/) → 選擇你的 Channel → `Messaging API` 分頁。
2. 找到 **Webhook URL**，填入：`你的Render網址/webhook`（例如 `https://my-cake-notify.onrender.com/webhook`）。
3. 按 `Verify` 測試連線成功（如果失敗，先確認 Render 部署是否已完成，稍等一下再試）。
4. 把 **Use webhook** 打開（啟用）。
5. 建議同時把官方帳號後台（LINE Official Account Manager）裡的「**自動回應訊息**」關閉，避免跟系統自動回覆的綁定訊息互相干擾。

---

## 步驟四：開始使用

1. 打開你的 Render 網址，瀏覽器會跳出登入視窗，輸入帳號隨便填、密碼填你剛剛設定的 `ADMIN_PASSWORD`。
2. 進到「**客戶管理**」分頁，先用「批次匯入」把現有 50 位客戶的「姓名,電話,地址」貼上去（每行一筆，用逗號分隔），系統會自動轉換地址成座標。
3. 進到「**設定與備份**」分頁，按「廣播邀請綁定訊息」，邀請目前所有好友回覆手機末3碼完成綁定。客戶回覆後，系統會自動完成綁定並回覆確認訊息給他們。
4. 之後每天送貨前，到「**今天路線**」分頁，貼上今天要送貨的地點（依序，一行一個），按「計算附近客戶」，確認名單後按「一鍵發送通知」即可。

---

## 之後如果要更新功能

如果之後想請人調整或增加功能，記得**先在「設定與備份」按「匯出備份」**，等新版本部署完成後，再用「匯入備份」把資料還原回去，避免資料遺失。

---

## 遇到問題怎麼辦

- **網頁打不開／一直轉圈**：通常是 Render 免費方案在「喚醒中」，等 30–50 秒重新整理看看。
- **地址定位失敗**：地址寫法盡量完整（縣市＋區＋路名＋門牌號碼），太簡略或太新的建案地址有時候查不到，可以到客戶名單按「重新定位」再試一次，或改用附近的明顯地標地址。
- **客戶收不到通知**：先確認該客戶名單上的狀態是不是「未綁定」，未綁定的人需要先回覆手機末3碼才能收到推播。
- **Webhook Verify 失敗**：確認 Render 服務狀態是 `Live`（不是還在部署中），以及網址結尾有沒有打對 `/webhook`。
