// 這是未來放置 TensorFlow.js AI 運算的支線任務
// 目前先以 Mock 方式模擬背景運算佇列，驗證架構與前端 UI
const aiResultCache: Record<string, any> = {};
const queue: string[] = [];
let isProcessing = false;

async function processQueue() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;

  while (queue.length > 0) {
    const imagePath = queue.shift();
    if (!imagePath) continue;
    
    // 如果已經計算過，跳過
    if (aiResultCache[imagePath] !== undefined) continue;

    // 模擬 AI 分析耗時 (約 500ms)
    await new Promise(resolve => setTimeout(resolve, 500));

    // 模擬：如果是檔名包含 _fake，我們模擬 AI 判定人物過小，給出推近裁切參數 (綠色)
    if (imagePath.includes('_fake')) {
      aiResultCache[imagePath] = {
        status: 'zoomed',
        scale: 1.5,
        originX: '50%',
        originY: '30%' // 推向臉部/上半身
      };
    } 
    // 模擬：如果檔名包含 _error，代表辨識失敗 (紅色)
    else if (imagePath.includes('_error')) {
      aiResultCache[imagePath] = { status: 'unrecognized' };
    } 
    // 模擬：其他正常檔案，代表辨識成功但不需要裁切 (黃色)
    else {
      aiResultCache[imagePath] = { status: 'unchanged' };
    }
  }

  isProcessing = false;
}

export function addToAiQueue(imagePaths: string[]) {
  queue.push(...imagePaths);
  processQueue(); // 背景慢慢消化佇列
}

export function getCropData(imagePath: string) {
  // 如果還在算，或是算出來不需要裁切，都會回傳 null
  return aiResultCache[imagePath] || null;
}
