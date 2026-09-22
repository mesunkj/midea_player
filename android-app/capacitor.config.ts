import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.antigravity.mideaplayer',
  appName: 'Midea Player',
  webDir: 'dist',
  // 伺服器設定：讓 Android WebView 能正確存取 Web 資源
  server: {
    androidScheme: 'https',
  },
  // Android 特定設定
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
  plugins: {
    // Filesystem plugin 設定
    Filesystem: {},
    // Preferences plugin 設定（替代 Electron viewport DB）
    Preferences: {},
  },
};

export default config;
