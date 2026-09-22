/**
 * platform.ts — 平台 API 抽象層
 *
 * 這是 Android 版本的核心隔離層，取代 Electron 的 window.electronAPI。
 * 所有平台相依的 I/O 操作都透過此模組封裝，讓 React 元件保持平台無關。
 *
 * Android 圖片存取策略：
 *   1. 使用者透過系統圖片選擇器 (Intent.ACTION_OPEN_DOCUMENT_TREE / FilePicker) 選取目錄
 *   2. 圖片以 content:// URI 的形式傳入
 *   3. 讀取圖片時轉換為 base64 data URL，以便 <img> 標籤顯示
 */

import { Filesystem, Directory, Encoding, ReaddirResult } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';

// ─── 型別定義 ─────────────────────────────────────────────────────────────────

export interface DbStatus {
  exists: boolean;
  scannedAt: string;
  total: number;
  failedCount: number;
}

export interface ViewportEntry {
  status: 'zoomed' | 'unchanged' | 'unrecognized' | 'manual';
  cropX?: number;
  cropY?: number;
  cropW?: number;
  cropH?: number;
}

export interface ViewportDb {
  scannedAt: string;
  rootDir: string;
  entries: Record<string, ViewportEntry>;
  failedFiles: string[];
}

// ─── 支援的圖片格式 ────────────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic', '.heif'];

function isImageFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

// ─── 路徑正規化 ───────────────────────────────────────────────────────────────

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

// ─── 圖片 URI → base64 data URL ──────────────────────────────────────────────

/**
 * 將 content:// 或 file:// URI 的圖片讀取為 base64 data URL
 * 可直接用於 <img src="..."> 或 CSS background-image
 */
export async function imageUriToBase64(uri: string): Promise<string | null> {
  try {
    if (uri.startsWith('data:')) return uri; // 已經是 base64

    // 使用 Capacitor Filesystem 讀取
    const result = await Filesystem.readFile({ path: uri });
    const base64 = typeof result.data === 'string' ? result.data : '';

    // 偵測 MIME type
    const lower = uri.toLowerCase();
    let mime = 'image/jpeg';
    if (lower.includes('.png'))  mime = 'image/png';
    if (lower.includes('.webp')) mime = 'image/webp';
    if (lower.includes('.gif'))  mime = 'image/gif';
    if (lower.includes('.heic') || lower.includes('.heif')) mime = 'image/heic';

    return `data:${mime};base64,${base64}`;
  } catch (e) {
    console.warn('[platform] imageUriToBase64 failed for:', uri, e);
    return null;
  }
}

// ─── 目錄掃描 ─────────────────────────────────────────────────────────────────

/**
 * 遞迴掃描目錄，回傳所有圖片的 URI（content:// 或 file://）
 */
async function scanDir(
  dirUri: string,
  recursive: boolean,
  subDirKeyword: string,
  result: string[]
): Promise<void> {
  try {
    const entries: ReaddirResult = await Filesystem.readdir({ path: dirUri });
    for (const entry of entries.files) {
      const name = entry.name;
      const fullUri = entry.uri || `${dirUri}/${name}`;

      if (entry.type === 'directory') {
        if (recursive) {
          const keywordMatch = !subDirKeyword || name.toLowerCase().includes(subDirKeyword.toLowerCase());
          if (keywordMatch) {
            await scanDir(fullUri, recursive, subDirKeyword, result);
          }
        }
      } else if (isImageFile(name)) {
        result.push(fullUri);
      }
    }
  } catch (e) {
    console.warn('[platform] scanDir failed for:', dirUri, e);
  }
}

/**
 * 主要掃描函式：掃描多個目錄，回傳圖片 URI 陣列
 */
export async function scanDirectories(
  dirUris: string[],
  recursive: boolean,
  subDirKeyword: string
): Promise<string[]> {
  const results: string[] = [];
  for (const uri of dirUris) {
    await scanDir(uri, recursive || !!subDirKeyword, subDirKeyword, results);
  }
  return results;
}

// ─── Viewport DB (Preferences 儲存) ──────────────────────────────────────────

/**
 * 產生 DB 的 Preferences key
 * rootDir 作為 key，避免不同目錄的 DB 互相覆蓋
 */
function dbKey(rootDir: string): string {
  return `viewport_db_${normalizePath(rootDir).replace(/[^a-zA-Z0-9]/g, '_')}`;
}

export async function loadViewportDb(rootDir: string): Promise<ViewportDb | null> {
  try {
    const { value } = await Preferences.get({ key: dbKey(rootDir) });
    if (!value) return null;
    return JSON.parse(value) as ViewportDb;
  } catch (e) {
    console.warn('[platform] loadViewportDb failed:', e);
    return null;
  }
}

export async function saveViewportDb(rootDir: string, db: ViewportDb): Promise<void> {
  await Preferences.set({ key: dbKey(rootDir), value: JSON.stringify(db) });
}

export async function checkViewportDb(rootDir: string): Promise<DbStatus | null> {
  const db = await loadViewportDb(rootDir);
  if (!db) return null;
  return {
    exists: true,
    scannedAt: db.scannedAt,
    total: Object.keys(db.entries).length,
    failedCount: db.failedFiles?.length ?? 0,
  };
}

export async function updateViewportEntry(
  rootDir: string,
  imagePath: string,
  entry: ViewportEntry
): Promise<void> {
  const db = await loadViewportDb(rootDir);
  if (!db) return;
  const key = normalizePath(imagePath);
  db.entries[key] = entry;
  db.failedFiles = (db.failedFiles || []).filter(f => normalizePath(f) !== key);
  await saveViewportDb(rootDir, db);
}

export async function batchCheckoutViewport(rootDir: string, filename: string): Promise<void> {
  const db = await loadViewportDb(rootDir);
  if (!db) return;
  for (const key of Object.keys(db.entries)) {
    if (key.endsWith(`/${filename}`) || key.endsWith(`\\${filename}`)) {
      db.entries[key] = { status: 'unchanged' };
    }
  }
  await saveViewportDb(rootDir, db);
}

// ─── 圖片儲存 ─────────────────────────────────────────────────────────────────

/**
 * 儲存圖片到裝置相簿 / 下載目錄
 * 使用 Capacitor Share API（若支援）或直接觸發下載
 */
export async function saveImageToDevice(imageUri: string): Promise<{ success: boolean; reason?: string }> {
  try {
    // 先嘗試 Web Share API（最自然的 Android 體驗）
    const canShare = await Share.canShare();
    if (canShare.value) {
      await Share.share({
        title: 'Midea Player — 儲存圖片',
        url: imageUri,
        dialogTitle: '選擇儲存方式',
      });
      return { success: true };
    }

    // Fallback：用 Filesystem 寫到 Documents
    const base64 = await imageUriToBase64(imageUri);
    if (!base64) return { success: false, reason: '無法讀取圖片' };

    const raw = base64.split(',')[1];
    const filename = `midea_${Date.now()}.jpg`;

    await Filesystem.writeFile({
      path: filename,
      data: raw,
      directory: Directory.Documents,
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, reason: e?.message ?? '未知錯誤' };
  }
}

// ─── 快照（html2canvas） ───────────────────────────────────────────────────────

/**
 * 截取當前畫面並分享 / 儲存
 */
export async function takeSnapshot(): Promise<{ success: boolean; reason?: string }> {
  try {
    // 動態 import 避免影響主 bundle 大小
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(document.body, {
      useCORS: true,
      allowTaint: true,
      scale: window.devicePixelRatio || 1,
    });

    // 轉為 Blob 並分享
    return new Promise(resolve => {
      canvas.toBlob(async blob => {
        if (!blob) { resolve({ success: false, reason: '截圖失敗' }); return; }
        try {
          const filename = `midea_snapshot_${Date.now()}.png`;
          const base64 = await blobToBase64(blob);
          const raw = base64.split(',')[1];

          await Filesystem.writeFile({
            path: filename,
            data: raw,
            directory: Directory.Cache,
          });

          const { uri } = await Filesystem.getUri({
            path: filename,
            directory: Directory.Cache,
          });

          const canShare = await Share.canShare();
          if (canShare.value) {
            await Share.share({ title: 'Midea Player 快照', url: uri, dialogTitle: '儲存快照' });
          }
          resolve({ success: true });
        } catch (e: any) {
          resolve({ success: false, reason: e?.message });
        }
      }, 'image/png');
    });
  } catch (e: any) {
    return { success: false, reason: e?.message ?? '未知錯誤' };
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
