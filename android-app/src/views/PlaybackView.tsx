/**
 * PlaybackView.tsx — Android 版本
 *
 * 圖片輪播主畫面。
 * Android 差異：
 *   - 圖片由 ConfigView 傳入（已是 blob:/content:// URI）
 *   - 快照使用 html2canvas（透過 platform.ts takeSnapshot）
 *   - Kiosk 模式：觸控靜止 5 秒後隱藏 UI
 *   - 全螢幕使用 Fullscreen API（Android WebView 支援）
 */

import React, { useEffect, useState } from 'react';
import PhotoWall from '../components/PhotoWall';
import GridCell  from '../components/GridCell';
import { useViewportDb } from '../hooks/useViewportDb';
import { takeSnapshot } from '../platform';

interface Props {
  directories:   string[];  // blob:/content:// URI 陣列
  layout:        string;
  intervalTime:  number;
  order:         string;
  recursive:     boolean;
  transition:    string;
  subDirKeyword: string;
  dbRootDir:     string;
  onExit:        () => void;
  onAnnotate:    () => void;
}

const PlaybackView: React.FC<Props> = ({
  directories, layout, intervalTime, order, recursive, transition,
  subDirKeyword, dbRootDir, onExit, onAnnotate,
}) => {
  // 在 Android 版中，directories 本身就是圖片 URI 列表
  const [images,  setImages]  = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isIdle,  setIsIdle]  = useState(false);

  const { getViewport, rawDb, isLoaded: dbLoaded } = useViewportDb(directories, dbRootDir);

  // Kiosk 模式：5 秒觸控靜止後隱藏 UI（Android 適用較長時間）
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const resetIdle = () => {
      setIsIdle(false);
      clearTimeout(timeout);
      timeout = setTimeout(() => setIsIdle(true), 5000);
    };
    window.addEventListener('touchstart', resetIdle);
    window.addEventListener('mousemove',  resetIdle);
    resetIdle();
    return () => {
      window.removeEventListener('touchstart', resetIdle);
      window.removeEventListener('mousemove',  resetIdle);
      clearTimeout(timeout);
    };
  }, []);

  // 準備圖片清單
  useEffect(() => {
    let isMounted = true;
    const prepareImages = async () => {
      let fetched = [...directories]; // 直接使用 URI 列表

      if (order === 'shuffle') {
        for (let i = fetched.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [fetched[i], fetched[j]] = [fetched[j], fetched[i]];
        }
      }

      if (isMounted) {
        setImages(fetched);
        setLoading(false);
      }
    };
    prepareImages();
    return () => { isMounted = false; };
  }, [directories, order]);

  if (loading || !dbLoaded) {
    return (
      <div style={{
        backgroundColor: '#0f1117', color: '#94a3b8',
        height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '16px',
      }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '50%',
          border: '3px solid rgba(99,102,241,0.3)',
          borderTopColor: '#6366f1',
          animation: 'spin 1s linear infinite',
        }} />
        <p style={{ margin: 0, fontSize: '1rem' }}>
          {loading ? '準備圖片中...' : '載入 Viewport 資料庫...'}
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const handleSnapshot = async () => {
    const res = await takeSnapshot();
    if (res.success) {
      alert('快照已儲存！');
    } else if (res.reason) {
      alert('快照失敗: ' + res.reason);
    }
  };

  const hasFailedFiles = (rawDb?.failedFiles?.length ?? 0) > 0;

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error('全螢幕切換失敗:', err.message);
      });
    } else {
      document.exitFullscreen?.();
    }
  };

  // 全域控制列（底部懸浮）
  const renderGlobalControls = () => (
    <div style={{
      position: 'fixed',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
      left: '50%', transform: 'translateX(-50%)',
      display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center',
      opacity: isIdle ? 0 : 1,
      transition: 'opacity 0.5s ease',
      pointerEvents: isIdle ? 'none' : 'auto',
      zIndex: 100,
      padding: '10px 14px',
      backgroundColor: 'rgba(0,0,0,0.75)',
      borderRadius: '24px',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <button onClick={toggleFullScreen} style={ctrlBtnStyle}>⛶ 全螢幕</button>
      <button onClick={handleSnapshot}   style={ctrlBtnStyle}>📷 快照</button>
      {hasFailedFiles && (
        <button onClick={onAnnotate} style={{ ...ctrlBtnStyle, color: '#fef08a', backgroundColor: 'rgba(120,53,15,0.8)' }}>
          🖊 標註
        </button>
      )}
      <button onClick={onExit} style={{ ...ctrlBtnStyle, backgroundColor: 'rgba(153,0,0,0.8)' }}>
        ❌ 退出
      </button>
    </div>
  );

  // 照片牆模式
  if (layout === '10x10') {
    return (
      <div style={{ position: 'relative', cursor: isIdle ? 'none' : 'default' }}>
        <PhotoWall images={images} isIdle={isIdle} />
        {renderGlobalControls()}
      </div>
    );
  }

  // 格線計算
  let cols = 1;
  let pageSize = 1;
  const isAsymmetric1Plus3 = layout === '1+3';
  const isAsymmetric1Plus4 = layout === '1+4';
  const isCenterFocus      = layout === 'center-focus';
  const is1x5Center        = layout === '1x5';
  const is1x4              = layout === '1x4';

  if (isAsymmetric1Plus3) {
    pageSize = 4;
  } else if (isAsymmetric1Plus4) {
    pageSize = 5;
  } else if (isCenterFocus) {
    cols = 4; pageSize = 13;
  } else if (is1x5Center) {
    pageSize = 5;
  } else if (is1x4) {
    cols = 4; pageSize = 4;
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

  const getAsymmetricStyle = (index: number): React.CSSProperties => {
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
      backgroundColor: '#0f1117', height: '100vh',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      cursor: isIdle ? 'none' : 'default',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: getGridTemplateColumns(),
        gridTemplateRows: getGridTemplateRows(),
        gridAutoFlow: isCenterFocus || isAsymmetric1Plus4 ? 'dense' : 'row',
        width: '100vw',
        height: '92vh',
        gap: '4px',
      }}>
        {Array.from({ length: pageSize }).map((_, i) => (
          <div key={i} style={getAsymmetricStyle(i)}>
            <GridCell
              images={images}
              directories={directories}
              initialIndex={i}
              intervalTime={intervalTime}
              step={pageSize}
              transition={transition}
              getViewport={getViewport}
            />
          </div>
        ))}
      </div>

      {renderGlobalControls()}
    </div>
  );
};

const ctrlBtnStyle: React.CSSProperties = {
  padding: '10px 16px', fontSize: '0.9rem', cursor: 'pointer',
  backgroundColor: 'rgba(51,65,85,0.9)', color: 'white',
  border: 'none', borderRadius: '14px',
  minWidth: '44px', minHeight: '44px',
  fontWeight: 600,
};

export default PlaybackView;
