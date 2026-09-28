# build-apk.ps1 - 一鍵編譯 Midea Player Android APK
$ErrorActionPreference = "Stop"

$toolsDir = "C:\Users\HP\.android-build-tools"
$javaHome = (Get-ChildItem "$toolsDir\jdk-17" -Directory | Select-Object -First 1).FullName
$sdkDir = "$toolsDir\android-sdk"

$env:JAVA_HOME = $javaHome
$env:PATH = "$javaHome\bin;$env:PATH"
$env:ANDROID_HOME = $sdkDir
$env:ANDROID_SDK_ROOT = $sdkDir

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Midea Player Android APK 一鍵打包" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. 前端打包
Write-Host "[1/3] 打包前端網頁資源 (Vite)..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\android-app"
npm run build

# 2. Capacitor 同步
Write-Host "[2/3] 同步至原生 Android 工程 (Capacitor)..." -ForegroundColor Yellow
npx cap sync android

# 3. Gradle 編譯
Write-Host "[3/3] 執行 Gradle 編譯 APK..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\android-app\android"
cmd /c "gradlew.bat assembleDebug"

$apkSrc = "$PSScriptRoot\android-app\android\app\build\outputs\apk\debug\app-debug.apk"
$apkDest = "$PSScriptRoot\app-debug.apk"
Copy-Item $apkSrc $apkDest -Force
Copy-Item $apkSrc "$PSScriptRoot\android-app\app-debug.apk" -Force

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  建置成功！" -ForegroundColor Green
Write-Host "  APK 位置: $apkDest" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
