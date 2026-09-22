/**
 * GridCell.tsx — Android 版本
 *
 * 單一圖片輪播格，支援 AI 人臉裁切與觸控控制。
 * Android 差異：
 *   - 圖片直接以 <img> 標籤顯示（backgroundImage 改用 img 元素，避免 content:// CORS）
 *   - hover 效果改為長按（onTouchStart + setTimeout）顯示控制列
 *   - 儲存透過 platform.ts saveImageToDevice
 *   - AI 裁切：使用 CSS transform/clip 模擬 backgroundPosition 效果
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { formatHoverPath } from '../utils/pathUtils';
import { useAiCrop, AiCropResult } from '../hooks/useAiCrop';
import { saveImageToDevice } from '../platform';

interface Props {
  images:       string[];   // content:// URI 或 data: URL
  directories:  string[];
  initialIndex: number;
  intervalTime: number;
  step:         number;
  transition:   string;
  getViewport?: (imagePath: string) => AiCropResult | undefined;
}

const TRANSITIONS = ['fade', 'slide', 'zoom', 'blur', 'wipe'];

// ── AI 裁切樣式（CSS transform 實作） ─────────────────────────────────────────

function getImageStyle(aiCrop: AiCropResult | null): React.CSSProperties {
  if (!aiCrop || aiCrop.status !== 'zoomed' || aiCrop.cropW === undefined) {
    return { width: '100%', height: '100%', objectFit: 'cover' };
  }

  const { cropX = 0, cropY = 0, cropW, cropH = cropW } = aiCrop;
  // 縮放比例（讓裁切區填滿容器）
  const scale    = 1 / cropW;
  // 裁切中心的偏移（translate 移至中心對齊）
  const originX  = (cropX + cropW / 2) * 100;
  const originY  = (cropY + cropH / 2) * 100;

  return {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transformOrigin: `${originX}% ${originY}%`,
    transform: `scale(${scale.toFixed(3)})`,
    transition: 'transform 1.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
  };
}

// ── GridCell 組件 ─────────────────────────────────────────────────────────────

const GridCell: React.FC<Props> = ({
  images, directories, initialIndex, intervalTime, step, transition, getViewport
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPlaying,    setIsPlaying]    = useState(true);
  const [showControls, setShowControls] = useState(false); // 長按觸發

  // 雙層交叉淡化
  const [layer, setLayer] = useState(0);
  const [imgA,  setImgA]  = useState(images[initialIndex % images.length]);
  const [imgB,  setImgB]  = useState('');
  const [currentTrans, setCurrentTrans] = useState(
    transition === 'random' ? 'fade' : transition
  );

  // 長按計時器
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI 裁切
  const dbCropA = getViewport ? getViewport(imgA) : undefined;
  const dbCropB = getViewport ? getViewport(imgB) : undefined;
  const liveAiCropA = useAiCrop(dbCropA ? '' : imgA);
  const liveAiCropB = useAiCrop(dbCropB ? '' : imgB);
  const aiCropA: AiCropResult = dbCropA ?? liveAiCropA;
  const aiCropB: AiCropResult = dbCropB ?? liveAiCropB;
  const activeCrop = layer === 0 ? aiCropA : aiCropB;

  // ── 自動播放計時器 ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || images.length === 0) return;
    const timer = setInterval(() => {
      triggerNext((currentIndex + step) % images.length);
    }, intervalTime * 1000);
    return () => clearInterval(timer);
  }, [isPlaying, images.length, intervalTime, step, currentIndex]);

  // ── 圖片切換 ────────────────────────────────────────────────────────────────
  const triggerNext = useCallback((newIndex: number) => {
    setCurrentIndex(newIndex);
    const nextSrc = images[newIndex];

    if (transition === 'random') {
      setCurrentTrans(TRANSITIONS[Math.floor(Math.random() * TRANSITIONS.length)]);
    } else {
      setCurrentTrans(transition);
    }

    if (layer === 0) {
      setImgB(nextSrc);
      setLayer(1);
    } else {
      setImgA(nextSrc);
      setLayer(0);
    }
  }, [images, layer, transition]);

  const handlePrev = () => {
    triggerNext((currentIndex - step + Math.ceil(images.length / step) * step) % images.length);
  };
  const handleNext = () => {
    triggerNext((currentIndex + step) % images.length);
  };

  const handleSave = async () => {
    const imgSrc = images[currentIndex];
    if (!imgSrc) return;
    const res = await saveImageToDevice(imgSrc);
    if (res.success) {
      alert('圖片已儲存！');
    } else if (res.reason) {
      alert('儲存失敗: ' + res.reason);
    }
  };

  // ── 長按觸發控制列 ──────────────────────────────────────────────────────────
  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      setShowControls(true);
      // 3 秒後自動隱藏控制列
      controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
    }, 500);
  };
  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  if (images.length === 0) return null;

  const currentPath = images[currentIndex];

  // ── 圖層樣式（淡化動畫）────────────────────────────────────────────────────
  const getLayerStyle = (isActive: boolean): React.CSSProperties => {
    let style: React.CSSProperties = {
      position: 'absolute',
      top: 0, left: 0,
      width: '100%', height: '100%',
      overflow: 'hidden',
      transition: 'opacity 1.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
      zIndex: isActive ? 2 : 1,
      pointerEvents: isActive ? 'auto' : 'none',
    };

    if (currentTrans === 'fade') {
      style.opacity = isActive ? 1 : 0;
    } else if (currentTrans === 'slide') {
      style.opacity   = isActive ? 1 : 0;
      style.transform = isActive ? 'translateX(0)' : 'translateX(-5%)';
    } else if (currentTrans === 'zoom') {
      style.opacity   = isActive ? 1 : 0;
      style.transform = isActive ? 'scale(1)' : 'scale(1.05)';
    } else if (currentTrans === 'blur') {
      style.opacity = isActive ? 1 : 0;
      style.filter  = isActive ? 'blur(0px)' : 'blur(15px)';
    } else if (currentTrans === 'wipe') {
      style.clipPath = isActive ? 'circle(150% at center)' : 'circle(0% at center)';
      style.opacity  = isActive ? 1 : 0.5;
    }
    return style;
  };

  // ── AI 指示燈 ────────────────────────────────────────────────────────────────
  const renderAiIndicator = () => {
    if (activeCrop.status === 'pending') return null;
    let color = '';
    if (activeCrop.status === 'zoomed') color = '#00ff00';
    else if (activeCrop.status === 'unchanged') color = '#ffcc00';
    else if (activeCrop.status === 'unrecognized') color = '#ff0000';
    else return null;

    return (
      <div style={{
        position: 'absolute', top: '8px', right: '8px',
        width: '10px', height: '10px',
        backgroundColor: color,
        boxShadow: `0 0 6px ${color}`,
        zIndex: 10, borderRadius: '2px',
      }} />
    );
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'relative',
        backgroundColor: '#000',
        borderRadius: '6px',
        width: '100%', height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Layer A */}
      <div style={getLayerStyle(layer === 0)}>
        {imgA && (
          <img
            src={imgA}
            alt=""
            style={getImageStyle(aiCropA.status !== 'pending' ? aiCropA : null)}
          />
        )}
      </div>
      {/* Layer B */}
      <div style={getLayerStyle(layer === 1)}>
        {imgB && (
          <img
            src={imgB}
            alt=""
            style={getImageStyle(aiCropB.status !== 'pending' ? aiCropB : null)}
          />
        )}
      </div>

      {/* AI 指示燈 */}
      {renderAiIndicator()}

      {/* 長按後顯示路徑 + 控制列 */}
      {showControls && (
        <>
          {/* 路徑顯示 */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff',
            padding: '8px 10px', fontSize: '0.8rem',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            zIndex: 10,
          }}>
            {formatHoverPath(currentPath, directories)}
          </div>

          {/* 控制按鈕列 */}
          <div style={{
            position: 'absolute', bottom: '10px', left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex', gap: '8px',
            backgroundColor: 'rgba(0,0,0,0.75)',
            padding: '8px 14px', borderRadius: '24px', zIndex: 10,
          }}>
            <button
              onTouchEnd={e => { e.stopPropagation(); handlePrev(); }}
              onClick={e => { e.stopPropagation(); handlePrev(); }}
              style={btnStyle}
            >⏮</button>
            <button
              onTouchEnd={e => { e.stopPropagation(); setIsPlaying(!isPlaying); }}
              onClick={e => { e.stopPropagation(); setIsPlaying(!isPlaying); }}
              style={btnStyle}
            >{isPlaying ? '⏸' : '▶'}</button>
            <button
              onTouchEnd={e => { e.stopPropagation(); handleNext(); }}
              onClick={e => { e.stopPropagation(); handleNext(); }}
              style={btnStyle}
            >⏭</button>
            <div style={{ borderLeft: '1px solid #555', margin: '0 4px' }} />
            <button
              onTouchEnd={e => { e.stopPropagation(); handleSave(); }}
              onClick={e => { e.stopPropagation(); handleSave(); }}
              style={btnStyle}
            >💾</button>
          </div>
        </>
      )}
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', color: 'white',
  fontSize: '1.3rem', cursor: 'pointer',
  minWidth: '44px', minHeight: '44px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

export default GridCell;
