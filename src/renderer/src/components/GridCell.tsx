import React, { useState, useEffect } from 'react';
import { formatHoverPath } from '../utils/pathUtils';

interface Props {
  images: string[];
  directories: string[];
  initialIndex: number;
  intervalTime: number;
  step: number;
  transition: string;
}

const TRANSITIONS = ['fade', 'slide', 'zoom', 'blur', 'wipe'];

const GridCell: React.FC<Props> = ({ images, directories, initialIndex, intervalTime, step, transition }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  
  // 雙層渲染用於動畫過渡
  const [layer, setLayer] = useState(0); // 0 = A, 1 = B
  const [imgA, setImgA] = useState(images[initialIndex % images.length]);
  const [imgB, setImgB] = useState('');
  const [currentTrans, setCurrentTrans] = useState(transition === 'random' ? 'fade' : transition);
  const [aiCropA, setAiCropA] = useState<any>(null);
  const [aiCropB, setAiCropB] = useState<any>(null);

  // ===== AI Crop Data 統一輪詢機制 =====
  // 追蹤「目前正在顯示的圖片路徑」所對應的 AI 結果
  // 每次 active 圖片變更時，重新去詢問，直到得到結果為止
  const activeSrc = layer === 0 ? imgA : imgB;
  const setActiveCrop = layer === 0 ? setAiCropA : setAiCropB;
  const activeCrop = layer === 0 ? aiCropA : aiCropB;

  useEffect(() => {
    // activeSrc 變了，先把對應的 crop 清空（以免顯示舊圖的結果）
    if (layer === 0) setAiCropA(null);
    else setAiCropB(null);

    if (!activeSrc || !(window.electronAPI as any)?.getAiCropData) return;

    let cancelled = false;

    const fetchAndPoll = async () => {
      while (!cancelled) {
        const crop = await (window.electronAPI as any).getAiCropData(activeSrc);
        if (cancelled) break;
        if (crop) {
          // 得到結果（無論是 zoomed / unchanged / unrecognized 都是非 null）
          if (layer === 0) setAiCropA(crop);
          else setAiCropB(crop);
          break;
        }
        // 還沒算完，等 300ms 再問
        await new Promise(r => setTimeout(r, 300));
      }
    };

    fetchAndPoll();
    return () => { cancelled = true; };
  }, [activeSrc, layer]); // 只依賴目前顯示的圖片路徑與 layer

  useEffect(() => {
    if (!isPlaying || images.length === 0) return;
    const timer = setInterval(() => {
      triggerNext((currentIndex + step) % images.length);
    }, intervalTime * 1000);
    return () => clearInterval(timer);
  }, [isPlaying, images.length, intervalTime, step, currentIndex]);

  const triggerNext = async (newIndex: number) => {
    setCurrentIndex(newIndex);
    const nextSrc = images[newIndex];
    if (transition === 'random') {
      setCurrentTrans(TRANSITIONS[Math.floor(Math.random() * TRANSITIONS.length)]);
    } else {
      setCurrentTrans(transition);
    }

    let crop = null;
    if (window.electronAPI && (window.electronAPI as any).getAiCropData) {
      crop = await (window.electronAPI as any).getAiCropData(nextSrc);
    }

    if (layer === 0) {
      setImgB(nextSrc);
      setAiCropB(crop);
      setLayer(1);
    } else {
      setImgA(nextSrc);
      setAiCropA(crop);
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

  const getStyleForLayer = (isActive: boolean, src: string): React.CSSProperties => {
    const safeSrc = src ? src.replace(/\\/g, '/') : '';
    const fileUrl = `local-resource://${safeSrc}`;
    
    let baseStyle: React.CSSProperties = {
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
      backgroundImage: src ? `url("${fileUrl}")` : 'none',
      backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
      transition: 'all 1.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
      zIndex: isActive ? 2 : 1,
      pointerEvents: isActive ? 'auto' : 'none',
    };

    const activeAiCrop = layer === 0 ? (src === imgA ? aiCropA : aiCropB) : (src === imgB ? aiCropB : aiCropA);

    if (currentTrans === 'fade') {
      baseStyle.opacity = isActive ? 1 : 0;
    } else if (currentTrans === 'slide') {
      baseStyle.opacity = isActive ? 1 : 0;
      baseStyle.transform = isActive ? 'translateX(0)' : 'translateX(-5%)';
    } else if (currentTrans === 'zoom') {
      baseStyle.opacity = isActive ? 1 : 0;
      baseStyle.transform = isActive ? 'scale(1)' : 'scale(1.05)';
    } else if (currentTrans === 'blur') {
      baseStyle.opacity = isActive ? 1 : 0;
      baseStyle.filter = isActive ? 'blur(0px)' : 'blur(15px)';
    } else if (currentTrans === 'wipe') {
      // 圓形展開
      baseStyle.clipPath = isActive ? 'circle(150% at center)' : 'circle(0% at center)';
      baseStyle.opacity = isActive ? 1 : 0.5; 
    }

    // 套用 AI Zoom
    if (activeAiCrop && activeAiCrop.status === 'zoomed') {
      baseStyle.transform = (baseStyle.transform && baseStyle.transform !== 'none') 
        ? `${baseStyle.transform} scale(${activeAiCrop.scale})` 
        : `scale(${activeAiCrop.scale})`;
      baseStyle.transformOrigin = `${activeAiCrop.originX} ${activeAiCrop.originY}`;
    }

    return baseStyle;
  };

  return (
    <div 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        backgroundColor: '#000',
        borderRadius: '8px',
        width: '100%',
        height: '100%',
        overflow: 'hidden'
      }}
    >
      <div style={getStyleForLayer(layer === 0, imgA)} />
      <div style={getStyleForLayer(layer === 1, imgB)} />

      {/* AI Indicator */}
      {(() => {
        const currentAiCrop = layer === 0 ? aiCropA : aiCropB;
        if (!currentAiCrop || !currentAiCrop.status) return null;
        
        let color = '';
        let title = '';
        if (currentAiCrop.status === 'zoomed') {
          color = '#00ff00';
          title = 'AI 判定過小，已拉近 (綠色)';
        } else if (currentAiCrop.status === 'unchanged') {
          color = '#ffcc00';
          title = 'AI 判定良好，原封不動 (黃色)';
        } else if (currentAiCrop.status === 'unrecognized') {
          color = '#ff0000';
          title = 'AI 無法辨識，維持原圖 (紅色)';
        } else {
          return null;
        }

        return (
          <div style={{
            position: 'absolute', top: '10px', right: '10px',
            width: '12px', height: '12px', backgroundColor: color,
            boxShadow: `0 0 5px ${color}`, zIndex: 10, borderRadius: '2px'
          }} title={title} />
        );
      })()}

      {isHovered && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff',
          padding: '8px 10px', fontSize: '0.85rem', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis', zIndex: 10
        }}>
          {formatHoverPath(currentPath, directories)}
        </div>
      )}

      {isHovered && (
        <div style={{
          position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: '10px', backgroundColor: 'rgba(0,0,0,0.7)',
          padding: '8px 15px', borderRadius: '20px', zIndex: 10
        }}>
          <button onClick={handlePrev} style={btnStyle} title="上一張">⏮</button>
          <button onClick={togglePlay} style={btnStyle} title={isPlaying ? '暫停' : '播放'}>{isPlaying ? '⏸' : '▶'}</button>
          <button onClick={handleNext} style={btnStyle} title="下一張">⏭</button>
          <div style={{ borderLeft: '1px solid #555', margin: '0 5px' }} />
          <button onClick={handleSave} style={btnStyle} title="儲存圖片">💾</button>
        </div>
      )}
    </div>
  );
};

const btnStyle = {
  background: 'transparent', border: 'none', color: 'white',
  fontSize: '1.2rem', cursor: 'pointer'
};

export default GridCell;
