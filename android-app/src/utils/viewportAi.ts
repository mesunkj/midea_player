/**
 * viewportAi.ts — Android 版本
 *
 * AI 人臉偵測邏輯，使用 @tensorflow-models/face-detection（BlazeFace）。
 * 與 Electron 版本的主要差異：
 *   - 不依賴 @vladmandic/face-api（改用 TF.js 官方套件）
 *   - 圖片載入直接用 <img> + base64（不需要 IPC imageToBase64）
 *   - 裁切計算邏輯完全相同
 */

import * as faceDetection from '@tensorflow-models/face-detection';
import '@tensorflow/tfjs';

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

let detector: faceDetection.FaceDetector | null = null;
let modelReady   = false;
let modelLoading = false;
let modelError   = false;
const modelReadyCallbacks: Array<() => void>       = [];
const modelErrorCallbacks: Array<(e: any) => void> = [];

/**
 * 確保 BlazeFace 模型已載入（全域只執行一次）
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
    console.log('[AI] Loading BlazeFace model...');
    const model = faceDetection.SupportedModels.MediaPipeFaceDetector;
    detector = await faceDetection.createDetector(model, {
      runtime: 'tfjs',
      refineLandmarks: false,
      maxFaces: 1,
    });

    modelReady   = true;
    modelLoading = false;
    console.log('[AI] ✅ BlazeFace model ready.');
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
 * 從 base64 data URL 或 content:// URI 載入 HTMLImageElement
 */
export function loadImageFromSrc(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src.substring(0, 80)}`));
    img.src = src;
  });
}

// ─── 裁切規則計算 ─────────────────────────────────────────────────────────────

export function computeCrop(
  detections: faceDetection.Face[],
  imgW: number,
  imgH: number
): AiCropResult {
  const HEAD_TOP_MARGIN    = 0.05;
  const SIDE_MARGIN        = 0.05;
  const HEAD_PADDING_RATIO = 0.25;
  const BODY_WIDTH_RATIO   = 2.6;

  if (!detections || detections.length === 0) {
    return { status: 'unrecognized' };
  }

  // 取信心度最高的臉
  const best = detections.reduce((a, b) =>
    (a.score ?? 0) >= (b.score ?? 0) ? a : b
  );

  const box = best.box;
  if (!box) return { status: 'unrecognized' };

  const faceLeft    = box.xMin;
  const faceTop     = box.yMin;
  const faceW       = box.width;
  const faceH       = box.height;
  const faceRight   = faceLeft + faceW;
  const faceCenterX = faceLeft + faceW / 2;

  const headTopRatio    = faceTop / imgH;
  const leftSpaceRatio  = faceLeft / imgW;
  const rightSpaceRatio = (imgW - faceRight) / imgW;

  const shouldZoom =
    headTopRatio    > HEAD_TOP_MARGIN &&
    leftSpaceRatio  > SIDE_MARGIN     &&
    rightSpaceRatio > SIDE_MARGIN;

  if (!shouldZoom) return { status: 'unchanged' };

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

  return { status: 'zoomed', cropX, cropY, cropW, cropH };
}

// ─── 人臉偵測 ─────────────────────────────────────────────────────────────────

/**
 * 對單張圖片（data URL 或 URI）執行人臉偵測並計算 Viewport 裁切結果
 */
export async function detectViewport(imageSrc: string): Promise<AiCropResult> {
  if (!detector) return { status: 'unrecognized' };

  try {
    const img = await loadImageFromSrc(imageSrc);
    const detections = await detector.estimateFaces(img, { flipHorizontal: false });
    return computeCrop(detections, img.naturalWidth, img.naturalHeight);
  } catch (err) {
    console.error('[AI] Detection failed:', err);
    return { status: 'unrecognized' };
  }
}
