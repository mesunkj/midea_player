# Android App 部署指南 — Midea Player

本文件提供將 Midea Player Android App 從原始碼建置、打包成 APK，並部署到實機的完整 Step-by-Step 說明。

---

## ⚡ 快速一鍵打包（最推薦）

本機已配置好免安裝版建置環境（OpenJDK 17 + Android SDK 34）。若您只需產生最新 APK，在專案根目錄開啟 PowerShell 執行：

```powershell
.\build-apk.ps1
```

執行後會自動完成：
1. **前端打包**：執行 `npm run build`（Vite 編譯 React 前端）
2. **Capacitor 同步**：執行 `npx cap sync android`（將資源更新至 Android 原生工程）
3. **Gradle 編譯**：呼叫 `gradlew assembleDebug` 自動完成 APK 打包
4. **複製產物**：將產生的 APK 複製至專案根目錄方便取用

**APK 產出檔案位置：**
- **專案根目錄**：`midea_player/app-debug.apk`（約 4.1 MB）
- **Android App 目錄**：`midea_player/android-app/app-debug.apk`
- **Gradle 原始輸出**：`midea_player/android-app/android/app/build/outputs/apk/debug/app-debug.apk`

---

## 目錄

1. [環境配置說明（含免安裝綠色版工具鏈）](#1-環境配置說明)
2. [免安裝版環境搭建步驟（環境建立全紀錄）](#2-免安裝版環境搭建步驟環境建立全紀錄)
3. [標準建置流程（Step-by-Step）](#3-標準建置流程step-by-step)
4. [日常開發流程與 Live Reload](#4-日常開發流程與-live-reload)
5. [安裝到 Android 實機](#5-安裝到-android-實機)
6. [APK 簽名與正式發布 (Release APK)](#6-apk-簽名與正式發布-release-apk)
7. [常見問題排解](#7-常見問題排解)
8. [專案結構說明](#8-專案結構說明)

---

## 1. 環境配置說明

編譯 Android App 需要以下工具：

| 軟體 / 組件 | 版本需求 | 角色用途 | 本機配置路徑 |
|------------|---------|----------|-------------|
| **Node.js** | ≥ 18.x | 建置前端 Web App (Vite) | 系統 PATH（已安裝 v22.x） |
| **JDK (Java)** | 17 LTS | 執行 Gradle 編譯原生程式碼 | `C:\Users\HP\.android-build-tools\jdk-17\jdk-17.0.20.1+1` |
| **Android SDK** | API 34 | `compileSdkVersion = 34` | `C:\Users\HP\.android-build-tools\android-sdk` |
| **Build-Tools** | 34.0.0 | 打包 DEX、資源編譯與 APK 簽名 | `.../android-sdk/build-tools/34.0.0` |
| **Platform-Tools** | 最新 | ADB 偵錯與實機安裝工具 | `.../android-sdk/platform-tools/adb.exe` |

> 💡 **免安裝特色**：本環境無需安裝龐大的 Android Studio 即可在背景全命令列自動編譯 APK。所有 SDK 與 JDK 工具均獨立存放於 `C:\Users\HP\.android-build-tools`，不污染全域環境變數。

---

## 2. 免安裝版環境搭建步驟（環境建立全紀錄）

如果您需要在全新電腦上重現相同的命令列打包環境，以下為完整自動化配置步驟：

### Step 2.1：下載並解壓 OpenJDK 17
```powershell
$toolsDir = "C:\Users\HP\.android-build-tools"
New-Item -ItemType Directory -Force -Path $toolsDir

# 下載 Microsoft OpenJDK 17
$jdkZip = "$toolsDir\jdk-17.zip"
Invoke-WebRequest -Uri "https://aka.ms/download-jdk/microsoft-jdk-17-windows-x64.zip" -OutFile $jdkZip
Expand-Archive -Path $jdkZip -DestinationPath "$toolsDir\jdk-17" -Force
```

### Step 2.2：下載 Android Command-line Tools 並建立標準目錄
Google 官方提供的 `commandlinetools` 解壓後需放於 `cmdline-tools/latest` 目錄結構下：
```powershell
$cmdlineZip = "$toolsDir\commandlinetools.zip"
Invoke-WebRequest -Uri "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip" -OutFile $cmdlineZip

# 解壓至暫存並移至 cmdline-tools/latest
Expand-Archive -Path $cmdlineZip -DestinationPath "$toolsDir\temp_cmdline" -Force
$latestDir = "$toolsDir\android-sdk\cmdline-tools\latest"
New-Item -ItemType Directory -Force -Path $latestDir
Copy-Item -Path "$toolsDir\temp_cmdline\cmdline-tools\*" -Destination $latestDir -Recurse -Force
Remove-Item -Path "$toolsDir\temp_cmdline" -Recurse -Force
```

### Step 2.3：同意 SDK 授權協議 (License Agreement)
由於 Windows 下 `sdkmanager --licenses` 需互動式回應多次 `y`，可透過 Node.js 腳本全自動確認授權：
```javascript
// accept_licenses.js
const { spawn } = require('child_process');
const path = require('path');

const toolsDir = 'C:\\Users\\HP\\.android-build-tools';
const sdkDir = path.join(toolsDir, 'android-sdk');
const sdkmanager = path.join(sdkDir, 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat');
const javaHome = path.join(toolsDir, 'jdk-17', 'jdk-17.0.20.1+1');

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  PATH: `${path.join(javaHome, 'bin')};${process.env.PATH}`,
  ANDROID_HOME: sdkDir
};

const child = spawn(sdkmanager, ['--licenses'], { env, shell: true, stdio: ['pipe', 'inherit', 'inherit'] });
const interval = setInterval(() => {
  try { child.stdin.write('y\n'); } catch (e) {}
}, 500);

child.on('close', (code) => {
  clearInterval(interval);
  process.exit(code);
});
```
執行腳本即可一次同意全部 7 項 Android SDK 授權：
```powershell
node accept_licenses.js
```

### Step 2.4：安裝 Platform 34 與 Build-Tools
```powershell
$sdkmanager = "C:\Users\HP\.android-build-tools\android-sdk\cmdline-tools\latest\bin\sdkmanager.bat"
& $sdkmanager "platforms;android-34" "build-tools;34.0.0" "platform-tools"
```

### Step 2.5：設定 `local.properties`
在 `android-app/android/local.properties` 填入 SDK 實體路徑：
```properties
sdk.dir=C\:\\Users\\HP\\.android-build-tools\\android-sdk
```

---

## 3. 標準建置流程（Step-by-Step）

若想分步驟手動執行或理解每一步的作用：

### Step 1：安裝 Web 依賴
```powershell
cd c:\Users\HP\project\midea_player\android-app
npm install
```

### Step 2：打包前端 Web 資源
```powershell
npm run build
```
輸出於 `android-app/dist/`，包含 React 前端、TensorFlow.js 模型引擎、html2canvas 等資源。

### Step 3：同步到 Capacitor Android 原生專案
```powershell
npx cap sync android
```
將 `dist/` 的網頁資源複製到 `android/app/src/main/assets/public`，並更新外掛程式。

### Step 4：編譯 Debug APK

**方式 A：使用一鍵腳本（推薦）**
```powershell
cd c:\Users\HP\project\midea_player
.\build-apk.ps1
```

**方式 B：直接呼叫 Gradle（自訂環境變數）**
```powershell
$env:JAVA_HOME = "C:\Users\HP\.android-build-tools\jdk-17\jdk-17.0.20.1+1"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$env:ANDROID_HOME = "C:\Users\HP\.android-build-tools\android-sdk"

cd c:\Users\HP\project\midea_player\android-app\android
cmd /c "gradlew.bat assembleDebug"
```

**方式 C：在 Android Studio GUI 中**
1. 執行 `npx cap open android` 開啟 Android Studio。
2. 頂部選單 → **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**。

---

## 4. 日常開發流程與 Live Reload

### 一般更新流程
修改 React / TypeScript 程式碼後，直接在根目錄執行：
```powershell
.\build-apk.ps1
```

### 快速開發模式（Live Reload）
Live Reload 可讓 Web 變更即時反映在手機畫面上，無需每次重新打包 APK：

1. **啟動 Vite Dev Server**：
   ```powershell
   cd android-app
   npm run dev
   # 記下顯示的區網 IP，例如: http://192.168.1.100:5173
   ```

2. **修改 `capacitor.config.ts` 加入伺服器網址**：
   ```typescript
   const config: CapacitorConfig = {
     appId: 'com.antigravity.mideaplayer',
     appName: 'Midea Player',
     webDir: 'dist',
     server: {
       url: 'http://192.168.1.100:5173',  // 替換為您的 PC 區網 IP
       cleartext: true,
     },
   };
   ```

3. **同步並更新**：
   ```powershell
   npx cap sync android
   ```
   > ⚠️ **注意**：手機與電腦必須連接至同一個 Wi-Fi 網路。正式發布前務必將 `server` 區塊移除。

---

## 5. 安裝到 Android 實機

### 方式 A：檔案傳輸安裝（最簡易）
1. 將專案根目錄的 `app-debug.apk` 透過 USB、通訊軟體（LINE、微信）或 Google Drive 傳送至 Android 裝置。
2. 在手機「檔案管理員」中點選 `app-debug.apk` 進行安裝。
3. 若提示「未知的應用程式」，點選「設定」並開啟「允許來自此來源的應用程式」。

### 方式 B：透過 ADB 指令安裝
1. 手機開啟「開發人員選項」中的「**USB 偵錯**」。
2. 用 USB 線將手機連接至電腦。
3. 執行安裝指令（使用免安裝工具鏈中的 adb）：
   ```powershell
   $adb = "C:\Users\HP\.android-build-tools\android-sdk\platform-tools\adb.exe"

   # 檢測裝置是否連線
   & $adb devices

   # 覆蓋安裝 APK
   & $adb install -r c:\Users\HP\project\midea_player\app-debug.apk
   ```

---

## 6. APK 簽名與正式發布 (Release APK)

### Step 1：建立 Release Keystore（僅需執行一次）
```powershell
$keytool = "C:\Users\HP\.android-build-tools\jdk-17\jdk-17.0.20.1+1\bin\keytool.exe"

& $keytool -genkey -v `
  -keystore midea-player-release.keystore `
  -alias midea-player `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000
```
> 請妥善保管產生的 `midea-player-release.keystore` 及設定的密碼。

### Step 2：在 `build.gradle` 設定簽名
在 `android-app/android/app/build.gradle` 的 `android` 區塊加入：
```groovy
android {
    ...
    signingConfigs {
        release {
            storeFile file("../../midea-player-release.keystore")
            storePassword "您的Keystore密碼"
            keyAlias "midea-player"
            keyPassword "您的Key密碼"
        }
    }
    buildTypes {
        release {
            minifyEnabled false
            signingConfig signingConfigs.release
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

### Step 3：編譯 Release APK
```powershell
$env:JAVA_HOME = "C:\Users\HP\.android-build-tools\jdk-17\jdk-17.0.20.1+1"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$env:ANDROID_HOME = "C:\Users\HP\.android-build-tools\android-sdk"

cd c:\Users\HP\project\midea_player\android-app\android
cmd /c "gradlew.bat assembleRelease"
```
**Release APK 產出路徑**：
`android-app/android/app/build/outputs/apk/release/app-release.apk`

---

## 7. 常見問題排解

### ❌ `JAVA_HOME is not set and no 'java' command could be found`
- **原因**：執行 `gradlew` 時未指定 Java 路徑。
- **解法**：直接執行專案根目錄的 `.\build-apk.ps1`，腳本已自動注入 `JAVA_HOME`。

### ❌ `SDK location not found. Define location with an ANDROID_SDK_ROOT...`
- **原因**：找不到 Android SDK。
- **解法**：確認 `android-app/android/local.properties` 存在且內容正確：
  ```properties
  sdk.dir=C\:\\Users\\HP\\.android-build-tools\\android-sdk
  ```

### ❌ `License for package Android SDK Platform 34 not accepted`
- **解法**：重新執行授權同意腳本：
  ```powershell
  node "C:\Users\HP\.gemini\antigravity-ide\brain\29b742e8-31dc-4bba-9aa1-8407b5775a26\scratch\accept_licenses.js"
  ```

### ❌ `INSTALL_FAILED_UPDATE_INCOMPATIBLE`
- **原因**：手機已安裝過不同簽名（例如 Release 與 Debug）的版本。
- **解法**：先解除安裝手機上的舊 App，再重新安裝。

---

## 8. 專案結構說明

```text
midea_player/
├── build-apk.ps1                 # ⭐ 根目錄一鍵編譯 APK 腳本
├── app-debug.apk                 # ⭐ 最新編譯出之 Debug APK
├── ANDROID_DEPLOY.md             # 本部署說明指南
│
├── android-app/                  # Android 混合專案主目錄
│   ├── build-apk.ps1             # 一鍵編譯腳本
│   ├── app-debug.apk             # 備份 APK
│   ├── package.json              # 依賴配置
│   ├── capacitor.config.ts       # Capacitor 配置
│   ├── src/                      # 前端 React 原始碼
│   │   ├── views/                # ConfigView, AnnotationView, PlaybackView 等
│   │   └── components/           # ViewportCanvas (支援 9:16 / 16:9 / Touch)
│   ├── dist/                     # 前端編譯成果
│   └── android/                  # Android 原生 Gradle 工程
│       ├── local.properties      # 指向本機 SDK 路徑
│       ├── gradlew.bat           # Gradle Wrapper
│       └── app/
│           ├── build.gradle      # 模組設定
│           └── build/outputs/apk/debug/app-debug.apk # Gradle 原始產出
│
└── C:\Users\HP\.android-build-tools\  # 免安裝輕量工具鏈目錄
    ├── jdk-17/                   # Microsoft OpenJDK 17
    └── android-sdk/              # Android SDK (API 34, build-tools 34.0.0, platform-tools)
```
