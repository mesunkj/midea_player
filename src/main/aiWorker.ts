/**
 * aiWorker.ts
 *
 * AI 分析現已移至渲染器端 (src/renderer/src/hooks/useAiCrop.ts)，
 * 使用 TF.js + WebGL 在瀏覽器中執行人臉偵測，速度更快且不需要 native 套件。
 *
 * 此檔案保留路徑正規化工具，供其他主程序功能使用。
 * IPC handler 'ai:get-crop-data' 保留但回傳 null（渲染器不再使用）。
 */

/** 統一路徑格式：將 Windows 反斜線轉為正斜線 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Legacy: 不再使用，渲染器端 useAiCrop hook 已取代此機制 */
export function addToAiQueue(_imagePaths: string[]): void {
  // no-op
}

/** Legacy: 不再使用 */
export function getCropData(_imagePath: string): null {
  return null;
}
