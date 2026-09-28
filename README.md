# 跨平台多視窗圖片輪播系統 (Midea Player)

這是一款專為 Windows 筆電、平板裝置與 Android 手機設計的跨平台高階圖片瀏覽器。本系統透過靈活的「螢幕分割」技術與「動態控制邏輯」，實現高度客製化的圖片輪播體驗。

---

## 1. 產品概述

本系統允許使用者匯入多個資料夾，並根據所選的分割樣板動態展示圖片。系統具備以下特色：

- **AI 智慧 Viewport 裁切**：對圖片執行離線人臉偵測，自動計算最佳裁切區域（Zoom-in），讓人物主體永遠是畫面焦點
- **手動標註校正**：針對 AI 辨識失敗的圖片，提供拖曳式手動框選工具進行人工 Viewport 修正
- **沉浸式 Kiosk 模式**：滑鼠/觸控靜止後自動隱藏 UI，提供最純粹的視覺展示體驗
- **雙平台發布**：Windows (Electron) 可打包為獨立 `.exe`；Android (Capacitor) 可安裝為原生 APK

---

## 2. 核心功能規格 (Functional Requirements)

### 2.1 來源與資料管理 (Data Source)
* **多目錄選擇與管理：** 透過 Electron 呼叫原生的檔案選擇器 (File Picker)，允許使用者同時加入多個不同的本機目錄或網路磁碟路徑。支援「單一刪除 (移除特定目錄)」與「全部清除」的便捷操作。
* **檔案聚合：** 將所選目錄下的所有支援圖片格式 (JPG, PNG, WebP) 建立為虛擬的「播放清單 (Playlist)」。
* **子目錄關鍵字篩選：** 可設定關鍵字，在深度掃描時只包含名稱含有特定關鍵字的子目錄（如「高解析」、「model_A」）。
* **影像預處理：** 系統載入圖片時，會透過 EXIF 資訊進行自動轉正 (Auto-rotate)，避免直式手機照片在螢幕上橫躺。

### 2.2 AI Viewport 偵測與 Viewport DB 系統

這是系統的核心特色功能。整個流程分為三個階段：**自動偵測 → 手動修正 → 播放套用**。

#### 階段一：自動展示偵測（ScanView — Auto-Detect）

系統在播放前可選擇進入「Viewport 預掃描」模式，對選取目錄內的所有圖片執行**離線 AI 人臉偵測**：

* **AI 引擎（Windows）：** 使用 `@vladmandic/face-api`（TinyFaceDetector），完全在 Electron 渲染器內本機運行。
* **AI 引擎（Android）：** 使用 `@tensorflow-models/face-detection`（BlazeFace / MediaPipe），在 Android WebView 內本機運行。
* **偵測結果分類：**
  - `zoomed`（Zoom-in 成功）：偵測到人臉，且人臉周圍有足夠空間，系統計算出裁切區域讓人物主體填滿窗格
  - `unchanged`（判定正常）：偵測到人臉，但人物已填滿畫面，不需裁切；或人臉位置過於靠近邊緣
  - `unrecognized`（辨識失敗）：未偵測到人臉，記錄為 `failedFiles` 供後續手動標註
* **增量掃描（Skip & Reuse）三層快取策略：**
  1. **完整路徑命中 DB 且狀態成功** → `skipped`（完全跳過 AI）
  2. **同一 basename（如 `001.jpg`）在 DB 中已偵測過** → `reused`（複用結果，不跑 AI；適用於同一照片存放在多個 Model 子目錄的情形）
  3. **全新圖片** → 執行 AI 偵測
* **進度追蹤：** 即時顯示五色統計（Zoom-in / 正常 / 失敗 / 跳過 / 複用）與百分比進度條

#### 階段二：手動修正 Viewport（AnnotationView — Manual Correction）

針對 AI 辨識失敗（`unrecognized`）的圖片，系統提供 `AnnotationView` 手動標註工具：

* **操作方式：** 在圖片上**拖曳**或**點擊兩點**選取 Viewport 矩形區域（支援任意方向拖曳；ViewportCanvas 元件處理端點計算與座標正規化）
* **即時座標顯示：** 選取後即時顯示正規化座標（x, y, w, h 均以 0–1 表示）
* **操作選項：**
  - **✅ 確認標註（手動 Viewport）：** 將選取的矩形儲存為 `status: 'manual'`，立即原子性寫入 DB
  - **🖼 Check-out — 此圖維持原圖 (1:1)：** 為單張圖片設為不裁切（`status: 'unchanged'`，座標 0,0,1,1）
  - **♻ 全域 Check-out：** 對 DB 中所有相同 `basename` 的圖片批次設為維持原圖（跨 Model 子目錄一鍵解決重複問題）
  - **⏭ 跳過此張：** 暫時跳過，`failedFiles` 中仍保留，下次進入 AnnotationView 時繼續顯示
* **導覽：** 上一張 / 下一張，顯示目前進度與剩餘待處理數量

#### 階段三：Viewport 套用播放（PlaybackView — Rendering）

播放時，`GridCell` 元件從 `ViewportDb`（透過 `useViewportDb` hook）讀取每張圖片的 Viewport 設定，並套用裁切：

* **zoomed / manual：** 使用 `object-fit: none` + `object-position` 將正規化裁切座標轉換為 CSS，實現無損放大定位
* **unchanged（座標 0,0,1,1）：** 正常顯示（`object-fit: cover`）
* **未命中 DB（尚未掃描）：** 使用預設的 `object-fit: cover`

#### Viewport DB 儲存格式（Windows 版：`.viewport_db.json`）

每個掃描根目錄底下儲存一個 `.viewport_db.json`，格式如下：

```json
{
  "scannedAt": "2026-09-28T10:00:00.000Z",
  "rootDir": "D:/photos/model_A",
  "entries": {
    "D:/photos/model_A/001.jpg": {
      "status": "zoomed",
      "cropX": 0.15,
      "cropY": 0.05,
      "cropW": 0.70,
      "cropH": 0.78
    },
    "D:/photos/model_A/002.jpg": {
      "status": "unchanged",
      "cropX": 0, "cropY": 0, "cropW": 1, "cropH": 1
    },
    "D:/photos/model_A/group_photo.jpg": {
      "status": "manual",
      "cropX": 0.25, "cropY": 0.10, "cropW": 0.50, "cropH": 0.60
    }
  },
  "failedFiles": [
    "D:/photos/model_A/landscape_001.jpg"
  ]
}
```

> Android 版改用 Capacitor Preferences 儲存（key 為 `viewport_db_<目錄名>_`），結構完全相同。

### 2.3 畫面分割與佈局 (Layout & Grid)
* **自訂與非對稱佈局 (Irregular Layouts)：**
  * 除了嚴格的標準矩陣外，系統支援**「非對稱 / 任意排列」**的藝術設計。例如：「1大3小 雜誌風」、「置中焦點 (Center Focus, 中間最大外圍小)」、「相簿錯落排列」。
  * **隨機佈局生成：** 若使用者未指定，系統將在預設範圍內進行隨機分割。
* **動態互動邏輯 (核心業務邏輯)：**
  * **狀態 A（網格模式 ≤ 16）：** 游標懸停 (Hover) 於特定窗格時，**在該單一窗格內部浮現專屬的獨立控制列**（包含：暫停、繼續、上一張、下一張、以及 **💾 單張儲存** 按鈕）。
  * **懸停檔案資訊 (Hover File Info)：** 任何模式下滑鼠懸停時，浮現半透明資訊列顯示**該圖片的檔案名稱與完整路徑**。
  * **狀態 B（照片牆模式 Photo Wall > 16 至 100+）：**
    * 系統轉換為超高密度「照片牆」，具備縮圖機制與高密度 CSS Grid 渲染。
    * **活體牆面特效：** 每隔幾秒隨機抽換部分圖片（Random Pop 動畫）。
    * **探索式互動 (Lightbox)：** 游標懸停稍微放大；點擊任何圖片以 Lightbox 全螢幕彈出高解析度原圖。
* **沉浸式 Kiosk 模式 (Auto-hide UI)：** 滑鼠或觸控靜止超過一定時間（Windows: 3 秒 / Android: 5 秒），**自動隱藏所有控制列與滑鼠游標**。一旦滑鼠移動，控制列立刻平滑淡入恢復。

### 2.4 圖片操作與匯出 (Image Actions)
* **單張儲存 (Save Individual Image)：** 各個模式的獨立窗格控制列均提供「儲存單張圖片」按鈕，喚出系統原生對話框另存高解析度原圖。
* **全域牆面匯出 (Global Wall Snapshot)：** 適用於**所有版面**（包含 1x1 至 100 格照片牆）。全域「📷 匯出快照」按鈕將目前螢幕所有圖片截成完整拼貼大圖：
  - **Windows 版：** Electron `capturePage` API（原生截圖）
  - **Android 版：** `html2canvas` + Capacitor Share API（分享/儲存）

### 2.5 播放與分發引擎 (Playback & Distribution)
* **分發策略：** 打散模式（多目錄完全混合隨機推播）/ 有序模式（依檔名或日期依序分配）。
* **排序策略：** 隨機打散播放 (Shuffle) / 循序播放 (Sequential)。
* **時間控制：** 支援自訂「圖片交替時間」（預設 3 秒）。

### 2.6 視覺渲染與轉場 (Rendering & Transitions)
* **轉場效果：** 預設「淡入淡出 (Fade)」，支援「隨機轉場」或「無縫切換」。
* **長寬比自適應：**
  * **Fit：** 完整顯示圖片，背景套用「底圖模糊延展 (Blur Background)」效果。
  * **Crop：** 填滿窗格，裁切邊緣。

---

## 3. 使用操作手冊 (User Guide)

### 步驟 1：啟動與匯入資料夾
1. 啟動 `Midea Player` 後，您將看到「設定中心」畫面。
2. 點擊 **「📁 選擇圖片資料夾」**，開啟系統原生對話框。可多次點擊加入不同的資料夾。
3. 若有加錯的資料夾，點擊右側 **「✕」** 移除單一目錄，或點擊紅色 **「全部清除」** 重新選擇。

### 步驟 2：設定輪播參數
* **版面配置 (Layout)：** 下拉選單提供多種藝術分割模式（2x2、4x4、1大3小 雜誌風、置中焦點、照片牆 100格 等）。
* **切換間隔 (Interval)：** 自訂每張圖片停留的秒數（預設 3 秒）。
* **排序策略 (Ordering)：** 隨機打散播放 / 循序播放。
* **DB 路徑（可選）：** 可指定 Viewport DB 的自訂儲存目錄（預設為第一個選取目錄）。

### 步驟 3：Viewport 掃描（建議，可略過）
1. 點擊 **「🔍 掃描後播放」** 進入掃描模式（ScanView）。
2. 點擊 **「🚀 開始掃描」** 啟動 AI 人臉偵測（已掃描過的圖片自動跳過）。
3. 掃描完成後：
   - 若有失敗圖片，可點 **「🖊 手動標註失敗圖片」** 進入 AnnotationView 修正。
   - 或直接點 **「▶ 開始播放」** 跳過失敗圖片直接輪播。

### 步驟 4：手動標註工具（AnnotationView）
1. 在圖片上**拖曳**或**點擊兩點**，選取想要保留的 Viewport 區域（高亮矩形）。
2. 右側即時顯示正規化座標（x, y, w, h）。
3. 選擇操作：
   - **✅ 確認標註**：儲存手動 Viewport（`status: 'manual'`）並前進下一張
   - **↩ 復原**：清除目前選取，重新框選
   - **🖼 Check-out（此圖）**：維持原圖不裁切並前進下一張
   - **♻ 全域 Check-out**：將 DB 中所有同檔名圖片一次套用原圖設定（跨 Model 子目錄批次處理）
   - **⏭ 跳過此張**：暫時跳過，稍後再處理
4. 完成全部標註後，點擊 **「▶ 返回播放」**。

### 步驟 5：播放與控制
1. 點擊 **「▶ 開始播放」** 進入展示牆。
2. **Kiosk 沉浸模式：** 滑鼠靜止不動超過 3 秒，系統自動隱藏游標與控制按鈕。移動滑鼠即可重新喚醒介面。
3. **全域控制列（右下角）：**
   - **「⛶ 全螢幕」**：放大至全螢幕。
   - **「📷 匯出全域快照」**：截圖保存目前拼貼畫面。
   - **「❌ 退出播放」**：停止輪播並回到設定頁。
4. **單一網格獨立控制（懸停功能）：**
   - 滑鼠移動到圖片上方，畫面上方顯示**檔案路徑**。
   - 畫面中央浮現**專屬控制列**，可針對該格獨立暫停、切換上下張，或點擊 **「💾 儲存原圖」**。

---

## 4. Android App

Midea Player 提供原生 Android App，使用 **Capacitor** 框架將 React Web App 打包為 Android 原生應用程式。

### Android 版特色
* **觸控最佳化：** 大按鈕（≥ 48px touch target）、safe-area 邊距（適配異形螢幕與瀏海）、觸控 Kiosk（5 秒靜止後隱藏 UI）
* **原生圖片選取：** 使用系統 `<input type="file" multiple accept="image/*">` 調用 Android 原生圖片選擇器，支援多選
* **Viewport DB：** 儲存使用 Capacitor Preferences（取代 Electron 的 `.viewport_db.json` 檔案），相同的資料結構
* **快照分享：** 使用 `html2canvas` 截取 WebView 畫面，再透過 Capacitor Share API 呼出系統分享選單
* **AI 偵測：** BlazeFace（MediaPipe）模型在 Android WebView 內離線運行，不需任何網路連線
* **圖片儲存：** 優先使用 Share API（最自然的 Android 體驗），fallback 至 Filesystem.writeFile 寫入 Documents 目錄

### Android vs Windows 技術差異對照表

| 功能           | Windows (Electron)                       | Android (Capacitor)                       |
|----------------|------------------------------------------|-------------------------------------------|
| 圖片選取       | Electron `dialog.showOpenDialog`（目錄） | `<input type="file" multiple>`（系統 Picker） |
| 圖片存取協議   | `local-resource://` 自訂協議             | `content://` URI / `blob:` URL            |
| 圖片轉 base64  | Electron IPC `image:to-base64`           | Capacitor `Filesystem.readFile`           |
| Viewport DB    | `.viewport_db.json` 檔案（fs 寫入）      | Capacitor `Preferences`（key-value 儲存） |
| 全域快照       | Electron `capturePage` API               | `html2canvas` + `Share.share`             |
| 圖片儲存       | Electron `dialog.showSaveDialog`         | `Share.share` / `Filesystem.writeFile`    |
| Kiosk 隱藏延遲 | 3 秒                                     | 5 秒（觸控操作考量）                       |
| AI 模型        | TinyFaceDetector (`@vladmandic/face-api`)| BlazeFace (`@tensorflow-models/face-detection`) |

### 部署說明

詳細的 Step-by-Step 部署指南請參閱 **[ANDROID_DEPLOY.md](./ANDROID_DEPLOY.md)**，包含：
- 環境需求（JDK、Android Studio、Android SDK）
- 完整建置流程（npm install → build → cap sync → Gradle build）
- 實機安裝、APK 簽名與發布說明

---

## 5. 需求涵蓋與驗證 (Requirements Coverage)

截至目前版本，系統已 100% 滿足並涵蓋初始規劃之所有核心需求：
- [x] **跨平台獨立執行（Windows）：** 支援打包為 Windows 原生 `.exe`，斷網狀態下完美執行。
- [x] **跨平台獨立執行（Android）：** 支援打包為 Android `.apk`，使用 Capacitor 框架，無需網路連線。
- [x] **多視窗與靈活分割：** 實作 100 格、非對稱、自訂矩陣等多種佈局引擎。
- [x] **動態控制邏輯：** 實作單一窗格的 Hover 獨立控制、單張儲存，以及 Kiosk 自動隱藏 UI 功能。
- [x] **照片牆與縮圖體驗：** 100 格牆面實作隨機閃爍動畫，點擊可透過 Lightbox 開啟高畫質原圖與儲存。
- [x] **全域快照匯出：** 串接 Electron `capturePage` API（Windows）及 html2canvas（Android），支援全版面高解析度截圖。
- [x] **AI Viewport 偵測：** 離線執行 BlazeFace / TinyFaceDetector 人臉偵測，自動計算最佳裁切 Viewport。
- [x] **增量掃描（Skip & Reuse）：** 三層快取策略避免重複偵測，並支援跨子目錄檔名複用。
- [x] **手動標註工具：** 拖曳式 ViewportCanvas 支援任意方向選取，提供 Check-out 與全域 Check-out 批次操作。
- [x] **Viewport DB 管理：** 原子性 JSON 儲存、增量更新、跨 Model 批次 Check-out（`batchCheckout`）。
- [x] **子目錄關鍵字篩選：** 深度掃描時可依子目錄名稱關鍵字過濾，精準控制掃描範圍。

---

## 6. 非功能性需求 (Non-Functional Requirements)

* **跨平台相容性：** 介面 (UI) 與控制項 (Touch Target) 兼顧滑鼠 (懸停/點擊) 與觸控 (點擊/滑動) 邏輯。
* **效能與記憶體管理：** 針對高解析度圖片與多視窗（> 4），實作圖片預先載入 (Preloading) 與記憶體回收 (GC) 機制，避免 OOM (Out of Memory) 與轉場卡頓。
* **發布優化 (Production Ready)：** 應用程式在正式啟動後，提供純淨的啟動體驗，不會預設開啟任何開發者工具 (DevTools) 或除錯面板。

---

## 7. 系統架構與技術堆疊

本專案採用 **Electron + React (Vite) + TypeScript** 架構（Windows 版）以及 **Capacitor + React (Vite) + TypeScript** 架構（Android 版）：

- **Electron (Main Process)：** 負責存取作業系統檔案 (fs)、讀取 EXIF 資訊、管理視窗狀態、Viewport DB 讀寫。
- **React (Renderer Process)：** 負責渲染複雜的 UI 佈局、動畫轉場與前端狀態管理。
- **Capacitor (Android)：** 將 React Web App 包裝為 Android WebView，透過 Plugin 橋接原生 API（Filesystem、Preferences、Share）。

### 專案目錄結構

```text
midea_player/
├── src/                             # Windows (Electron) 版本
│   ├── main/                        # Electron 主進程
│   │   ├── index.ts                 # IPC handlers、協議、視窗管理
│   │   ├── fileManager.ts           # 目錄掃描、EXIF 處理
│   │   ├── viewportDb.ts            # Viewport DB 讀寫（.viewport_db.json）
│   │   └── aiWorker.ts              # AI 非同步佇列
│   ├── preload/
│   │   └── index.ts                 # IPC 橋接層（contextBridge）
│   └── renderer/src/
│       ├── components/
│       │   ├── GridCell.tsx          # 單一窗格（含 Viewport 裁切渲染）
│       │   ├── PhotoWall.tsx         # 照片牆（>16格）
│       │   ├── Lightbox.tsx          # 全螢幕預覽
│       │   └── ViewportCanvas.tsx    # 手動標註畫布元件
│       ├── hooks/
│       │   ├── useViewportDb.ts      # DB 讀取 Hook
│       │   └── useViewportScanner.ts # AI 批次掃描 Hook（三層 Skip/Reuse）
│       ├── views/
│       │   ├── ConfigView.tsx        # 設定頁面
│       │   ├── ScanView.tsx          # Viewport 預掃描介面
│       │   ├── PlaybackView.tsx      # 播放主畫面
│       │   └── AnnotationView.tsx    # 手動標註工具
│       └── utils/
│           └── viewportAi.ts         # AI 偵測邏輯（TF.js + TinyFaceDetector）
│
├── android-app/                     # Android (Capacitor) 版本
│   ├── src/
│   │   ├── platform.ts              # 平台 API 抽象層（取代 window.electronAPI）
│   │   ├── views/                   # 相同的四個 View（觸控最佳化）
│   │   ├── hooks/                   # 相同架構的 Hooks（使用 platform.ts）
│   │   └── utils/
│   │       └── viewportAi.ts        # AI 偵測（BlazeFace / MediaPipe）
│   ├── android/                     # Android 原生專案（Gradle）
│   │   └── app/src/main/
│   │       ├── AndroidManifest.xml
│   │       └── java/com/antigravity/mideaplayer/
│   │           └── MainActivity.java
│   ├── capacitor.config.ts          # Capacitor 設定（appId、webDir、plugins）
│   └── package.json
│
├── package.json                     # Windows 版根配置
└── tsconfig.json
```

---

## 8. 部署與執行

### 8.1 Windows 版（開發 / 打包）

**Q: 終端產品不會在 IDE 中執行，而是在 Windows 筆電或平板上，這是如何達成的？**

A: 這是透過 **Electron-Builder** 進行應用程式「打包 (Packaging)」來達成的。
1. 當開發完成後，在終端機執行打包指令（例如 `npm run build`）。
2. Electron-Builder 將 React 網頁程式碼編譯、壓縮，並將其與 Chromium 瀏覽器引擎和 Node.js 環境**綑綁成一個獨立的 `.exe` 執行檔**。
3. 將這個 `.exe` 安裝檔放到任何一台 Windows 筆電或平板上，雙擊安裝後，就會像一般桌面軟體（如 Spotify 或 VSCode）一樣獨立運行。使用者完全不需要安裝 Node.js、IDE，也不需要任何網路連線。

### 8.2 Android 版（開發 / 打包）

詳細的 Step-by-Step 部署指南請參閱 **[ANDROID_DEPLOY.md](./ANDROID_DEPLOY.md)**。

---

## 9. 未來精進與優化方向 (Future Improvements)

### 9.1 設定頁面 (UI) 美化與重構
* **目標**：解決設定畫面選項過多導致的雜亂與視覺疲勞。
* **作法**：導入現代化的「卡片式 (Card)」UI 設計，按邏輯分為「圖片來源管理」、「佈局與視覺」、「播放與轉場」及「進階控制」四大模組。

### 9.2 圖片動態輪播轉場效果優化
* **目標**：改善多視窗圖片輪播時直接硬切造成的視覺突兀感。
* **作法**：實作 5 種平滑的 CSS 轉場效果（柔和淡入淡出、平滑推移、微縮放漸變、唯美模糊、光影百葉），加入「隨機 (Random)」選項。

### 9.3 目錄選擇功能升級 (支援深度掃描)
* **目標**：解決目前僅能讀取第一層目錄，無法支援多層次分類資料夾的問題。
* **作法**：在 UI 增加「深度掃描（包含所有子目錄）」開關，底層改採「遞迴掃描 (Recursive)」，並導入非同步機制避免介面卡頓。

### 9.4 新增版面配置選項 (Layouts)
* **目標**：在不破壞既有架構的前提下，提供更多元的展示排版。
* **作法**：透過擴充底層 CSS Grid 設定，新增 3 種佈局選項：
  1. **1x4 版面**：水平等分 4 個直條，適合直式圖片。
  2. **1x5 版面 (中央聚焦)**：5 個直條，中央區塊最寬，引導視覺焦點。
  3. **非對稱版面 (1大4小)**：1 大展示區搭配 2x2 小區塊，雜誌風格。

### 9.5 Android 版強化
* **目錄選取升級：** 整合 `ACTION_OPEN_DOCUMENT_TREE`，支援整個目錄選取（需 Kotlin 原生橋接）。
* **HEIC/HEIF 支援：** Android 裝置拍攝的照片多為 HEIC 格式，需整合原生解碼。
* **背景掃描：** 使用 Android WorkManager 在背景非同步執行 AI Viewport 掃描，不阻塞 UI。


這是一款專為 Windows 筆電與平板裝置設計的跨平台高階圖片瀏覽器。本系統透過靈活的「螢幕分割」技術與「動態控制邏輯」，實現高度客製化的圖片輪播體驗。

## 1. 產品概述

本系統允許使用者匯入多個資料夾，並根據所選的分割樣板動態展示圖片。系統具備智慧型的互動邏輯（例如在 Kiosk 模式下自動隱藏單一窗格的控制列）以及完善的記憶體管理，確保大量高解析度圖片輪播時的效能穩定。

---

## 2. 核心功能規格 (Functional Requirements)

### 2.1 來源與資料管理 (Data Source)
* **多目錄選擇與管理：** 透過 Electron 呼叫原生的檔案選擇器 (File Picker)，允許使用者同時加入多個不同的本機目錄或網路磁碟路徑。支援「單一刪除 (移除特定目錄)」與「全部清除」的便捷操作。
* **檔案聚合：** 將所選目錄下的所有支援圖片格式 (JPG, PNG, WebP) 建立為虛擬的「播放清單 (Playlist)」。
* **影像預處理：** 系統載入圖片時，會透過 EXIF 資訊進行自動轉正 (Auto-rotate)，避免直式手機照片在螢幕上橫躺。

### 2.2 畫面分割與佈局 (Layout & Grid)
* **自訂與非對稱佈局 (Irregular Layouts)：**
  * 除了嚴格的標準矩陣外，系統支援**「非對稱 / 任意排列」**的藝術設計。例如：「1大3小 雜誌風」、「置中焦點 (Center Focus, 中間最大外圍小)」、「相簿錯落排列」。系統不受限於制式的行列對齊，可自由創造具有設計感的錯落拼貼。
  * **隨機佈局生成：** 若使用者未指定，系統將在預設範圍內進行隨機分割。
* **動態互動邏輯 (核心業務邏輯)：**
  * **狀態 A（網格模式 $\le$ 16）：** 具備「獨立互動性」。當游標懸停 (Hover) 於特定窗格時，會**在該單一窗格內部浮現專屬的獨立控制列**（包含：暫停、繼續、上一張、下一張、以及 **💾 單張儲存** 按鈕），允許使用者只對該格進行控制。
  * **懸停檔案資訊 (Hover File Info)：** 在任何模式下，當滑鼠懸停於單一圖片上時，除了控制列外，畫面會浮現半透明資訊列，明確顯示**該圖片的檔案名稱與完整路徑**。
  * **狀態 B（照片牆模式 Photo Wall > 16 至 100+）：** 
    * 系統轉換為超高密度的「照片牆」。為保護系統效能，底層具備縮圖機制，並以高密度的 CSS Grid 渲染。
    * **活體牆面特效：** 畫面採用「隨機閃爍 (Random Pop)」的動畫，每隔幾秒隨機抽換牆面上的部分圖片。
    * **探索式互動 (Lightbox)：** 游標懸停會稍微放大圖片；點擊任何圖片，會以全螢幕 (Lightbox) 方式彈出該圖片的**高解析度原圖**，並提供獨立控制列與儲存按鈕。
* **沉浸式 Kiosk 模式 (Auto-hide UI)：** 在任何輪播模式下，若滑鼠或觸控靜止超過一定時間 (如 3 秒)，系統將會**自動隱藏所有的控制列與滑鼠游標**，提供最乾淨、無干擾的純粹視覺體驗。一旦滑鼠再次移動，控制列會立刻平滑淡入恢復。

### 2.3 圖片操作與匯出 (Image Actions)
* **單張儲存 (Save Individual Image)：** 在各個模式的獨立窗格控制列（或全螢幕預覽時）均明確提供「儲存單張圖片」的按鈕。點擊後可喚出系統原生對話框，將正在瀏覽的該張高解析度原圖另存至指定路徑。
* **全域牆面匯出 (Global Wall Snapshot)：** **這項功能適用於「所有版面」**（包含 1x1, 2x2, 非對稱排列, 乃至 100 格照片牆）。系統具備一個全域的「📷 匯出快照」按鈕，點擊後會把畫面上所有同時顯示的圖片「當作一張完整的拼貼大圖 (Composite Image)」進行高解析度全視窗截圖，讓視覺震撼的瞬間得以保留。

### 2.4 播放與分發引擎 (Playback & Distribution)
* **分發策略 (Distribution)：**
  * **打散模式：** 將來自多個不同目錄的圖片**完全混合打散**，再隨機推播至各個分割螢幕，避免出現「A 資料夾播完才播 B 資料夾」的狀況。
  * **有序模式：** 依照檔名或日期，將圖片依序分配至各窗格（窗格1播第1張，窗格2播第2張...）。
* **排序策略 (Ordering)：** 提供「隨機打散播放 (Shuffle)」與「循序播放 (Sequential)」選項供使用者於設定頁切換。
* **時間控制：** 支援自訂「圖片交替時間」（如：3秒、5秒、10秒）。

### 2.4 視覺渲染與轉場 (Rendering & Transitions)
* **轉場效果：** 預設採用「淡入淡出 (Fade)」，並支援「隨機轉場」或「無縫切換」。
* **長寬比自適應：**
  * **Fit (等比例縮放)：** 完整顯示圖片，背景套用「底圖模糊延展 (Blur Background)」效果。
  * **Crop (智慧裁切)：** 填滿窗格，裁切邊緣。

---

## 3. 使用操作手冊 (User Guide)

### 步驟 1：啟動與匯入資料夾
1. 啟動 `Midea Player` 後，您將看到「設定中心」畫面。
2. 點擊 **「📁 選擇圖片資料夾」** 按鈕，開啟系統原生對話框。您可以多次點擊來加入不同的資料夾。
3. 加入的資料夾會顯示在下方清單，若有加錯的資料夾，可點擊右側的 **「✕」** 移除單一目錄，或點擊上方紅色的 **「全部清除」** 重新選擇。

### 步驟 2：設定輪播參數
* **版面配置 (Layout)：** 下拉選單提供多種藝術分割模式。包含標準的「2x2」、「4x4」，非對稱的「1大3小 雜誌風」、「置中焦點 (Center Focus)」，或是可容納百張圖片的「照片牆 (100格)」。
* **切換間隔 (Interval)：** 自訂每張圖片停留的秒數 (預設 3 秒)。
* **排序策略 (Ordering)：** 選擇「隨機打散播放」會將所有資料夾的照片徹底混合洗牌；「循序播放」則按原順序播放。

### 步驟 3：播放與控制
1. 點擊 **「▶ 開始播放」** 進入展示牆。
2. **Kiosk 沉浸模式：** 若滑鼠靜止不動超過 3 秒，系統會自動隱藏游標與控制按鈕，進入純淨的全螢幕沉浸體驗。移動滑鼠即可重新喚醒介面。
3. **全域控制列 (右下角)：** 
   - **「⛶ 全螢幕」**：放大至全螢幕隱藏工具列。
   - **「📷 匯出全域快照」**：將目前螢幕上的所有拼貼畫面截圖保存。
   - **「❌ 退出播放」**：停止輪播並回到設定頁。
4. **單一網格獨立控制 (懸停功能)：** 
   - 將滑鼠移動到任何一張圖片上方，畫面上方會顯示該圖片的**檔案路徑**。
   - 畫面中央會浮現**專屬控制列**，允許您針對該格進行獨立暫停、切換上一張/下一張，或點擊 **「💾 儲存原圖」**。

---

## 4. 需求涵蓋與驗證 (Requirements Coverage)

截至目前版本，系統已 100% 滿足並涵蓋初始規劃之所有核心需求：
- [x] **跨平台獨立執行：** 支援打包為 Windows 原生 `.exe`，斷網狀態下亦可完美執行。
- [x] **多視窗與靈活分割：** 實作 100 格、非對稱、自訂矩陣等多種佈局引擎。
- [x] **動態控制邏輯：** 實作單一窗格的 Hover 獨立控制、單張儲存，以及 Kiosk 自動隱藏 UI 功能。
- [x] **照片牆與縮圖體驗：** 100 格牆面實作隨機閃爍動畫，點擊可透過 Lightbox 開啟高畫質原圖與儲存。
- [x] **全域快照匯出：** 成功串接 Electron 底層 `capturePage` API，支援全版面的高解析度截圖。

---

## 5. 非功能性需求 (Non-Functional Requirements)

* **跨平台相容性：** 介面 (UI) 與控制項 (Touch Target) 兼顧滑鼠 (懸停/點擊) 與觸控 (點擊/滑動) 邏輯。
* **效能與記憶體管理：** 針對高解析度圖片與多視窗 ($>$ 4)，實作圖片預先載入 (Preloading) 與記憶體回收 (GC) 機制，避免 OOM (Out of Memory) 與轉場卡頓。
* **發布優化 (Production Ready)：** 應用程式在正式啟動 (V1) 或打包發布後，提供純淨的啟動體驗，不會預設開啟任何開發者工具 (DevTools) 或除錯面板。

---

## 6. 系統架構與技術堆疊

本專案採用 **Electron + React (Vite) + TypeScript** 架構：
- **Electron (Main Process):** 負責存取作業系統檔案 (fs)、讀取 EXIF 資訊、管理視窗狀態。
- **React (Renderer Process):** 負責渲染複雜的 UI 佈局、動畫轉場與前端狀態管理。

### 專案目錄結構

```text
midea_player/
├── src/
│   ├── main/               # Electron 主進程 (系統整合、檔案系統存取)
│   │   ├── index.ts        
│   │   └── fileManager.ts  
│   ├── preload/            # IPC 橋接層
│   │   └── index.ts
│   └── renderer/           # React 渲染進程
│       ├── src/
│       │   ├── assets/     
│       │   ├── components/ # 佈局、播放器與 UI 元件
│       │   ├── hooks/      
│       │   ├── store/      # 全域狀態
│       │   ├── views/      # 頁面 (ConfigView, PlaybackView)
│       │   ├── App.tsx     
│       │   └── main.tsx
│       └── index.html
├── package.json
└── tsconfig.json
```

## 7. 部署與執行 (回答使用者的問題)

**Q: 終端產品不會在 IDE 中執行，而是在 Windows 筆電或平板上，這是如何達成的？**

A: 這是透過 **Electron-Builder** 進行應用程式「打包 (Packaging)」來達成的。
1. 當開發完成後，我們會在終端機執行打包指令 (例如 `npm run build`)。
2. Electron-Builder 會將我們的 React 網頁程式碼編譯、壓縮，並將其與 Chromium 瀏覽器引擎和 Node.js 環境**綑綁成一個獨立的 `.exe` 執行檔 (Windows Installer)**。
3. 您只需要將這個 `.exe` 安裝檔放到任何一台 Windows 筆電或平板上，雙擊安裝後，它就會像一般桌面軟體 (如 Spotify 或 VSCode) 一樣獨立運行，使用者完全不需要安裝 Node.js、IDE，也不會看到任何原始碼。它是一個完全獨立、可直接點擊執行且**完全無需網路**的應用程式。

---

## 8. 未來精進與優化方向 (Future Improvements)

基於使用者需求與系統發展，以下為預計加入的優化項目與具體實作方向：

### 8.1 設定頁面 (UI) 美化與重構
* **目標**：解決設定畫面選項過多導致的雜亂與視覺疲勞。
* **作法**：導入現代化的「卡片式 (Card)」UI 設計。將設定選項按邏輯分為「圖片來源管理」、「佈局與視覺」、「播放與轉場」及「進階控制」等四大卡片模組。利用適當留白、微圓角與淺陰影來提升介面層次與操作直覺性。

### 8.2 圖片動態輪播轉場效果優化
* **目標**：改善多視窗圖片輪播時，直接硬切 (Hard cut) 造成的視覺突兀與疲勞感。
* **作法**：實作 5 種平滑的 CSS 轉場效果（包含：柔和淡入淡出、平滑推移、微縮放漸變、唯美模糊、光影百葉）。並加入「隨機 (Random)」選項，每次切換時自動抽籤，提升長時間觀看的視覺豐富度。

### 8.3 目錄選擇功能升級 (支援深度掃描)
* **目標**：解決目前僅能讀取第一層目錄，無法支援多層次分類資料夾的問題。
* **作法**：在 UI 增加「深度掃描 (包含所有子目錄)」開關。當開啟時，底層 Electron 讀取邏輯將改採「遞迴掃描 (Recursive)」。並會導入非同步機制，確保在掃描深層/大量檔案時不會造成介面卡頓。

### 8.4 新增版面配置選項 (Layouts)
* **目標**：在不破壞既有架構與核心控制邏輯的前提下，提供更多元的展示排版。
* **作法**：透過擴充底層 CSS Grid 設定，新增 3 種佈局選項：
  1. **1x4 版面**：水平等分 4 個直條，適合直式圖片。
  2. **1x5 版面 (中央聚焦)**：5 個直條，中央區塊最寬（例：1:1:2.5:1:1），引導視覺焦點。
  3. **非對稱版面 (1大4小)**：1 大展示區搭配 2x2 小區塊，營造雜誌風格。
