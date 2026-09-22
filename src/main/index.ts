import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { selectDirectories, scanDirectories, generateThumbnail } from './fileManager';
import { addToAiQueue, getCropData } from './aiWorker';
import { loadDb, saveDb, updateEntry, batchCheckout, ViewportDb } from './viewportDb';

// 解決 Windows 上 Electron GPU Cache 存取被拒 (0x5) 問題
// 停用 GPU shader disk cache，避免 cache_util_win.cc / gpu_disk_cache.cc 錯誤
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-program-cache');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // 在開發環境載入 Vite 的 dev server
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  // 註冊自定義協定，允許前端讀取本機圖片
  // 加入 CORS 標頭，讓渲染器的 fetch() 與 TF.js 畫布操作不受跨域限制
  protocol.registerFileProtocol('local-resource', (request, callback) => {
    const url = request.url.replace(/^local-resource:\/\//, '');
    try {
      const filePath = decodeURIComponent(url);
      return callback({
        path: filePath,
        headers: {
          'Access-Control-Allow-Origin':  '*',
          'Access-Control-Allow-Methods': 'GET, HEAD',
          'Access-Control-Allow-Headers': '*',
        }
      } as any);
    } catch (error) {
      console.error('[local-resource protocol]', error);
      return callback({ error: -6 } as any); // net::ERR_FILE_NOT_FOUND
    }
  });

  // 註冊 IPC Handlers
  ipcMain.handle('dialog:openDirectory', async () => {
    return await selectDirectories();
  });

  ipcMain.handle('files:scan', async (_event, dirPaths: string[], recursive: boolean, subDirKeyword: string) => {
    const images = scanDirectories(dirPaths, recursive, subDirKeyword);
    return images;
  });

  // AI 分析現在在渲染器端執行，此端點回傳 null 以維持相容性
  ipcMain.handle('ai:get-crop-data', async (_event, _imagePath: string) => {
    return null;
  });

  // 將圖片讀取為 base64 data URL，讓渲染器的 TF.js 可以無 CORS 限制地使用
  ipcMain.handle('image:to-base64', async (_event, imagePath: string) => {
    try {
      const normalizedPath = imagePath.replace(/^local-resource:\/\//, '');
      const decoded = decodeURIComponent(normalizedPath);
      const buffer = fs.readFileSync(decoded);
      const ext = path.extname(decoded).toLowerCase().replace('.', '');
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg',
        png: 'image/png', webp: 'image/webp',
        gif: 'image/gif', bmp: 'image/bmp',
      };
      const mime = mimeMap[ext] || 'image/jpeg';
      return `data:${mime};base64,${buffer.toString('base64')}`;
    } catch (err) {
      console.error('[image:to-base64] failed:', err);
      return null;
    }
  });

  ipcMain.handle('image:save', async (_event, imagePath: string) => {
    try {
      const defaultPath = path.basename(imagePath);
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: '儲存原圖',
        defaultPath: defaultPath,
        filters: [{ name: 'Images', extensions: ['jpg', 'png', 'webp', 'jpeg'] }]
      });

      if (!canceled && filePath) {
        // 從原始路徑複製檔案到使用者指定的位置
        fs.copyFileSync(imagePath, filePath);
        return { success: true, filePath };
      }
      return { success: false, reason: 'canceled' };
    } catch (error) {
      console.error('Save image failed:', error);
      return { success: false, reason: error };
    }
  });

  ipcMain.handle('app:snapshot', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return { success: false, reason: 'no window found' };

      const img = await win.webContents.capturePage();
      const buffer = img.toPNG();
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: '匯出照片牆快照',
        defaultPath: 'PhotoWall_Snapshot.png',
        filters: [{ name: 'Images', extensions: ['png'] }]
      });
      if (!canceled && filePath) {
        fs.writeFileSync(filePath, buffer);
        return { success: true, filePath };
      }
      return { success: false, reason: 'canceled' };
    } catch (error) {
      console.error('Snapshot failed:', error);
      return { success: false, reason: String(error) };
    }
  });

  // ── Viewport DB ─────────────────────────────────────────────────────────
  // 載入指定目錄的 Viewport DB（渲染器在播放前呼叫）
  ipcMain.handle('viewport:load-db', async (_event, rootDir: string) => {
    return loadDb(rootDir);
  });

  // 存檔 Viewport DB（渲染器完成批次掃描後呼叫）
  ipcMain.handle('viewport:save-db', async (_event, rootDir: string, db: ViewportDb) => {
    try {
      saveDb(rootDir, db);
      return { success: true };
    } catch (e) {
      return { success: false, reason: String(e) };
    }
  });

  // 檢查指定目錄的 DB 是否存在（ConfigView 狀態徽章用）
  ipcMain.handle('viewport:check-db', async (_event, rootDir: string) => {
    const db = loadDb(rootDir);
    if (!db) return null;
    return {
      exists:      true,
      scannedAt:   db.scannedAt,
      total:       Object.keys(db.entries).length,
      failedCount: db.failedFiles.length,
    };
  });

  // 手動標註工具：原子更新單一圖片條目，並從 failedFiles 移除
  ipcMain.handle('viewport:update-entry', async (
    _event, rootDir: string, imagePath: string, entry: any
  ) => {
    try {
      updateEntry(rootDir, imagePath, entry);
      return { success: true };
    } catch (e) {
      return { success: false, reason: String(e) };
    }
  });

  // 全域 Check-out：依 basename 批次將所有相同檔名的條目設為原圖 (0,0,1,1)
  ipcMain.handle('viewport:batch-checkout', async (
    _event, rootDir: string, filename: string
  ) => {
    try {
      const count = batchCheckout(rootDir, filename);
      return { success: true, count };
    } catch (e) {
      return { success: false, reason: String(e) };
    }
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
