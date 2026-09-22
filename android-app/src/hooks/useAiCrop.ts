/**
 * useAiCrop.ts — Android 版本
 *
 * 即時（per-image）人臉偵測 React Hook。
 * Android 版本：imageSrc 接受 base64 data URL（由 GridCell 傳入）
 */

import { useEffect, useState, useRef } from 'react';
import {
  AiCropStatus,
  AiCropResult,
  ensureModelLoaded,
  detectViewport,
} from '../utils/viewportAi';

export type { AiCropStatus, AiCropResult };

export function useAiCrop(imageSrc: string): AiCropResult {
  const [result, setResult] = useState<AiCropResult>({ status: 'pending' });
  const cancelRef = useRef(false);

  useEffect(() => {
    // Android 版：imageSrc 為 base64 data URL 或 content:// URI
    if (!imageSrc || imageSrc === 'pending') {
      setResult({ status: 'pending' });
      return;
    }

    cancelRef.current = false;
    setResult({ status: 'pending' });

    (async () => {
      try {
        await ensureModelLoaded();
      } catch {
        if (!cancelRef.current) setResult({ status: 'unrecognized' });
        return;
      }
      if (cancelRef.current) return;

      const cropResult = await detectViewport(imageSrc);
      if (!cancelRef.current) setResult(cropResult);
    })();

    return () => { cancelRef.current = true; };
  }, [imageSrc]);

  return result;
}
