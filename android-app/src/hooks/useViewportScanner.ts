/**
 * useViewportScanner.ts — Android 版本
 *
 * 批次掃描 Hook（增量 + 檔名快取複用模式）
 * Android 差異：
 *   - 圖片路徑為 content:// URI
 *   - DB 透過 platform.ts (Capacitor Preferences) 讀寫，不透過 Electron IPC
 *   - AI 偵測需先將圖片轉為 base64（Android WebView 不支援 local-resource://）
 */

import { useState, useRef, useCallback } from 'react';
import { ensureModelLoaded, detectViewport, AiCropResult } from '../utils/viewportAi';
import { loadViewportDb, saveViewportDb, imageUriToBase64 } from '../platform';
import type { ViewportDb, ViewportEntry } from '../platform';

// ─── 型別 ─────────────────────────────────────────────────────────────────────

export interface ScanProgress {
  total:        number;
  done:         number;
  currentFile:  string;
  zoomed:       number;
  unchanged:    number;
  unrecognized: number;
  skipped:      number;
  reused:       number;
}

export interface ScanSummary {
  total:        number;
  zoomed:       number;
  unchanged:    number;
  unrecognized: number;
  skipped:      number;
  reused:       number;
  failedFiles:  string[];
  savedToDir:   string;
}

export type ScanState = 'idle' | 'loading-model' | 'scanning' | 'saving' | 'done' | 'cancelled' | 'error';

// ─── 工具函式 ─────────────────────────────────────────────────────────────────

const getBasename = (path: string): string =>
  path.replace(/\\/g, '/').split('/').pop() ?? path;

const isSuccessful = (entry: ViewportEntry | undefined): boolean =>
  !!entry && (entry.status === 'zoomed' || entry.status === 'unchanged' || entry.status === 'manual');

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useViewportScanner() {
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [progress,  setProgress]  = useState<ScanProgress | null>(null);
  const [summary,   setSummary]   = useState<ScanSummary | null>(null);
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);
  const cancelRef = useRef(false);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    setScanState('cancelled');
  }, []);

  const reset = useCallback(() => {
    cancelRef.current = false;
    setScanState('idle');
    setProgress(null);
    setSummary(null);
    setErrorMsg(null);
  }, []);

  const startScan = useCallback(async (
    imagePaths: string[],
    dbRootDir:  string,
    firstDir:   string
  ): Promise<ScanSummary | null> => {
    cancelRef.current = false;
    setErrorMsg(null);
    setSummary(null);

    const effectiveRootDir = dbRootDir.trim() || firstDir;
    const total = imagePaths.length;

    // ── 1. 讀取現有 DB ────────────────────────────────────────────────────────
    let existingEntries: Record<string, ViewportEntry> = {};
    try {
      const existingDb = await loadViewportDb(effectiveRootDir);
      if (existingDb?.entries) {
        existingEntries = existingDb.entries;
      }
    } catch (e) {
      console.warn('[Scanner] Could not load existing DB:', e);
    }

    // ── 2. 建立「檔名快取」────────────────────────────────────────────────────
    const filenameCache = new Map<string, ViewportEntry>();
    for (const [fullPath, entry] of Object.entries(existingEntries)) {
      const fname = getBasename(fullPath);
      if (!filenameCache.has(fname)) {
        filenameCache.set(fname, entry);
      }
    }

    // ── 3. 三層分類 ───────────────────────────────────────────────────────────
    const toScan:  string[] = [];
    const toReuse: Array<{ path: string; entry: ViewportEntry }> = [];

    for (const p of imagePaths) {
      if (isSuccessful(existingEntries[p])) continue;
      const cached = filenameCache.get(getBasename(p));
      if (cached) {
        toReuse.push({ path: p, entry: cached });
      } else {
        toScan.push(p);
      }
    }

    const skipped = imagePaths.length - toReuse.length - toScan.length;
    let reused = 0, zoomed = 0, unchanged = 0, unrecognized = 0;

    for (const p of imagePaths) {
      if (isSuccessful(existingEntries[p])) {
        const e = existingEntries[p]!;
        if (e.status === 'zoomed' || e.status === 'manual') zoomed++;
        else if (e.status === 'unchanged') unchanged++;
      }
    }

    setScanState('scanning');
    setProgress({ total, done: skipped, currentFile: '分類中...', zoomed, unchanged, unrecognized, skipped, reused });

    if (cancelRef.current) { setScanState('cancelled'); return null; }

    // ── 4. 套用複用結果（Layer 2）────────────────────────────────────────────
    for (const { path, entry } of toReuse) {
      if (cancelRef.current) { setScanState('cancelled'); return null; }
      const fname = getBasename(path);
      existingEntries[path] = entry;
      reused++;
      if (entry.status === 'zoomed' || entry.status === 'manual') zoomed++;
      else if (entry.status === 'unchanged') unchanged++;
      else unrecognized++;

      setProgress({
        total, done: skipped + reused, currentFile: `[複用] ${fname}`,
        zoomed, unchanged, unrecognized, skipped, reused,
      });
    }

    // ── 5. 載入 AI 模型 ───────────────────────────────────────────────────────
    if (toScan.length > 0) {
      setScanState('loading-model');
      setProgress({
        total, done: skipped + reused, currentFile: '載入 AI 模型中...',
        zoomed, unchanged, unrecognized, skipped, reused,
      });

      try {
        await ensureModelLoaded();
      } catch (err) {
        setScanState('error');
        setErrorMsg('AI 模型載入失敗：' + String(err));
        return null;
      }

      if (cancelRef.current) { setScanState('cancelled'); return null; }
      setScanState('scanning');

      // ── 6. AI 掃描 ────────────────────────────────────────────────────────
      let aiDone = 0;
      for (const rawPath of toScan) {
        if (cancelRef.current) { setScanState('cancelled'); return null; }

        const fname = getBasename(rawPath);
        setProgress({
          total, done: skipped + reused + aiDone, currentFile: fname,
          zoomed, unchanged, unrecognized, skipped, reused,
        });

        let result: AiCropResult;
        try {
          // Android：先轉 base64 才能進行 AI 偵測
          const base64Src = await imageUriToBase64(rawPath);
          if (base64Src) {
            result = await detectViewport(base64Src);
          } else {
            result = { status: 'unrecognized' };
          }
        } catch {
          result = { status: 'unrecognized' };
        }

        const entry: ViewportEntry = { status: result.status as ViewportEntry['status'] };
        if (result.status === 'zoomed') {
          entry.cropX = result.cropX;
          entry.cropY = result.cropY;
          entry.cropW = result.cropW;
          entry.cropH = result.cropH;
          zoomed++;
        } else if (result.status === 'unchanged') {
          unchanged++;
        } else {
          unrecognized++;
        }

        existingEntries[rawPath] = entry;
        aiDone++;

        if (!filenameCache.has(fname)) {
          filenameCache.set(fname, entry);
        }
      }
    }

    if (cancelRef.current) { setScanState('cancelled'); return null; }

    // ── 7. 合併 failedFiles ────────────────────────────────────────────────────
    const failedFiles = imagePaths.filter(p => existingEntries[p]?.status === 'unrecognized');

    // ── 8. 儲存 DB（Capacitor Preferences）────────────────────────────────────
    setScanState('saving');

    const db: ViewportDb = {
      scannedAt: new Date().toISOString(),
      rootDir:   effectiveRootDir,
      entries:   existingEntries,
      failedFiles,
    };

    try {
      await saveViewportDb(effectiveRootDir, db);
    } catch (e) {
      console.error('[Scanner] saveViewportDb failed:', e);
    }

    // ── 9. 完成 ───────────────────────────────────────────────────────────────
    const finalSummary: ScanSummary = {
      total, zoomed, unchanged, unrecognized, skipped, reused,
      failedFiles,
      savedToDir: effectiveRootDir,
    };

    setScanState('done');
    setSummary(finalSummary);
    setProgress({
      total, done: total, currentFile: '完成',
      zoomed, unchanged, unrecognized, skipped, reused,
    });

    return finalSummary;
  }, []);

  return { scanState, progress, summary, errorMsg, startScan, cancel, reset };
}
