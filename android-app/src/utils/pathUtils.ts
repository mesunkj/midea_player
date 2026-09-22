/**
 * pathUtils.ts — 路徑格式化工具
 * Android 版本：content:// URI 簡化顯示
 */

export function formatHoverPath(fullPath: string, rootDirs: string[]): string {
  if (!fullPath) return '';

  // content:// URI 特殊處理
  if (fullPath.startsWith('content://')) {
    const parts = fullPath.split('/');
    const filename = parts[parts.length - 1];
    // 去掉 _fake 等後綴
    const cleanName = filename.replace(/_fake/g, '').replace(/%20/g, ' ');
    return `📱 ${cleanName}`;
  }

  // 一般路徑處理
  const normalizedPath = fullPath.replace(/\\/g, '/');
  let relativePath = normalizedPath;

  for (const root of rootDirs) {
    const normalizedRoot = root.replace(/\\/g, '/');
    if (normalizedPath.startsWith(normalizedRoot)) {
      relativePath = normalizedPath.substring(normalizedRoot.length);
      break;
    }
  }

  if (relativePath.startsWith('/')) {
    relativePath = relativePath.substring(1);
  }

  const parts = relativePath.split('/');
  const abbrParts = parts.map((part, index) => {
    let processPart = part;
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
