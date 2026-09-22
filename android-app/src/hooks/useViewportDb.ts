/**
 * useViewportDb.ts — Android 版本
 *
 * 從 Capacitor Preferences 讀取 Viewport DB，提供 getViewport(imagePath) 查詢函式。
 * DB 的讀取/寫入透過 platform.ts 封裝。
 */

import { useEffect, useState, useCallback } from 'react';
import type { AiCropResult } from '../utils/viewportAi';
import { loadViewportDb, normalizePath } from '../platform';
import type { ViewportDb } from '../platform';

// ─── 型別 ─────────────────────────────────────────────────────────────────────

export interface ViewportEntry {
  status: 'zoomed' | 'unchanged' | 'unrecognized' | 'manual';
  cropX?: number;
  cropY?: number;
  cropW?: number;
  cropH?: number;
}

export { ViewportDb };

export type ViewportDbMap = Map<string, AiCropResult>;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useViewportDb(directories: string[], dbRootDir: string = '') {
  const [dbMap,    setDbMap]    = useState<ViewportDbMap>(new Map());
  const [rawDb,    setRawDb]    = useState<ViewportDb | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (directories.length === 0 && !dbRootDir) {
      setDbMap(new Map());
      setRawDb(null);
      setIsLoaded(true);
      return;
    }

    let cancelled = false;

    (async () => {
      const merged = new Map<string, AiCropResult>();

      // DB 實際存放目錄
      const rootDirs = dbRootDir
        ? [dbRootDir]
        : directories.length > 0 ? [directories[0]] : [];

      let lastRawDb: ViewportDb | null = null;

      for (const rootDir of rootDirs) {
        try {
          const db = await loadViewportDb(rootDir);
          if (!db?.entries) continue;
          lastRawDb = db;

          for (const [rawPath, entry] of Object.entries(db.entries)) {
            const key = normalizePath(rawPath);
            const result: AiCropResult = {
              status: entry.status as AiCropResult['status'],
              cropX: entry.cropX,
              cropY: entry.cropY,
              cropW: entry.cropW,
              cropH: entry.cropH,
            };
            merged.set(key, result);
          }
        } catch (e) {
          console.warn('[ViewportDb] Failed to load DB for', rootDir, e);
        }
      }

      if (!cancelled) {
        setDbMap(merged);
        setRawDb(lastRawDb);
        setIsLoaded(true);
      }
    })();

    return () => { cancelled = true; };
  }, [directories.join('|'), dbRootDir]);

  const getViewport = useCallback(
    (imagePath: string): AiCropResult | undefined => {
      const normalized = normalizePath(imagePath);
      return dbMap.get(normalized);
    },
    [dbMap]
  );

  return { dbMap, rawDb, isLoaded, getViewport };
}
