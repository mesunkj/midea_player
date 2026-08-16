import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { selectDirectories, scanDirectories, generateThumbnail } from './fileManager';

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
  protocol.registerFileProtocol('local-resource', (request, callback) => {
    const url = request.url.replace(/^local-resource:\/\//, '');
    try {
      return callback(decodeURIComponent(url));
    } catch (error) {
      console.error(error);
      return callback('404');
    }
  });

  // 註冊 IPC Handlers
  ipcMain.handle('dialog:openDirectory', async () => {
    return await selectDirectories();
  });

  ipcMain.handle('files:scan', async (_event, dirPaths: string[], recursive: boolean) => {
    return scanDirectories(dirPaths, recursive);
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
