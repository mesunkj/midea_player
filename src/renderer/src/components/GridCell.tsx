import React, { useState, useEffect } from 'react';

interface Props {
  images: string[];
  initialIndex: number;
  intervalTime: number;
  step: number;
  transition: string;
}

const TRANSITIONS = ['fade', 'slide', 'zoom', 'blur', 'wipe'];

const GridCell: React.FC<Props> = ({ images, initialIndex, intervalTime, step, transition }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  
  // 雙層渲染用於動畫過渡
  const [layer, setLayer] = useState(0); // 0 = A, 1 = B
  const [imgA, setImgA] = useState(images[initialIndex % images.length]);
  const [imgB, setImgB] = useState('');
  const [currentTrans, setCurrentTrans] = useState(transition === 'random' ? 'fade' : transition);

  useEffect(() => {
    if (!isPlaying || images.length === 0) return;
    const timer = setInterval(() => {
      triggerNext((currentIndex + step) % images.length);
    }, intervalTime * 1000);
    return () => clearInterval(timer);
  }, [isPlaying, images.length, intervalTime, step, currentIndex]);

  const triggerNext = (newIndex: number) => {
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

      {isHovered && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff',
          padding: '8px 10px', fontSize: '0.85rem', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis', zIndex: 10
        }}>
          {currentPath}
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
