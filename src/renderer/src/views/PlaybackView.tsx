import React, { useEffect, useState } from 'react';
import PhotoWall from '../components/PhotoWall';
import GridCell from '../components/GridCell';

interface Props {
  directories: string[];
  layout: string;
  intervalTime: number;
  order: string;
  recursive: boolean;
  transition: string;
  onExit: () => void;
}

const PlaybackView: React.FC<Props> = ({ directories, layout, intervalTime, order, recursive, transition, onExit }) => {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isIdle, setIsIdle] = useState(false);

  // Kiosk 模式：3 秒無動作自動隱藏
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const resetIdle = () => {
      setIsIdle(false);
      clearTimeout(timeout);
      timeout = setTimeout(() => setIsIdle(true), 3000);
    };
    window.addEventListener('mousemove', resetIdle);
    window.addEventListener('keydown', resetIdle);
    resetIdle();
    return () => {
      window.removeEventListener('mousemove', resetIdle);
      window.removeEventListener('keydown', resetIdle);
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchImages = async () => {
      if (window.electronAPI && (window.electronAPI as any).scanDirectories) {
        let fetched: string[] = await (window.electronAPI as any).scanDirectories(directories, recursive);
        if (order === 'shuffle') {
          // 隨機打散演算法 (Fisher-Yates)
          for (let i = fetched.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [fetched[i], fetched[j]] = [fetched[j], fetched[i]];
          }
        }
        if (isMounted) {
          setImages(fetched);
          setLoading(false);
        }
      }
    };
    fetchImages();
    return () => { isMounted = false; };
  }, [directories, order, recursive]);

  if (loading) {
    return (
      <div style={{ backgroundColor: '#111', color: '#fff', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <h1>讀取中...</h1>
      </div>
    );
  }

  // 共用快照功能
  const handleSnapshot = async () => {
    if (window.electronAPI && (window.electronAPI as any).snapshot) {
      const res = await (window.electronAPI as any).snapshot();
      if (res && res.success) {
        alert('快照已成功儲存至: ' + res.filePath);
      } else if (res && res.reason !== 'canceled') {
        alert('快照儲存失敗: ' + res.reason);
      }
    }
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`全螢幕切換失敗: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  if (layout === '10x10') {
    return (
      <div style={{ position: 'relative', cursor: isIdle ? 'none' : 'default' }}>
        <PhotoWall images={images} isIdle={isIdle} />
        <div style={{ 
          position: 'absolute', bottom: 20, right: 20, background: 'rgba(0,0,0,0.7)', 
          padding: '10px', borderRadius: '8px', zIndex: 100,
          opacity: isIdle ? 0 : 1, transition: 'opacity 0.5s ease', pointerEvents: isIdle ? 'none' : 'auto',
          display: 'flex', gap: '10px'
        }}>
           <button onClick={toggleFullScreen} style={{ padding: '8px 16px', cursor: 'pointer', backgroundColor: '#555', color: '#fff', border: 'none', borderRadius: '4px' }}>⛶ 全螢幕</button>
           <button onClick={handleSnapshot} style={{ padding: '8px 16px', cursor: 'pointer', backgroundColor: '#333', color: '#fff', border: 'none', borderRadius: '4px' }}>📷 匯出快照</button>
           <button onClick={onExit} style={{ padding: '8px 16px', cursor: 'pointer', backgroundColor: '#800', color: '#fff', border: 'none', borderRadius: '4px' }}>❌ 退出照片牆</button>
        </div>
      </div>
    );
  }

  let cols = 1;
  let pageSize = 1;
  const isAsymmetric1Plus3 = layout === '1+3';
  const isAsymmetric1Plus4 = layout === '1+4';
  const isCenterFocus = layout === 'center-focus';
  const is1x5Center = layout === '1x5';
  const is1x4 = layout === '1x4';

  if (isAsymmetric1Plus3) {
    pageSize = 4;
  } else if (isAsymmetric1Plus4) {
    pageSize = 5;
  } else if (isCenterFocus) {
    cols = 4;
    pageSize = 13;
  } else if (is1x5Center) {
    pageSize = 5;
  } else if (is1x4) {
    cols = 4;
    pageSize = 4;
  } else {
    if (layout === '2x2') cols = 2;
    if (layout === '4x4') cols = 4;
    if (layout === 'random') cols = Math.min(4, Math.ceil(Math.sqrt(images.length)));
    pageSize = cols * cols;
  }

  const getGridTemplateColumns = () => {
    if (isAsymmetric1Plus3) return '2fr 1fr';
    if (isAsymmetric1Plus4) return 'repeat(4, 1fr)';
    if (is1x5Center) return '1fr 1fr 2.5fr 1fr 1fr';
    if (is1x4) return 'repeat(4, 1fr)';
    return `repeat(${cols}, 1fr)`;
  };

  const getGridTemplateRows = () => {
    if (isAsymmetric1Plus3) return 'repeat(3, 1fr)';
    if (isAsymmetric1Plus4) return 'repeat(2, 1fr)';
    if (is1x5Center || is1x4) return '1fr';
    return `repeat(${cols}, 1fr)`;
  };

  const getAsymmetricStyle = (index: number) => {
    if (isAsymmetric1Plus3) {
      if (index === 0) return { gridRow: '1 / 4', gridColumn: '1 / 2' };
      if (index === 1) return { gridRow: '1 / 2', gridColumn: '2 / 3' };
      if (index === 2) return { gridRow: '2 / 3', gridColumn: '2 / 3' };
      if (index === 3) return { gridRow: '3 / 4', gridColumn: '2 / 3' };
    }
    if (isAsymmetric1Plus4) {
      if (index === 0) return { gridRow: '1 / 3', gridColumn: '1 / 3' };
    }
    if (isCenterFocus) {
      if (index === 0) return { gridRow: '2 / 4', gridColumn: '2 / 4' };
    }
    return {};
  };

  return (
    <div style={{ 
      backgroundColor: '#111', color: '#fff', height: '100vh', 
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      cursor: isIdle ? 'none' : 'default'
    }}>
      
      <div style={{
        display: 'grid',
        gridTemplateColumns: getGridTemplateColumns(),
        gridTemplateRows: getGridTemplateRows(),
        gridAutoFlow: isCenterFocus || isAsymmetric1Plus4 ? 'dense' : 'row',
        width: '90vw',
        height: '80vh',
        gap: '10px',
        marginBottom: '20px'
      }}>
        {Array.from({ length: pageSize }).map((_, i) => (
          <div key={i} style={getAsymmetricStyle(i)}>
            <GridCell 
              images={images} 
              initialIndex={i} 
              intervalTime={intervalTime} 
              step={pageSize} 
              transition={transition}
            />
          </div>
        ))}
      </div>

      <div style={{ 
        display: 'flex', gap: '20px', alignItems: 'center',
        opacity: isIdle ? 0 : 1, transition: 'opacity 0.5s ease', pointerEvents: isIdle ? 'none' : 'auto'
      }}>
        <button onClick={toggleFullScreen} style={{ ...ctrlBtnStyle, backgroundColor: '#555' }}>
          ⛶ 全螢幕
        </button>
        <button onClick={handleSnapshot} style={{ ...ctrlBtnStyle, backgroundColor: '#333' }}>
          📷 匯出全域快照
        </button>
        <button onClick={onExit} style={{ ...ctrlBtnStyle, backgroundColor: '#800' }}>
          ❌ 退出播放
        </button>
      </div>
    </div>
  );
};

const ctrlBtnStyle = {
  padding: '10px 20px', fontSize: '1rem', cursor: 'pointer',
  backgroundColor: '#333', color: 'white', border: 'none', borderRadius: '5px'
};

export default PlaybackView;
