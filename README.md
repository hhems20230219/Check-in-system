# 新興救護分隊出勤管理系統

## 一、系統簡介

「新興救護分隊出勤管理系統」是一套以網頁方式運作的出勤管理工具，主要用於救護義消人員的：

- 協勤簽到
- 協勤簽退
- 公差勤務紀錄
- 常年訓練簽到
- 常年訓練請假
- 協勤時數統計
- 出勤紀錄查詢
- 資料匯出

系統設計目標為：

- 簡單
- 穩定
- 易懂
- 易維護
- 易擴充
- Bootstrap 原生排版一致
- 前後端責任清楚
- 設定集中管理

---

## 二、使用技術

### 前端

- HTML5
- Bootstrap 5
- jQuery
- Font Awesome
- DataTables Bootstrap 5 Responsive

### 後端

- Google Apps Script

### 資料庫

- Google Sheet

---

## 三、專案檔案結構

```text
attendance-system/
├─ index.html
├─ export.html
├─ system-guide.html
├─ index.css
├─ index.js
├─ location.js
├─ mockData.json
└─ README.md
```

---

## 四、Google Apps Script 檔案結構

```text
apps-script/
├─ code.gs
├─ config.gs
├─ read.gs
├─ create.gs
└─ update.gs
```

---

## 五、Google Sheet 結構

### 人員資料

| 欄位 | 說明 |
|---|---|
| id | 人員唯一識別碼 |
| 單位 | 所屬單位 |
| 職稱 | 人員職稱 |
| 姓名 | 人員姓名 |
| 身分證字號 | 身分識別資料 |
| 啟用 | 是否啟用 |

---

### 出勤紀錄

| 欄位 | 說明 |
|---|---|
| id | 紀錄唯一識別碼 |
| 建立時間 | 紀錄建立時間 |
| 單位 | 人員單位 |
| 職稱 | 人員職稱 |
| 姓名 | 人員姓名 |
| staffId | 對應人員 id |
| 協勤種類 | 協勤 / 常年訓練 / 公差勤務 |
| 服勤類別 | 出勤 / 待命協勤 / 簽到 / 請假 |
| 簽到日期 | 簽到日期 |
| 簽到時間 | 簽到時間 |
| 簽退日期 | 簽退日期 |
| 簽退時間 | 簽退時間 |
| 工作內容 | 工作內容 |
| 簽名 | Canvas Base64 或 Drive 檔案路徑 |
| 時數 | 系統計算時數 |

---

## 六、主要功能說明

### 1. 使用者切換

Navbar 顯示目前使用者資訊：

- 單位
- 職稱
- 姓名

若尚未選擇使用者，顯示 `-`。

若原本已選擇的人員後來被停用，系統會自動：

- 清空目前使用者
- Navbar 顯示 `-`
- Summary 清空
- 出勤紀錄清空
- 要求重新切換使用者

---

### 2. 定位檢查

定位功能由 `location.js` 管理。

可設定：

- 是否啟用定位檢查
- 合法定位點
- 允許距離範圍

目前合法地點：

| 地點 | 緯度 | 經度 |
|---|---:|---:|
| 新興分隊 | 22.63079897490298 | 120.31128600119564 |
| 日月光K11 | 22.722299033254743 | 120.30463460899924 |
| 吉林街 | 22.64429795493502 | 120.30653292981619 |

定位規則：

| 協勤種類 | 是否需要定位 |
|---|---|
| 協勤 | 需要 |
| 常年訓練 | 需要 |
| 公差勤務 | 不需要 |

定位狀態區只顯示 Badge：

- 尚未定位
- 定位成功
- 定位失敗
- 定位逾時

詳細定位訊息顯示在系統狀態通知區。

---

### 3. 簽到功能

支援：

- 協勤
- 常年訓練
- 公差勤務

常年訓練服勤類別：

- 簽到
- 請假

規則：

- 協勤與常年訓練需定位成功
- 公差勤務不需定位
- 常年訓練同一人同一月份只能登記一次
- 常年訓練的簽到 / 請假會存入 `serviceType`

送出前會跳出確認視窗。

---

### 4. 簽退功能

支援：

- 協勤
- 公差勤務

協勤服勤類別：

- 待命協勤
- 出勤

工作內容規則：

| 協勤種類 | 服勤類別 | 工作內容 |
|---|---|---|
| 協勤 | 出勤 | 必填 |
| 協勤 | 待命協勤 | 不顯示、不必填 |
| 公差勤務 | - | 必填 |
| 常年訓練 | - | 不提供簽退 |

簽退功能包含：

- 自動找最後一筆未簽退紀錄
- 填寫工作內容
- Canvas 手寫簽名
- 自動計算時數
- 送出前確認視窗

---

### 5. Summary 統計區

首頁 Summary 分為三欄：

#### 左：總協勤時數

- 不使用進度條
- 只統計目前使用者
- 只統計 `dutyType = 協勤`
- 只統計已有 `hours` 的紀錄

#### 中：本月協勤時數

標題固定為：

```text
本月協勤時數
```

規則：

```text
每月達 4 小時，或近 3 個月達 12 小時
```

若本月達 4 小時：

```text
本月協勤時數
4 小時
100%
本月已達目標 4 小時
```

若本月未達 4 小時：

```text
本月協勤時數
0 小時
88%
本月 0 小時；03月-05月 10.5 / 12 小時
```

進度條顏色：

| 完成率 | 顏色 |
|---|---|
| 低於 50% | 紅色 |
| 50% 以上 | 黃色 |
| 90% 以上 | 綠色 |

#### 右：常年訓練次數

- 只統計目前使用者
- 只統計 `dutyType = 常年訓練`
- 只統計 `serviceType = 簽到`
- 請假不列入完成次數

---

### 6. 出勤紀錄查詢

出勤紀錄只顯示目前使用者資料。

支援：

- 全部
- 月份
- 日期區間
- 搜尋
- 分頁
- 排序
- 響應式表格

---

## 七、資料模式切換

前端可透過 `appConfig.useMockData` 切換資料來源。

```javascript
const appConfig = {
    useMockData: true,
    mockDataUrl: "./mockData.json",
    googleScriptUrl: "請填入你的 Google Apps Script Web App URL"
};
```

### true

讀取：

```text
mockData.json
```

### false

呼叫：

```text
Google Apps Script Web App URL
```

---

## 八、API 流程

### Read

```text
前端查詢
→ doGet(action=readAll)
→ 讀取 Google Sheet
→ 回傳 JSON
```

### Create

```text
前端表單送出
→ doPost(action=create)
→ 寫入 Google Sheet
```

### Update

```text
前端送出 id + 修改資料
→ doPost(action=update)
→ 找到指定列更新
```

### Delete

本系統不實作 Delete。

原因：

- 避免誤刪資料
- 避免出勤紀錄遺失
- 保留後續稽核依據

---

## 九、維護原則

本系統開發時應遵守：

- Bootstrap 原生排版
- 不過度客製 CSS
- 不使用複雜框架
- 命名一致
- JavaScript 使用 camelCase
- 設定集中管理
- 模組化
- 前後端責任分離
- 不把商業邏輯寫死在 UI
- 每段程式碼需有清楚註解
- 不確定的地方不要猜測

---

# 十、完整修正後可直接使用的開發提示詞

以下提示詞可直接貼給 AI，用來重新產生或維護本系統。

```text
我要實作一套「新興救護分隊出勤管理系統」。

請以正式可維護專案方式設計，重視：
簡單、穩定、易懂、易維護、易擴充、Bootstrap 原生排版一致性、集中設定管理、前後端責任清楚。

技術需求：
前端：HTML、Bootstrap 5、jQuery、Font Awesome
後端：Google Apps Script
資料庫：Google Sheet

前端檔案結構：
attendance-system/
├─ index.html
├─ export.html
├─ system-guide.html
├─ index.css
├─ index.js
├─ location.js
├─ mockData.json
└─ README.md

Apps Script 檔案結構：
├─ code.gs
├─ config.gs
├─ read.gs
├─ create.gs
└─ update.gs

資料模式：
可透過 useMockData true/false 切換：
true：讀取 mockData.json
false：呼叫 Google Apps Script API

Google Sheet 結構：

人員資料：
id、單位、職稱、姓名、身分證字號、啟用

出勤紀錄：
id、建立時間、單位、職稱、姓名、staffId、協勤種類、服勤類別、簽到日期、簽到時間、簽退日期、簽退時間、工作內容、簽名、時數

人員規則：
只顯示 enabled 為 true / TRUE / true / 是 / 1 的人員。
若原本 localStorage 已選擇的人員後來 enabled 變成 false，Navbar 必須自動顯示為「-」，currentUser 清空，Summary 清空，出勤紀錄清空，並要求重新切換使用者。

Navbar：
使用 Bootstrap Navbar。
左側顯示系統名稱。
fa-truck-medical icon 要紅色。
Navbar 增加：
首頁、資料匯出、系統說明。
首頁、資料匯出、系統說明可在小螢幕收進漢堡選單。
單位、職稱、姓名與切換按鈕在畫面縮小時不要收進漢堡選單。
右側固定顯示：
單位 icon + 單位
職稱 icon + 職稱
姓名 icon + 姓名
切換按鈕
未選擇使用者時全部顯示「-」。

切換使用者 Modal：
單位 input readonly，灰色鎖定。
職稱 input readonly，灰色鎖定。
姓名為下拉選單。
切換姓名時，單位與職稱同步更新。
確定後更新 Navbar、Summary、出勤紀錄。

時間區：
黑底白字，置中。
第一行 HH:mm:ss，大字粗體。
第二行 YYYY-MM-DD，小字。
每秒更新。
時間字體要清楚偏大。

定位區：
顯示「定位狀態」文字，字體加大、粗體。
定位狀態 Badge 放在「定位狀態」文字後方。
重新定位按鈕靠最右邊。
定位狀態區只顯示 Badge：
尚未定位、定位成功、定位失敗、定位逾時。
其他詳細定位資訊全部顯示在系統狀態通知區。

GPS 設定集中在 location.js。
可設定：
enableLocationCheck true/false
allowedRadiusMeters
allowedLocations

合法地點：
新興分隊：
緯度 22.63079897490298
經度 120.31128600119564

日月光K11：
緯度 22.722299033254743
經度 120.30463460899924

吉林街：
緯度 22.64429795493502
經度 120.30653292981619

定位規則：
協勤、常年訓練需要定位成功。
公差勤務不需要定位。

定位訊息需逐步合理：
1. 權限被拒絕：提醒先允許瀏覽器定位權限。
2. 無法取得位置：提醒確認裝置定位功能已開啟，並移到較空曠處後重新定位。
3. 定位逾時：提醒移到較空曠處後重新定位。
4. 有取得位置但距離太遠：顯示最近合法地點與距離，並提醒若實際已在指定地點附近，可嘗試開啟 WiFi 或藍牙提高定位精準度。

系統狀態通知區：
使用 Bootstrap Alert。
預設隱藏。
用於顯示成功、錯誤、定位、API 回傳訊息。

操作按鈕：
簽到、簽退上下排列。
按鈕文字粗體。
簽到按鈕使用 success。
簽退按鈕使用 danger。

簽到 Modal：
標題加入適當 Font Awesome icon。
欄位 label 加入適當 icon。
必填欄位後方加紅色 *。

欄位：
協勤種類：
協勤、常年訓練、公差勤務

常年訓練時顯示「服勤類別」：
簽到、請假

職稱 readonly，灰色鎖定。
姓名為下拉選單。
姓名變更時，職稱要同步更新。

簽到日期：date
簽到時間：select，00/30 分鐘間隔

送出按鈕文字為「送出」，加入適當 icon。

簽到送出前：
先完成驗證。
再跳出確認視窗，列出：
單位、職稱、姓名、協勤種類、服勤類別、簽到日期、簽到時間。
使用者按確定才真正送出。

簽到規則：
協勤、常年訓練需定位成功。
公差勤務不需定位。
常年訓練同一人同一月份只能有一筆簽到或請假紀錄。
常年訓練的「簽到 / 請假」要存入服勤類別 serviceType。

簽退 Modal：
標題加入適當 Font Awesome icon。
欄位 label 加入適當 icon。
必填欄位後方加紅色 *。

欄位：
協勤種類：
協勤、公差勤務

服勤類別：
協勤時顯示：
待命協勤、出勤
公差勤務不顯示服勤類別。

職稱 readonly，灰色鎖定。
姓名為下拉選單。
姓名變更時，職稱要同步更新。

簽退日期：date
簽退時間：select，00/30 分鐘間隔

工作內容：
協勤 + 出勤 必填且顯示。
協勤 + 待命協勤 不顯示、不必填。
公差勤務 必填且顯示。
常年訓練沒有簽退。

簽名：
Canvas 可簽名。
可清除簽名。
送出時需匯出 Base64。
簽名必填。

送出按鈕文字為「送出」，加入適當 icon。

簽退送出前：
先完成驗證。
再跳出確認視窗，列出：
單位、職稱、姓名、協勤種類、服勤類別、簽到日期、簽到時間、簽退日期、簽退時間、時數、工作內容。
使用者按確定才真正送出。

簽退規則：
依 staffId + 協勤種類 找最後一筆未簽退紀錄。
常年訓練不可簽退。
簽退後計算時數。
時數若小於等於 0 則為 0。

Summary 區：
一行三欄，由左至右。
每張卡片標題加入適當 icon。

左：總協勤時數
不需要進度條。
只統計目前切換使用者。
只統計 dutyType 為「協勤」且有 hours 的紀錄。

中：本月協勤時數
標題固定顯示「本月協勤時數」。
顯示數字永遠是本月協勤時數。
規則：
每月達 4 小時，或近 3 個月達 12 小時。
若本月 >= 4：
顯示：
本月協勤時數
4 小時
100%
本月已達目標 4 小時

若本月 < 4：
數字仍顯示本月時數。
進度條改用近三個月時數 / 12 小時計算。
顯示：
本月協勤時數
0 小時
88%
本月 0 小時；03月-05月 10.5 / 12 小時

進度條顏色：
低於 50%：紅色
50% 以上：黃色
90% 以上：綠色

右：XXXX年常年訓練次數
顯示常年訓練簽到次數。
請假不計入次數。
進度條下方小字顯示：
N/12次

出勤紀錄區：
使用 Bootstrap Table + DataTables Bootstrap 5 Responsive。
只顯示目前切換使用者的紀錄。
切換使用者後，表格與 Summary 要立即同步更新。

欄位：
協勤種類、服勤類別、簽到日期、簽到時間、簽退日期、簽退時間、時數

篩選：
可選全部。
可選月份。
可選日期區間。
支援搜尋、分頁、排序、響應式。

mockData.json：
至少 5 個人。
要有不同單位、不同職稱。
要包含各種情境：
1. 本月協勤滿 4 小時。
2. 本月未滿 4 小時，但近 3 個月接近或達 12 小時。
3. 常年訓練簽到。
4. 常年訓練請假。
5. 公差勤務。
6. 待命協勤。
7. 出勤。
8. 未簽退紀錄。
9. enabled false 的人員，用來測試停用後 Navbar 回到「-」。

console.log 規範：
需使用工程化 log，不要零散 console.log。
建立：
logInfo(message, data)
logWarn(message, data)
logError(message, error)

主要流程都要有 log：
系統初始化
事件綁定
DataTables 初始化
mockData 載入
Google Sheet API 載入
使用者切換
localStorage 還原
人員停用清除
簽到開啟
簽退開啟
簽到驗證
簽退驗證
確認視窗
API GET / POST
API 回應
表格渲染
Summary 計算
定位結果
簽名板初始化與清除

log 文字請使用繁體中文，語氣工程化，例如：
[INFO] 系統初始化開始
[WARN] 使用者驗證失敗，目前沒有啟用中的使用者
[ERROR] Google Sheet 資料讀取失敗

API 流程：
Create：
前端表單送出
→ doPost(action=create)
→ 寫入 Google Sheet

Read：
前端查詢
→ doGet(action=readAll)
→ 讀取 Google Sheet
→ 回傳 JSON

Update：
前端送出 id + 修改資料
→ doPost(action=update)
→ 找到指定列更新

不實作 Delete。
原因：
避免誤刪資料、出勤紀錄遺失、後續稽核問題。

Apps Script：
config.gs 集中管理：
Sheet 名稱、欄位名稱、狀態設定。
禁止欄位名稱散落各檔案。

read.gs：
查詢人員資料、查詢出勤紀錄、查詢 summary 所需資料。

create.gs：
新增出勤紀錄。

update.gs：
更新簽退資料。

code.gs：
doGet、doPost、action routing。

system-guide.html：
需能在網頁中讀取並顯示「系統說明.md」。
使用 marked.js 將 Markdown 轉成 HTML。
系統說明連結不要 target="_blank"，不要另外開新頁籤。

README.md：
除了介紹系統，也要放入此完整提示詞，方便後續維護。

開發規範：
Bootstrap 原生排版。
不要過度客製 CSS。
不使用複雜框架。
命名一致。
變數使用 camelCase。
集中設定。
模組化。
前後端責任分離。
不要把商業邏輯寫死在 UI。
每一段切分都要有註解。
CSS 每一段都要有註解。
console.log 使用繁體中文工程化說明。
不確定的地方請直接說不知道，不要猜。

請提供：
完整可貼上的程式碼。
完整檔案內容。
有修改的檔案才需要重寫。
避免只修表面。
要一起檢查相關邏輯。
程式需符合正式專案可維護標準。
```

---

## 十一、後續可擴充方向

- Line Notify / LINE Messaging API 推播
- Google Drive 儲存簽名圖片
- 權限控管
- QR Code 打卡
- 出勤地圖
- 行政報表
- Excel 匯出
- 常訓提醒
- AI 出勤統計分析

---

## 十二、版本資訊

| 項目 | 說明 |
|---|---|
| 系統名稱 | 新興救護分隊出勤管理系統 |
| 前端 | HTML、Bootstrap 5、jQuery |
| 後端 | Google Apps Script |
| 資料庫 | Google Sheet |
| 表格套件 | DataTables Bootstrap 5 Responsive |
| 圖示 | Font Awesome |
| 文件 | Markdown |
| 維護模式 | 前後端分離、集中設定 |
