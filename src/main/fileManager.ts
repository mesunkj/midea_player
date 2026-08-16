import { dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
// import sharp from 'sharp'; // 將在稍後安裝與啟用

// 處理目錄選擇
export async function selectDirectories() {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'multiSelections']
  });
  return result.filePaths;
}

// 掃描目錄並過濾支援的圖片
export function scanDirectories(dirPaths: string[], recursive: boolean = false): string[] {
  const supportedExts = ['.jpg', '.jpeg', '.png', '.webp'];
  let allImages: string[] = [];

  const scan = (currentDir: string) => {
    if (!fs.existsSync(currentDir)) return;
    
    const files = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(currentDir, file.name);
      if (file.isDirectory()) {
        if (recursive) {
          scan(fullPath);
        }
      } else {
        const ext = path.extname(file.name).toLowerCase();
        if (supportedExts.includes(ext)) {
          allImages.push(fullPath);
        }
      }
    }
  };

  for (const dir of dirPaths) {
    scan(dir);
  }

  return allImages;
}

// 縮圖引擎 (Thumbnail Engine) 
export async function generateThumbnail(imagePath: string, targetDir: string): Promise<string> {
  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const fileName = path.basename(imagePath);
    // 為了避免檔名衝突，可以加上時間戳記或 hash，這裡先簡化直接使用原檔名
    const thumbnailPath = path.join(targetDir, `thumb_${fileName}`);

    // 使用 sharp 進行處理：自動轉正並縮小尺寸
    await sharp(imagePath)
      .rotate() // 自動根據 EXIF 轉正
      .resize(256, 256, { fit: 'cover' }) // 縮小至 256x256 (或依據實際格數動態調整)
      .toFile(thumbnailPath);

    return thumbnailPath;
  } catch (error) {
    console.error('Thumbnail generation failed for', imagePath, error);
    return imagePath; // 如果縮圖失敗，Fallback 回傳原圖
  }
}
