import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Capacitor 核心初始化
import { Capacitor } from '@capacitor/core';

// 開發環境提示
if (import.meta.env.DEV) {
  console.log('[Midea Player Android] Running in dev mode');
  console.log('[Capacitor] Platform:', Capacitor.getPlatform());
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
