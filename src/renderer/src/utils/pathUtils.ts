export function formatHoverPath(fullPath: string, rootDirs: string[]): string {
  if (!fullPath) return '';
  
  // 統一斜線方向處理
  const normalizedPath = fullPath.replace(/\\/g, '/');
  
  let relativePath = normalizedPath;
  let matchedRoot = '';

  // 尋找匹配的根目錄
  for (const root of rootDirs) {
    const normalizedRoot = root.replace(/\\/g, '/');
    if (normalizedPath.startsWith(normalizedRoot)) {
      matchedRoot = normalizedRoot;
      relativePath = normalizedPath.substring(normalizedRoot.length);
      break;
    }
  }

  // 去除開頭的斜線
  if (relativePath.startsWith('/')) {
    relativePath = relativePath.substring(1);
  }

  // 將路徑分割
  const parts = relativePath.split('/');
  
  const abbrParts = parts.map((part, index) => {
    let processPart = part;
    
    // 如果是最後一個部分 (檔名)，過濾掉 _fake
    if (index === parts.length - 1) {
      processPart = processPart.replace(/_fake/g, '');
    }

    if (processPart.length > 13) {
      return processPart.substring(0, 5) + '...' + processPart.substring(processPart.length - 5);
    }
    return processPart;
  });

  return abbrParts.join(' / ');
}
