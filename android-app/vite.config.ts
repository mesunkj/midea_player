import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Capacitor 需要相對路徑
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: {
          // 將 TF.js 拆成獨立 chunk，避免主 bundle 過大
          tensorflow: ['@tensorflow/tfjs', '@tensorflow-models/face-detection'],
        },
      },
    },
  },
  // 開發時允許存取本機圖片（透過 Vite proxy）
  server: {
    port: 5173,
    host: true,
  },
});
