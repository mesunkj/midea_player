/**
 * useViewportScanner.ts
 *
 * 批次掃描 Hook（增量 + 檔名快取複用模式）：
 *
 * 查詢優先順序（三層）：
 *   1. 完整路徑已在 DB 且狀態成功 → skipped（完全跳過）
 *   2. 同一 basename（如 001.jpg）已偵測過 → reused（複用結果，不跑 AI）
 *   3. 全新圖片 → 執行 TinyFaceDetector
 *
 * 理由：同一專題下不同 Model 子目錄的圖片檔名相同、構圖相同，
 * 只需偵測一次即可將結果共享給所有相同檔名的圖片。
 * DB 中每張圖仍以完整路徑為 Key，確保渲染時不出錯。
 */

import { useState, useRef, useCallback } from 'react';
import { ensureModelLoaded, detectViewport, AiCropResult } from '../utils/viewportAi';
import type { ViewportDb, ViewportEntry } from './useViewportDb';

// ─── 型別 ─────────────────────────────────────────────────────────────────────

export interface ScanProgress {
  total:        number;   // 全部圖片數
  done:         number;   // 已處理（掃描 + 跳過 + 複用）
  currentFile:  string;
  zoomed:       number;   // Zoom-in 成功
  unchanged:    number;   // 判定正常
  unrecognized: number;   // 辨識失敗
  skipped:      number;   // 沿用完整路徑舊結果
  reused:       number;   // 依檔名複用其他 Model 的結果
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

/** 取得路徑的 basename（不含目錄），例如 "C:\a\b\001.jpg" → "001.jpg" */
const getBasename = (path: string): string =>
  path.replace(/\\/g, '/').split('/').pop() ?? path;

/** 判斷 DB 中某條目是否為「已成功」（可跳過重掃） */
const isSuccessful = (entry: ViewportEntry | undefined): boolean =>
  !!entry && (entry.status === 'zoomed' || entry.status === 'unchanged' || entry.status === 'manual');

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useViewportScanner() {
  const [scanState,  setScanState]  = useState<ScanState>('idle');
  const [progress,   setProgress]   = useState<ScanProgress | null>(null);
  const [summary,    setSummary]    = useState<ScanSummary | null>(null);
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);
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

  /**
   * @param imagePaths  圖片路徑清單
   * @param dbRootDir   DB 儲存目錄（空字串 = 使用 firstDir）
   * @param firstDir    若 dbRootDir 未指定，DB 存入此目錄
   */
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
    const api   = (window as any).electronAPI;

    // ── 1. 讀取現有 DB ────────────────────────────────────────────────────────
    let existingEntries: Record<string, ViewportEntry> = {};

    if (api?.loadViewportDb) {
      try {
        const existingDb: ViewportDb | null = await api.loadViewportDb(effectiveRootDir);
        if (existingDb?.entries) {
          existingEntries = existingDb.entries;
          console.log('[Scanner] Existing DB entries:', Object.keys(existingEntries).length);
        }
      } catch (e) {
        console.warn('[Scanner] Could not load existing DB:', e);
      }
    }

    // ── 2. 建立「檔名快取」（Filename Cache）─────────────────────────────────
    // Key = basename（如 "001.jpg"），Value = 已知最佳結果
    // 涵蓋所有狀態（含 unrecognized），讓複用符合 sp3 規格
    const filenameCache = new Map<string, ViewportEntry>();
    for (const [fullPath, entry] of Object.entries(existingEntries)) {
      const fname = getBasename(fullPath);
      if (!filenameCache.has(fname)) {
        filenameCache.set(fname, entry);
      }
    }
    console.log('[Scanner] Filename cache built:', filenameCache.size, 'unique filenames');

    // ── 3. 三層分類 ───────────────────────────────────────────────────────────
    // Layer 1: skipped  → 完整路徑已在 DB（且成功）
    // Layer 2: reused   → 同 basename 已在快取（但完整路徑尚未記錄）
    // Layer 3: toScan   → 完全新的，需要 AI
    const toScan:    string[] = [];
    const toReuse:   Array<{ path: string; entry: ViewportEntry }> = [];

    for (const p of imagePaths) {
      if (isSuccessful(existingEntries[p])) {
        // Layer 1: 完整路徑已成功 → skipped
        continue;
      }
      const cached = filenameCache.get(getBasename(p));
      if (cached) {
        // Layer 2: 同 basename 已有結果 → reused
        toReuse.push({ path: p, entry: cached });
      } else {
        // Layer 3: 完全新圖片 → 需要 AI
        toScan.push(p);
      }
    }

    const skipped = imagePaths.length - toReuse.length - toScan.length;
    let reused = 0, zoomed = 0, unchanged = 0, unrecognized = 0;

    // 從現有 DB 統計起始計數（Layer 1 的條目）
    for (const p of imagePaths) {
      if (isSuccessful(existingEntries[p])) {
        const e = existingEntries[p]!;
        if (e.status === 'zoomed' || e.status === 'manual') zoomed++;
        else if (e.status === 'unchanged') unchanged++;
      }
    }

    console.log(`[Scanner] Total=${total} skipped=${skipped} reused(planned)=${toReuse.length} toScan=${toScan.length}`);

    setScanState('scanning');
    setProgress({ total, done: skipped, currentFile: '分類中...', zoomed, unchanged, unrecognized, skipped, reused });

    if (cancelRef.current) { setScanState('cancelled'); return null; }

    // ── 4. 套用複用結果（Layer 2）────────────────────────────────────────────
    for (const { path, entry } of toReuse) {
      if (cancelRef.current) { setScanState('cancelled'); return null; }
      const fname = getBasename(path);
      console.log(`[Scanner] Reuse "${fname}" for`, path, '→', entry.status);

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

    // ── 5. 載入模型（只有 Layer 3 才需要）───────────────────────────────────
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

      // ── 6. AI 掃描（Layer 3）──────────────────────────────────────────────
      let aiDone = 0;
      for (const rawPath of toScan) {
        if (cancelRef.current) { setScanState('cancelled'); return null; }

        const fname    = getBasename(rawPath);
        const doneSoFar = skipped + reused + aiDone;
        setProgress({
          total, done: doneSoFar, currentFile: fname,
          zoomed, unchanged, unrecognized, skipped, reused,
        });

        let result: AiCropResult;
        try {
          result = await detectViewport(rawPath);
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

        // 將本次結果注入 filenameCache，後續相同 basename 的圖片可直接複用
        if (!filenameCache.has(fname)) {
          filenameCache.set(fname, entry);
          console.log(`[Scanner] Filename cached: "${fname}" → ${entry.status}`);
        }
      }
    }

    if (cancelRef.current) { setScanState('cancelled'); return null; }

    // ── 7. 合併 failedFiles 清單 ──────────────────────────────────────────────
    const failedFiles = imagePaths.filter(p => existingEntries[p]?.status === 'unrecognized');

    // ── 8. 儲存 DB ────────────────────────────────────────────────────────────
    setScanState('saving');
    setProgress({
      total, done: total, currentFile: '儲存資料庫...',
      zoomed, unchanged, unrecognized, skipped, reused,
    });

    const db: ViewportDb = {
      scannedAt: new Date().toISOString(),
      rootDir:   effectiveRootDir,
      entries:   existingEntries,
      failedFiles,
    };

    if (api?.saveViewportDb) {
      try {
        const res = await api.saveViewportDb(effectiveRootDir, db);
        if (!res?.success) {
          console.error('[Scanner] saveViewportDb failed:', res?.reason);
        }
      } catch (e) {
        console.error('[Scanner] saveViewportDb IPC error:', e);
      }
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

    console.log('[Scanner] ✅ Scan complete:', finalSummary);
    return finalSummary;
  }, []);

  return { scanState, progress, summary, errorMsg, startScan, cancel, reset };
}
