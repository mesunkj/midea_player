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
  if (modelError) {
    // 允許重試：重置錯誤狀態
    modelError = false;
  }

  if (modelLoading) {
    return new Promise((resolve, reject) => {
      modelReadyCallbacks.push(resolve);
      modelErrorCallbacks.push(reject);
    });
  }

  modelLoading = true;
  try {
    console.log('[AI] Loading BlazeFace model...');

    // 釋放控制權給 UI thread，避免 Android WebView 判定無回應（ANR）
    await new Promise<void>(r => setTimeout(r, 50));

    const model = faceDetection.SupportedModels.MediaPipeFaceDetector;
    detector = await faceDetection.createDetector(model, {
      runtime: 'tfjs',
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
  // ── 調整參數說明 ──────────────────────────────────────────────────────────
  // HEAD_TOP_MARGIN:    臉頂距圖頂 < 5% 時不縮放（幾乎貼頂）
  // SIDE_MARGIN:        臉左右距邊 < 5% 時不縮放
  // HEAD_PADDING_RATIO: 臉框上方額外留白比例（0.5 = 臉高的一半）
  // BODY_WIDTH_RATIO:   預估身體寬度 = 臉寬 × N，越小裁切越緊
  const HEAD_TOP_MARGIN    = 0.05;
  const SIDE_MARGIN        = 0.05;
  const HEAD_PADDING_RATIO = 0.5;   // 從 0.25 增加到 0.5，讓頭頂有足夠留白
  const BODY_WIDTH_RATIO   = 2.2;   // 從 2.6 縮小到 2.2，避免畫面過寬臉被推偏

  if (!detections || detections.length === 0) {
    return { status: 'unrecognized' };
  }

  // maxFaces 設為 1，直接取第一筆
  const best = detections[0];

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

  // ── 計算裁切區域 ─────────────────────────────────────────────────────────
  const estimatedBodyW = faceW * BODY_WIDTH_RATIO;
  const cropPxLeft  = Math.max(0, faceCenterX - estimatedBodyW / 2);
  const cropPxRight = Math.min(imgW, faceCenterX + estimatedBodyW / 2);
  const cropPxW     = cropPxRight - cropPxLeft;

  // 頭頂留白：臉框頂部再往上 HEAD_PADDING_RATIO 倍臉高
  let cropPxTop = Math.max(0, faceTop - faceH * HEAD_PADDING_RATIO);

  // 裁切高度保持圖片原始長寬比（避免高度壓縮或拉伸）
  const aspectRatio = imgH / imgW;
  const cropPxH     = cropPxW * aspectRatio;

  // 若裁切區超出底部，向上移動使其完全在圖片內
  if (cropPxTop + cropPxH > imgH) {
    cropPxTop = Math.max(0, imgH - cropPxH);
  }

  // ── 轉換為 0~1 比例值 ────────────────────────────────────────────────────
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
