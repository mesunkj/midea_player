# build-apk.ps1 - Build Midea Player Android APK
$ErrorActionPreference = "Stop"

$toolsDir = "C:\Users\HP\.android-build-tools"
$javaHome = (Get-ChildItem "$toolsDir\jdk-17" -Directory | Select-Object -First 1).FullName
$sdkDir = "$toolsDir\android-sdk"

$env:JAVA_HOME = $javaHome
$env:PATH = "$javaHome\bin;$env:PATH"
$env:ANDROID_HOME = $sdkDir
$env:ANDROID_SDK_ROOT = $sdkDir

if (Test-Path "$PSScriptRoot\android\app") {
    $appDir = $PSScriptRoot
    $projectRoot = Split-Path $PSScriptRoot -Parent
} else {
    $appDir = "$PSScriptRoot\android-app"
    $projectRoot = $PSScriptRoot
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Midea Player Android APK Build Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Frontend Build
Write-Host "[1/3] Building frontend assets (Vite)..." -ForegroundColor Yellow
Set-Location $appDir
npm run build

# 2. Capacitor Sync
Write-Host "[2/3] Syncing to Android project (Capacitor)..." -ForegroundColor Yellow
npx cap sync android

# 3. Gradle Build
Write-Host "[3/3] Running Gradle assembleDebug..." -ForegroundColor Yellow
Set-Location "$appDir\android"
cmd /c "gradlew.bat assembleDebug"

$apkSrc = "$appDir\android\app\build\outputs\apk\debug\app-debug.apk"
$apkDest = "$projectRoot\app-debug.apk"
Copy-Item $apkSrc $apkDest -Force
Copy-Item $apkSrc "$appDir\app-debug.apk" -Force

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Build Successful!" -ForegroundColor Green
Write-Host "  APK Output: $apkDest" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
