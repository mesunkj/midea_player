import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的 API 給 Renderer Process
contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectories: () => ipcRenderer.invoke('dialog:openDirectory'),
  scanDirectories: (dirPaths: string[], recursive: boolean, subDirKeyword: string) => ipcRenderer.invoke('files:scan', dirPaths, recursive, subDirKeyword),
  getAiCropData: (imagePath: string) => ipcRenderer.invoke('ai:get-crop-data', imagePath),
  saveImage: (imagePath: string) => ipcRenderer.invoke('image:save', imagePath),
  snapshot: () => ipcRenderer.invoke('app:snapshot'),
  imageToBase64: (imagePath: string) => ipcRenderer.invoke('image:to-base64', imagePath),

  // ── Viewport DB ──────────────────────────────────────────────────────────
  /** 讀取指定根目錄的 Viewport DB（若不存在回傳 null） */
  loadViewportDb: (rootDir: string) => ipcRenderer.invoke('viewport:load-db', rootDir),
  /** 將 Viewport DB 儲存到指定根目錄 */
  saveViewportDb: (rootDir: string, db: any) => ipcRenderer.invoke('viewport:save-db', rootDir, db),
  /** 檢查 DB 是否存在並回傳摘要（掃描時間、總數、失敗數） */
  checkViewportDb: (rootDir: string) => ipcRenderer.invoke('viewport:check-db', rootDir),
  /** 手動標註：原子更新單一圖片條目並從 failedFiles 移除 */
  updateViewportEntry: (rootDir: string, imagePath: string, entry: any) =>
    ipcRenderer.invoke('viewport:update-entry', rootDir, imagePath, entry),
  /** 全域 Check-out：依 basename 批次設定所有相同檔名為原圖 (0,0,1,1) */
  batchCheckoutViewport: (rootDir: string, filename: string) =>
    ipcRenderer.invoke('viewport:batch-checkout', rootDir, filename),
});
