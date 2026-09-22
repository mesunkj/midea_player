/**
 * viewportDb.ts
 *
 * 本地 Viewport 資料庫的讀寫工具。
 * 每個掃描根目錄底下儲存一個 `.viewport_db.json`，
 * 記錄該目錄所有圖片的人臉偵測結果與裁切 Viewport。
 */

import * as fs   from 'fs';
import * as path from 'path';

// ─── 型別定義 ─────────────────────────────────────────────────────────────────

export type ViewportStatus = 'zoomed' | 'unchanged' | 'unrecognized' | 'manual';

export interface ViewportEntry {
  /** 判定結果 */
  status: ViewportStatus;
  /** 以下四個欄位為正規化座標 (0–1)，代表裁切起點與尺寸 */
  cropX?: number;
  cropY?: number;
  cropW?: number;
  cropH?: number;
}

export interface ViewportDb {
  /** 最後掃描時間 (ISO 8601) */
  scannedAt: string;
  /** 掃描的根目錄路徑 */
  rootDir: string;
  /** key = 圖片絕對路徑，value = 偵測結果 */
  entries: Record<string, ViewportEntry>;
  /** 辨識失敗的完整路徑清單（供後續追蹤） */
  failedFiles: string[];
}

// ─── 路徑工具 ─────────────────────────────────────────────────────────────────

const DB_FILENAME = '.viewport_db.json';

export function getDbPath(rootDir: string): string {
  return path.join(rootDir, DB_FILENAME);
}

// ─── 讀取 ─────────────────────────────────────────────────────────────────────

/**
 * 讀取指定根目錄的 Viewport DB。
 * 若檔案不存在或解析失敗，回傳 null。
 */
export function loadDb(rootDir: string): ViewportDb | null {
  const dbPath = getDbPath(rootDir);
  try {
    if (!fs.existsSync(dbPath)) return null;
    const raw = fs.readFileSync(dbPath, 'utf-8');
    return JSON.parse(raw) as ViewportDb;
  } catch (e) {
    console.error('[ViewportDb] loadDb failed for', rootDir, e);
    return null;
  }
}

// ─── 寫入 ─────────────────────────────────────────────────────────────────────

/**
 * 將 Viewport DB 原子性寫入磁碟（先寫暫存檔再 rename，防止寫到一半崩潰）。
 */
export function saveDb(rootDir: string, db: ViewportDb): void {
  const dbPath = getDbPath(rootDir);
  const tmpPath = dbPath + '.tmp';
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf-8');
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    fs.renameSync(tmpPath, dbPath);
    console.log('[ViewportDb] Saved to', dbPath,
      `| entries=${Object.keys(db.entries).length}`,
      `| failed=${db.failedFiles.length}`);
  } catch (e) {
    console.error('[ViewportDb] saveDb failed for', rootDir, e);
    // 清理殘留暫存檔
    if (fs.existsSync(tmpPath)) {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
    throw e;
  }
}

// ─── 單一條目更新 ──────────────────────────────────────────────────────────────

/**
 * 原子更新單一圖片的 Viewport 條目，並將其從 failedFiles 清單中移除。
 * 用於手動標註工具確認後的即時儲存。
 * 若 DB 檔案不存在，靜默忽略（不拋出錯誤）。
 */
export function updateEntry(
  rootDir: string,
  imagePath: string,
  entry: ViewportEntry
): void {
  const db = loadDb(rootDir);
  if (!db) {
    console.warn('[ViewportDb] updateEntry: DB not found for', rootDir);
    return;
  }
  db.entries[imagePath] = entry;
  db.failedFiles = db.failedFiles.filter(f => f !== imagePath);
  saveDb(rootDir, db);
  console.log('[ViewportDb] updateEntry:', imagePath, '→', entry.status);
}

// ─── 批次 Check-out（依檔名跨 Model 套用）──────────────────────────────────────

const getBasename = (p: string) => p.replace(/\\/g, '/').split('/').pop() ?? p;

/**
 * 將 DB 中所有 basename 等於 filename 的條目批次設為「維持原圖」
 * (status: 'unchanged', viewport: 0,0,1,1)，並一併從 failedFiles 移除。
 * 用於「全域 Check-out」功能，一次解決跨 Model 重複同檔名問題。
 * @returns 實際更新的條目數
 */
export function batchCheckout(rootDir: string, filename: string): number {
  const db = loadDb(rootDir);
  if (!db) {
    console.warn('[ViewportDb] batchCheckout: DB not found for', rootDir);
    return 0;
  }

  const fullImageEntry: ViewportEntry = {
    status: 'unchanged',
    cropX: 0, cropY: 0, cropW: 1, cropH: 1,
  };

  let count = 0;
  for (const fullPath of Object.keys(db.entries)) {
    if (getBasename(fullPath) === filename) {
      db.entries[fullPath] = fullImageEntry;
      count++;
    }
  }

  // 從 failedFiles 移除所有相同 basename 的條目
  db.failedFiles = db.failedFiles.filter(f => getBasename(f) !== filename);

  if (count > 0) {
    saveDb(rootDir, db);
    console.log(`[ViewportDb] batchCheckout "${filename}": updated ${count} entries`);
  }
  return count;
}
