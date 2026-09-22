/**
 * PhotoWall.tsx — Android 版本
 *
 * 超高密度照片牆（100 格）。
 * Android 差異：
 *   - 圖片 src 直接使用 content:// URI（Android WebView 支援）或 data: URL
 *   - 用 onTouchStart/onTouchEnd 取代 onMouseEnter/onMouseLeave
 *   - 點擊開啟 Lightbox 不變
 */

import React, { useState, useEffect } from 'react';
import Lightbox from './Lightbox';

interface Props {
  images: string[];   // content:// URI 陣列
  isIdle?: boolean;
}

const PhotoWall: React.FC<Props> = ({ images, isIdle }) => {
  const MAX_CELLS = 100;

  const [wallIndices, setWallIndices] = useState<number[]>([]);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [tappedIndex, setTappedIndex] = useState<number | null>(null);

  // 初始化照片牆
  useEffect(() => {
    if (images.length === 0) return;
    const initial = Array.from({ length: MAX_CELLS }).map(
      () => Math.floor(Math.random() * images.length)
    );
    setWallIndices(initial);
  }, [images]);

  // 隨機翻轉特效 (Random Pop)
  useEffect(() => {
    if (images.length === 0 || activeImage) return;

    const intervalId = setInterval(() => {
      setWallIndices(prev => {
        const next = [...prev];
        for (let i = 0; i < 3; i++) {
          const cellToUpdate = Math.floor(Math.random() * MAX_CELLS);
          if (cellToUpdate !== tappedIndex) {
            next[cellToUpdate] = Math.floor(Math.random() * images.length);
          }
        }
        return next;
      });
    }, 2000);

    return () => clearInterval(intervalId);
  }, [images.length, activeImage, tappedIndex]);

  if (images.length === 0) {
    return (
      <div style={{
        color: '#94a3b8', height: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#0f1117', fontSize: '1.2rem',
      }}>
        載入圖片中...
      </div>
    );
  }

  return (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(10, 1fr)',
        gridTemplateRows: 'repeat(10, 1fr)',
        width: '100vw',
        height: '100vh',
        gap: '1px',
        backgroundColor: '#111',
        overflow: 'hidden',
      }}>
        {wallIndices.map((imgIndex, cellIndex) => {
          const imgSrc = images[imgIndex];
          const isTapped = tappedIndex === cellIndex;

          return (
            <div
              key={`${cellIndex}-${imgIndex}`}
              onTouchStart={() => setTappedIndex(cellIndex)}
              onTouchEnd={() => {
                setTappedIndex(null);
                setActiveImage(imgSrc);
              }}
              onClick={() => setActiveImage(imgSrc)}
              style={{
                width: '100%',
                height: '100%',
                backgroundImage: `url("${imgSrc}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                cursor: 'pointer',
                transition: 'transform 0.2s ease',
                transform: isTapped ? 'scale(1.15)' : 'scale(1)',
                zIndex: isTapped ? 10 : 1,
                position: isTapped ? 'relative' : 'static',
              }}
            />
          );
        })}
      </div>

      {activeImage && (
        <Lightbox
          imagePath={activeImage}
          onClose={() => setActiveImage(null)}
        />
      )}
    </>
  );
};

export default PhotoWall;
