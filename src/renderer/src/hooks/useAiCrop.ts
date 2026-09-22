/**
 * useAiCrop.ts
 *
 * 即時（per-image）人臉偵測 React Hook。
 * AI 邏輯已抽離至 utils/viewportAi.ts（與批次掃描共用）。
 *
 * 用法：
 *   const crop = useAiCrop('local-resource://C:/photos/img.jpg');
 *   // crop.status: 'pending' | 'zoomed' | 'unchanged' | 'unrecognized'
 */

import { useEffect, useState, useRef } from 'react';
import {
  AiCropStatus,
  AiCropResult,
  ensureModelLoaded,
  detectViewport,
} from '../utils/viewportAi';

// 重新匯出型別，維持對外介面相容性
export type { AiCropStatus, AiCropResult };

// ─── useAiCrop Hook ───────────────────────────────────────────────────────────

export function useAiCrop(imageSrc: string): AiCropResult {
  const [result, setResult] = useState<AiCropResult>({ status: 'pending' });
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!imageSrc) { setResult({ status: 'pending' }); return; }

    cancelRef.current = false;
    setResult({ status: 'pending' });

    (async () => {
      // 1. 確保模型已載入（全域只做一次）
      try {
        await ensureModelLoaded();
      } catch {
        if (!cancelRef.current) setResult({ status: 'unrecognized' });
        return;
      }
      if (cancelRef.current) return;

      // 2. 人臉偵測（imageSrc 已是 local-resource:// URL）
      const cropResult = await detectViewport(imageSrc);
      if (!cancelRef.current) setResult(cropResult);
    })();

    return () => { cancelRef.current = true; };
  }, [imageSrc]);

  return result;
}
