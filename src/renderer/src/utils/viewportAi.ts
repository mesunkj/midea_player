/**
 * viewportAi.ts
 *
 * 共用 AI 工具函式，供以下兩處使用：
 *   1. useAiCrop.ts      — 即時（per-image）人臉偵測 hook
 *   2. useViewportScanner.ts — 離線批次掃描 hook
 *
 * 模型（TinyFaceDetector）為全域單例，僅在首次使用時載入一次。
 */

// ─── 型別定義 ─────────────────────────────────────────────────────────────────

export type AiCropStatus = 'pending' | 'zoomed' | 'unchanged' | 'unrecognized';

export interface AiCropResult {
  status: AiCropStatus;
  cropX?: number;
  cropY?: number;
  cropW?: number;
  cropH?: number;
}

// ─── 模型單例 ─────────────────────────────────────────────────────────────────

let modelReady   = false;
let modelLoading = false;
let modelError   = false;
const modelReadyCallbacks: Array<() => void>       = [];
const modelErrorCallbacks: Array<(e: any) => void> = [];

/**
 * 載入 face-api.js 及本地模型（models/ 由 public/ 提供，不需網路）。
 * 全域只執行一次，後續呼叫直接 resolve。
 */
export async function ensureModelLoaded(): Promise<void> {
  if (modelReady) return;
  if (modelError) throw new Error('Model previously failed to load');

  if (modelLoading) {
    return new Promise((resolve, reject) => {
      modelReadyCallbacks.push(resolve);
      modelErrorCallbacks.push(reject);
    });
  }

  modelLoading = true;
  try {
    console.log('[AI] Loading @vladmandic/face-api...');
    const faceapi = await import('@vladmandic/face-api');
    const MODEL_URL = '/models';
    console.log('[AI] Loading TinyFaceDetector from', MODEL_URL);
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);

    modelReady   = true;
    modelLoading = false;
    console.log('[AI] ✅ TinyFaceDetector model ready.');
    modelReadyCallbacks.forEach(cb => cb());
    modelReadyCallbacks.length = 0;
    modelErrorCallbacks.length = 0;
  } catch (err) {
    modelLoading = false;
    modelError   = true;
    console.error('[AI] ❌ Model load failed:', err);
    modelErrorCallbacks.forEach(cb => cb(err));
    modelErrorCallbacks.length = 0;
    modelReadyCallbacks.length = 0;
    throw err;
  }
}

// ─── 圖片載入 ─────────────────────────────────────────────────────────────────

/**
 * 透過 IPC imageToBase64 取得圖片的 HTMLImageElement（完全無 CORS 限制）。
 * imageSrc 可以是 local-resource:// URL 或原始絕對路徑（自動轉換）。
 */
export async function loadImageFromIpc(imageSrc: string): Promise<HTMLImageElement> {
  const api = (window as any).electronAPI;
  if (!api?.imageToBase64) throw new Error('imageToBase64 IPC not available');

  const dataUrl: string | null = await api.imageToBase64(imageSrc);
  if (!dataUrl) throw new Error(`imageToBase64 returned null for: ${imageSrc}`);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image from data URL'));
    img.src = dataUrl;
  });
}

/**
 * 將 Windows 原始絕對路徑轉換為 local-resource:// URL。
 * 若已是 local-resource:// 格式，則原樣回傳。
 */
export function toLocalResourceUrl(src: string): string {
  if (src.startsWith('local-resource://')) return src;
  return `local-resource://${src.replace(/\\/g, '/')}`;
}

// ─── 裁切規則計算 ─────────────────────────────────────────────────────────────

/**
 * 裁切規則（三個條件同時滿足才觸發 zoom）：
 *   1. headTop / imgH > 5%   → 頭頂上方有空間
 *   2. faceLeft / imgW > 5%  → 左側有空間
 *   3. (imgW-faceRight) / imgW > 5% → 右側有空間
 *
 * 裁切方式：
 *   - 上緣：頭頂 - 25% 臉高（頭髮預留）
 *   - 寬度：臉寬 × 2.6（估計肩寬），以臉部中心對稱
 *   - 高度：cropW × (imgH / imgW)（按原圖比例向下延伸）
 */
export function computeCrop(
  detections: any[],
  imgW: number,
  imgH: number
): AiCropResult {
  const HEAD_TOP_MARGIN    = 0.05;
  const SIDE_MARGIN        = 0.05;
  const HEAD_PADDING_RATIO = 0.25;
  const BODY_WIDTH_RATIO   = 2.6;

  if (!detections || detections.length === 0) {
    console.log('[AI] No face detected → unrecognized');
    return { status: 'unrecognized' };
  }

  // 取信心度最高的臉
  const best = detections.reduce((a: any, b: any) =>
    (a.score ?? 0) >= (b.score ?? 0) ? a : b
  );

  const box = best.box ?? best.detection?.box;
  if (!box) return { status: 'unrecognized' };

  const faceLeft    = box.x ?? box.xMin ?? box.left;
  const faceTop     = box.y ?? box.yMin ?? box.top;
  const faceW       = box.width;
  const faceH       = box.height;
  const faceRight   = faceLeft + faceW;
  const faceCenterX = faceLeft + faceW / 2;

  const headTopRatio    = faceTop / imgH;
  const leftSpaceRatio  = faceLeft / imgW;
  const rightSpaceRatio = (imgW - faceRight) / imgW;

  console.log(`[AI] Face: top=${(headTopRatio*100).toFixed(0)}%` +
    ` left=${(leftSpaceRatio*100).toFixed(0)}%` +
    ` right=${(rightSpaceRatio*100).toFixed(0)}%` +
    ` score=${(best.score ?? 0).toFixed(2)}`);

  const shouldZoom =
    headTopRatio    > HEAD_TOP_MARGIN &&
    leftSpaceRatio  > SIDE_MARGIN     &&
    rightSpaceRatio > SIDE_MARGIN;

  if (!shouldZoom) {
    console.log('[AI] No space → unchanged');
    return { status: 'unchanged' };
  }

  // 計算裁切框
  const estimatedBodyW = faceW * BODY_WIDTH_RATIO;
  const cropPxLeft  = Math.max(0, faceCenterX - estimatedBodyW / 2);
  const cropPxRight = Math.min(imgW, faceCenterX + estimatedBodyW / 2);
  const cropPxW     = cropPxRight - cropPxLeft;
  let   cropPxTop   = Math.max(0, faceTop - faceH * HEAD_PADDING_RATIO);
  const cropPxH     = cropPxW * (imgH / imgW);

  if (cropPxTop + cropPxH > imgH) cropPxTop = Math.max(0, imgH - cropPxH);

  const cropX = cropPxLeft / imgW;
  const cropY = cropPxTop  / imgH;
  const cropW = cropPxW    / imgW;
  const cropH = Math.min(cropPxH, imgH - cropPxTop) / imgH;

  console.log(`[AI] → zoomed: x=${cropX.toFixed(2)} y=${cropY.toFixed(2)} w=${cropW.toFixed(2)} h=${cropH.toFixed(2)}`);
  return { status: 'zoomed', cropX, cropY, cropW, cropH };
}

// ─── 人臉偵測 ─────────────────────────────────────────────────────────────────

/**
 * 對單張圖片執行人臉偵測並計算 Viewport 裁切結果。
 * rawPath 為原始絕對路徑（自動轉換為 local-resource URL）。
 */
export async function detectViewport(rawPath: string): Promise<AiCropResult> {
  const src = toLocalResourceUrl(rawPath);

  // 1. 載入圖片
  let img: HTMLImageElement;
  try {
    img = await loadImageFromIpc(src);
  } catch (err) {
    console.error('[AI] Image load failed:', rawPath, err);
    return { status: 'unrecognized' };
  }

  // 2. 人臉偵測
  try {
    const faceapi = await import('@vladmandic/face-api');
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
    const detections = await faceapi.detectAllFaces(img, options);
    return computeCrop(detections, img.naturalWidth, img.naturalHeight);
  } catch (err) {
    console.error('[AI] Detection failed:', rawPath, err);
    return { status: 'unrecognized' };
  }
}
