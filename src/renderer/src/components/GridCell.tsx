import React, { useState, useEffect } from 'react';
import { formatHoverPath } from '../utils/pathUtils';
import { useAiCrop, AiCropResult } from '../hooks/useAiCrop';

interface Props {
  images:       string[];
  directories:  string[];
  initialIndex: number;
  intervalTime: number;
  step:         number;
  transition:   string;
  /** 可選：預先掃描的 Viewport DB 查詢函式，有結果時跳過即時 AI */
  getViewport?: (imagePath: string) => AiCropResult | undefined;
}

const TRANSITIONS = ['fade', 'slide', 'zoom', 'blur', 'wipe'];

// ============================================================
// CSS 裁切計算
// ============================================================

/**
 * 根據 AI 裁切結果，計算背景圖片的 backgroundSize / backgroundPosition。
 *
 * 當 status === 'zoomed'，使用精準裁切：
 *   backgroundSize = `${100/cropW}%`  → 圖片放大使裁切寬度填滿容器
 *   backgroundPosition = `X% Y%`      → 利用 CSS 百分比機制偏移至裁切起點
 *
 * 公式推導：
 *   CSS backgroundPosition X% 定義：
 *     posX = X% × (containerW - bgDisplayW)
 *   我們希望 posX = -cropX × bgDisplayW，其中 bgDisplayW = containerW/cropW
 *   解出 X% = cropX / (1 - cropW) × 100
 */
function getBackgroundStyle(aiCrop: AiCropResult | null): React.CSSProperties {
  if (!aiCrop || aiCrop.status !== 'zoomed' || aiCrop.cropW === undefined) {
    return {
      backgroundSize:     'contain',
      backgroundPosition: 'center',
      backgroundRepeat:   'no-repeat',
    };
  }

  const { cropX = 0, cropY = 0, cropW, cropH = cropW } = aiCrop;

  // 防止除以零（cropW 或 cropH 極接近 1 時退化為 contain）
  const bgSizeW = cropW < 0.99 ? `${(100 / cropW).toFixed(2)}%` : '100%';
  const posX = cropW < 0.99
    ? `${((cropX / (1 - cropW)) * 100).toFixed(2)}%`
    : '50%';
  const posY = cropH < 0.99
    ? `${((cropY / (1 - cropH)) * 100).toFixed(2)}%`
    : '50%';

  return {
    backgroundSize:     bgSizeW,      // 高度由瀏覽器依自然比例自動計算
    backgroundPosition: `${posX} ${posY}`,
    backgroundRepeat:   'no-repeat',
  };
}

// ============================================================
// GridCell 組件
// ============================================================

const GridCell: React.FC<Props> = ({ images, directories, initialIndex, intervalTime, step, transition, getViewport }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying]       = useState(true);
  const [isHovered, setIsHovered]       = useState(false);

  // 雙層交叉淡化
  const [layer, setLayer]               = useState(0); // 0 = Layer A 在前，1 = Layer B 在前
  const [imgA, setImgA]                 = useState(images[initialIndex % images.length]);
  const [imgB, setImgB]                 = useState('');
  const [currentTrans, setCurrentTrans] = useState(transition === 'random' ? 'fade' : transition);

  // local-resource URL 轉換
  const toUrl = (src: string) => src ? `local-resource://${src.replace(/\\/g, '/')}` : '';

  // AI 裁切分析：優先讀取 DB，DB 無資料才啟用即時偵測
  const dbCropA = getViewport ? getViewport(imgA) : undefined;
  const dbCropB = getViewport ? getViewport(imgB) : undefined;

  // 僅在 DB 無資料時才用 hook 跑即時 AI（避免不必要的模型呼叫）
  const liveAiCropA = useAiCrop(dbCropA ? '' : toUrl(imgA));
  const liveAiCropB = useAiCrop(dbCropB ? '' : toUrl(imgB));

  const aiCropA: AiCropResult = dbCropA ?? liveAiCropA;
  const aiCropB: AiCropResult = dbCropB ?? liveAiCropB;

  // 當前 active layer 的 AI 結果
  const activeCrop = layer === 0 ? aiCropA : aiCropB;

  // ── 自動播放計時器 ────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || images.length === 0) return;
    const timer = setInterval(() => {
      triggerNext((currentIndex + step) % images.length);
    }, intervalTime * 1000);
    return () => clearInterval(timer);
  }, [isPlaying, images.length, intervalTime, step, currentIndex]);

  // ── 圖片切換 ─────────────────────────────────────────────
  const triggerNext = (newIndex: number) => {
    setCurrentIndex(newIndex);
    const nextSrc = images[newIndex];

    if (transition === 'random') {
      setCurrentTrans(TRANSITIONS[Math.floor(Math.random() * TRANSITIONS.length)]);
    } else {
      setCurrentTrans(transition);
    }

    // 只切換圖片路徑，AI 分析由 useAiCrop hook 自動觸發
    if (layer === 0) {
      setImgB(nextSrc);
      setLayer(1);
    } else {
      setImgA(nextSrc);
      setLayer(0);
    }
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerNext((currentIndex - step + Math.ceil(images.length / step) * step) % images.length);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerNext((currentIndex + step) % images.length);
  };

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPlaying(!isPlaying);
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const imgSrc = images[currentIndex];
    if (window.electronAPI && (window.electronAPI as any).saveImage && imgSrc) {
      const res = await (window.electronAPI as any).saveImage(imgSrc);
      if (res && res.success) {
        alert('圖片已成功儲存至: ' + res.filePath);
      } else if (res && res.reason !== 'canceled') {
        alert('儲存失敗: ' + res.reason);
      }
    }
  };

  if (images.length === 0) return null;

  const currentPath = images[currentIndex];

  // ── 圖層樣式（過渡動畫） ──────────────────────────────────
  const getLayerStyle = (isActive: boolean, src: string, aiCrop: AiCropResult): React.CSSProperties => {
    const fileUrl = toUrl(src);
    const bgCropStyle = getBackgroundStyle(aiCrop.status !== 'pending' ? aiCrop : null);

    let base: React.CSSProperties = {
      position:        'absolute',
      top: 0, left: 0,
      width:           '100%',
      height:          '100%',
      backgroundImage: src ? `url("${fileUrl}")` : 'none',
      ...bgCropStyle,
      transition:      'opacity 1.2s cubic-bezier(0.25, 0.8, 0.25, 1), background-position 1.2s ease, background-size 1.2s ease',
      zIndex:          isActive ? 2 : 1,
      pointerEvents:   isActive ? 'auto' : 'none',
    };

    // 過渡動畫效果
    if (currentTrans === 'fade') {
      base.opacity = isActive ? 1 : 0;
    } else if (currentTrans === 'slide') {
      base.opacity   = isActive ? 1 : 0;
      base.transform = isActive ? 'translateX(0)' : 'translateX(-5%)';
    } else if (currentTrans === 'zoom') {
      base.opacity   = isActive ? 1 : 0;
      base.transform = isActive ? 'scale(1)' : 'scale(1.05)';
    } else if (currentTrans === 'blur') {
      base.opacity = isActive ? 1 : 0;
      base.filter  = isActive ? 'blur(0px)' : 'blur(15px)';
    } else if (currentTrans === 'wipe') {
      base.clipPath = isActive ? 'circle(150% at center)' : 'circle(0% at center)';
      base.opacity  = isActive ? 1 : 0.5;
    }

    return base;
  };

  // ── AI 指示燈 ─────────────────────────────────────────────
  const renderAiIndicator = () => {
    if (activeCrop.status === 'pending') return null;

    let color = '';
    let title = '';
    if (activeCrop.status === 'zoomed') {
      color = '#00ff00';
      title = 'AI 判定人物過小，已 Zoom-in 拉近 (綠色)';
    } else if (activeCrop.status === 'unchanged') {
      color = '#ffcc00';
      title = 'AI 判定人物正常，維持原圖 (黃色)';
    } else if (activeCrop.status === 'unrecognized') {
      color = '#ff0000';
      const stage = (activeCrop as any)._failStage;
      const detail = stage ? ` [失敗點: ${stage}]` : '';
      title = `AI 辨識失敗，維持原圖 (紅色)${detail}`;
    } else {
      return null;
    }

    return (
      <div style={{
        position: 'absolute', top: '10px', right: '10px',
        width: '12px', height: '12px',
        backgroundColor: color,
        boxShadow: `0 0 6px ${color}, 0 0 12px ${color}44`,
        zIndex: 10, borderRadius: '2px',
        transition: 'background-color 0.5s ease',
      }} title={title} />
    );
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position:        'relative',
        backgroundColor: '#000',
        borderRadius:    '8px',
        width:           '100%',
        height:          '100%',
        overflow:        'hidden',
      }}
    >
      {/* Layer A */}
      <div style={getLayerStyle(layer === 0, imgA, aiCropA)} />
      {/* Layer B */}
      <div style={getLayerStyle(layer === 1, imgB, aiCropB)} />

      {/* AI 顏色指示燈 */}
      {renderAiIndicator()}

      {/* Hover：路徑顯示 */}
      {isHovered && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff',
          padding: '8px 10px', fontSize: '0.85rem',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          zIndex: 10,
        }}>
          {formatHoverPath(currentPath, directories)}
        </div>
      )}

      {/* Hover：控制按鈕 */}
      {isHovered && (
        <div style={{
          position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: '10px',
          backgroundColor: 'rgba(0,0,0,0.7)',
          padding: '8px 15px', borderRadius: '20px', zIndex: 10,
        }}>
          <button onClick={handlePrev}   style={btnStyle} title="上一張">⏮</button>
          <button onClick={togglePlay}   style={btnStyle} title={isPlaying ? '暫停' : '播放'}>{isPlaying ? '⏸' : '▶'}</button>
          <button onClick={handleNext}   style={btnStyle} title="下一張">⏭</button>
          <div style={{ borderLeft: '1px solid #555', margin: '0 5px' }} />
          <button onClick={handleSave}   style={btnStyle} title="儲存圖片">💾</button>
        </div>
      )}
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', color: 'white',
  fontSize: '1.2rem', cursor: 'pointer',
};

export default GridCell;
