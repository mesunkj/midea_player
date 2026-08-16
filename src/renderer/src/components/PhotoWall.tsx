import React, { useState, useEffect, useRef } from 'react';
import Lightbox from './Lightbox';

interface Props {
  images: string[];
  isIdle?: boolean;
}

const PhotoWall: React.FC<Props> = ({ images, isIdle }) => {
  // 假設畫面最多顯示 100 格
  const MAX_CELLS = 100;
  
  // 目前顯示在牆上的 100 張圖片索引 (對應 images 陣列)
  const [wallIndices, setWallIndices] = useState<number[]>([]);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // 初始化照片牆
  useEffect(() => {
    if (images.length === 0) return;
    const initial = Array.from({ length: MAX_CELLS }).map(() => Math.floor(Math.random() * images.length));
    setWallIndices(initial);
  }, [images]);

  // 隨機翻轉特效 (Random Pop)
  useEffect(() => {
    if (images.length === 0 || activeImage) return; // 如果 Lightbox 開啟則暫停翻轉

    const intervalId = setInterval(() => {
      setWallIndices(prev => {
        const next = [...prev];
        // 隨機挑選 3 個格子進行更新
        for (let i = 0; i < 3; i++) {
          const cellToUpdate = Math.floor(Math.random() * MAX_CELLS);
          // 如果該格子正被 Hover，就不要翻轉它
          if (cellToUpdate !== hoveredIndex) {
            next[cellToUpdate] = Math.floor(Math.random() * images.length);
          }
        }
        return next;
      });
    }, 2000); // 每 2 秒閃爍一次

    return () => clearInterval(intervalId);
  }, [images.length, activeImage, hoveredIndex]);

  if (images.length === 0) return <div style={{ color: 'white' }}>載入圖片中...</div>;

  return (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(10, 1fr)',
        gridTemplateRows: 'repeat(10, 1fr)',
        width: '100vw',
        height: '100vh',
        gap: '2px',
        backgroundColor: '#000',
        overflow: 'hidden'
      }}>
        {wallIndices.map((imgIndex, cellIndex) => {
          const imgSrc = images[imgIndex];
          // 將 Windows 的反斜線轉為正斜線，避免在 CSS url() 中被當作跳脫字元吃掉
          const safeImgSrc = imgSrc.replace(/\\/g, '/');
          const fileUrl = `local-resource://${safeImgSrc}`; 
          const isHovered = hoveredIndex === cellIndex;

          return (
            <div 
              key={`${cellIndex}-${imgIndex}`}
              onMouseEnter={() => setHoveredIndex(cellIndex)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={() => setActiveImage(imgSrc)}
              style={{
                width: '100%',
                height: '100%',
                backgroundImage: `url("${fileUrl}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                cursor: 'pointer',
                transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                zIndex: isHovered ? 10 : 1,
                boxShadow: isHovered ? '0 10px 20px rgba(0,0,0,0.8)' : 'none',
                position: isHovered ? 'relative' : 'static'
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
