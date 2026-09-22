/**
 * useViewportDb.ts
 *
 * 在播放前從主程序讀取 Viewport DB，並提供 `getViewport(imagePath)` 查詢函式。
 * 若 DB 不存在或尚未載入，查詢結果為 undefined（GridCell 將 fallback 至即時 AI）。
 *
 * @param directories 已選取的掃描目錄
 * @param dbRootDir   可選：DB 的實際存放目錄（空字串 = 使用 directories[0]）
 */

import { useEffect, useState, useCallback } from 'react';
import type { AiCropResult } from '../utils/viewportAi';

// ─── 型別 ─────────────────────────────────────────────────────────────────────

export interface ViewportEntry {
  status: 'zoomed' | 'unchanged' | 'unrecognized' | 'manual';
  cropX?: number;
  cropY?: number;
  cropW?: number;
  cropH?: number;
}

export interface ViewportDb {
  scannedAt:   string;
  rootDir:     string;
  entries:     Record<string, ViewportEntry>;
  failedFiles: string[];
}

/** 跨多個根目錄合併後的 DB Map，key = 正規化絕對路徑（反斜線→正斜線） */
export type ViewportDbMap = Map<string, AiCropResult>;

// ─── 路徑正規化 ───────────────────────────────────────────────────────────────

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useViewportDb(directories: string[], dbRootDir: string = '') {
  const [dbMap,     setDbMap]     = useState<ViewportDbMap>(new Map());
  const [rawDb,     setRawDb]     = useState<ViewportDb | null>(null);  // 供 AnnotationView 使用
  const [isLoaded,  setIsLoaded]  = useState(false);

  useEffect(() => {
    if (directories.length === 0 && !dbRootDir) {
      setDbMap(new Map());
      setRawDb(null);
      setIsLoaded(true);
      return;
    }

    let cancelled = false;

    (async () => {
      const api = (window as any).electronAPI;
      if (!api?.loadViewportDb) {
        setIsLoaded(true);
        return;
      }

      const merged = new Map<string, AiCropResult>();

      // DB 實際存放目錄：優先使用 dbRootDir，否則逐一嘗試各掃描目錄
      const rootDirs = dbRootDir
        ? [dbRootDir]
        : (directories.length > 0 ? [directories[0]] : []);

      let lastRawDb: ViewportDb | null = null;

      for (const rootDir of rootDirs) {
        try {
          const db: ViewportDb | null = await api.loadViewportDb(rootDir);
          if (!db?.entries) continue;
          lastRawDb = db;

          for (const [rawPath, entry] of Object.entries(db.entries)) {
            const key = normalizePath(rawPath);
            const result: AiCropResult = {
              status: entry.status as AiCropResult['status'],
              cropX:  entry.cropX,
              cropY:  entry.cropY,
              cropW:  entry.cropW,
              cropH:  entry.cropH,
            };
            merged.set(key, result);
          }
          console.log(`[ViewportDb] Loaded ${Object.keys(db.entries).length} entries from`, rootDir);
        } catch (e) {
          console.warn('[ViewportDb] Failed to load DB for', rootDir, e);
        }
      }

      if (!cancelled) {
        setDbMap(merged);
        setRawDb(lastRawDb);
        setIsLoaded(true);
        console.log(`[ViewportDb] Total merged entries: ${merged.size}`);
      }
    })();

    return () => { cancelled = true; };
  }, [directories.join('|'), dbRootDir]);

  /**
   * 查詢單張圖片的 Viewport 結果。
   * imagePath 可以是原始路徑或 local-resource:// URL，自動標準化。
   */
  const getViewport = useCallback(
    (imagePath: string): AiCropResult | undefined => {
      const normalized = normalizePath(
        imagePath.replace(/^local-resource:\/\//, '')
      );
      return dbMap.get(normalized);
    },
    [dbMap]
  );

  return { dbMap, rawDb, isLoaded, getViewport };
}
