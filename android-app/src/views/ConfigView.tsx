/**
 * ConfigView.tsx — Android 版本
 *
 * 設定頁面。
 * Android 差異：
 *   - 目錄選擇使用 FilePicker（原生圖片選擇器）
 *   - DB 狀態透過 platform.ts checkViewportDb 讀取（Capacitor Preferences）
 *   - 「DB 路徑」概念改為「資料集名稱」（Android 無傳統路徑概念）
 *   - 觸控友善：大按鈕、safe-area 邊距
 */

import React, { useState, useEffect } from 'react';
import { checkViewportDb } from '../platform';

interface DbStatus {
  exists: boolean;
  scannedAt: string;
  total: number;
  failedCount: number;
}

interface Props {
  initialDirectories:   string[];
  initialLayout:        string;
  initialInterval:      number;
  initialOrder:         string;
  initialRecursive:     boolean;
  initialTransition:    string;
  initialSubDirKeyword: string;
  initialDbRootDir:     string;
  onScan: (
    dirs: string[], layout: string, interval: number, order: string,
    recursive: boolean, transition: string, subDirKeyword: string, dbRootDir: string
  ) => void;
  onPlayDirect: (
    dirs: string[], layout: string, interval: number, order: string,
    recursive: boolean, transition: string, subDirKeyword: string, dbRootDir: string
  ) => void;
  onAnnotate: (
    dirs: string[], layout: string, interval: number, order: string,
    recursive: boolean, transition: string, subDirKeyword: string, dbRootDir: string
  ) => void;
}

const ConfigView: React.FC<Props> = ({
  initialDirectories, initialLayout, initialInterval, initialOrder,
  initialRecursive, initialTransition, initialSubDirKeyword, initialDbRootDir,
  onScan, onPlayDirect, onAnnotate,
}) => {
  const [directories,   setDirectories]   = useState<string[]>(initialDirectories);
  const [layout,        setLayout]         = useState<string>(initialLayout);
  const [intervalTime,  setIntervalTime]   = useState<number>(initialInterval);
  const [order,         setOrder]          = useState<string>(initialOrder);
  const [recursive,     setRecursive]      = useState<boolean>(initialRecursive);
  const [transition,    setTransition]     = useState<string>(initialTransition);
  const [subDirKeyword, setSubDirKeyword]  = useState<string>(initialSubDirKeyword);
  const [dbRootDir,     setDbRootDir]      = useState<string>(initialDbRootDir);
  const [dbStatus,      setDbStatus]       = useState<DbStatus | null>(null);
  const [checkingDb,    setCheckingDb]     = useState(false);
  const [picking,       setPicking]        = useState(false);

  // ── DB 狀態偵測 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const effectiveRoot = dbRootDir.trim() || (directories.length > 0 ? directories[0] : '');
    if (!effectiveRoot) { setDbStatus(null); return; }

    let cancelled = false;
    setCheckingDb(true);

    checkViewportDb(effectiveRoot).then(result => {
      if (!cancelled) {
        setDbStatus(result);
        setCheckingDb(false);
      }
    }).catch(() => {
      if (!cancelled) { setDbStatus(null); setCheckingDb(false); }
    });

    return () => { cancelled = true; };
  }, [directories.join('|'), dbRootDir]);

  // ── 選取圖片（Android 圖片選擇器）──────────────────────────────────────────
  const handleSelectImages = async () => {
    setPicking(true);
    try {
      // Android：使用 <input type="file"> 觸發系統圖片選擇器
      // Capacitor 會自動讓 WebView 的 file input 調用原生 picker
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;

      input.onchange = () => {
        if (!input.files) { setPicking(false); return; }
        const uris: string[] = [];
        for (let i = 0; i < input.files.length; i++) {
          const file = input.files[i];
          // 建立 Object URL 供後續使用
          uris.push(URL.createObjectURL(file));
        }
        if (uris.length > 0) {
          setDirectories(prev => Array.from(new Set([...prev, ...uris])));
        }
        setPicking(false);
      };
      input.click();
    } catch (e) {
      console.error('File picker failed:', e);
      setPicking(false);
    }
  };

  const handleRemoveDirectory = (i: number) => {
    setDirectories(prev => prev.filter((_, idx) => idx !== i));
  };

  const getArgs = (): [string[], string, number, string, boolean, string, string, string] =>
    [directories, layout, intervalTime, order, recursive, transition, subDirKeyword, dbRootDir];

  const canStart = directories.length > 0;

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleString('zh-TW'); } catch { return iso; }
  };

  return (
    <div style={{
      padding: 'env(safe-area-inset-top, 24px) 20px env(safe-area-inset-bottom, 24px) 20px',
      backgroundColor: '#0f1117', color: '#e2e8f0',
      minHeight: '100vh', boxSizing: 'border-box',
      fontFamily: "'Inter', 'Noto Sans TC', 'Segoe UI', sans-serif",
      overflowY: 'auto',
    }}>
      {/* 標題 */}
      <div style={{ textAlign: 'center', marginBottom: '32px', paddingTop: '16px' }}>
        <h1 style={{
          margin: 0, fontSize: '1.8rem', fontWeight: 700,
          background: 'linear-gradient(135deg, #93c5fd, #c4b5fd)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          letterSpacing: '1px',
        }}>
          🌸 Midea Player
        </h1>
        <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
          Android 版 · 跨平台圖片輪播系統
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '600px', margin: '0 auto' }}>

        {/* Card 1: 圖片來源 */}
        <div style={cardStyle}>
          <h2 style={cardTitleStyle}>📁 圖片來源</h2>
          <button
            onClick={handleSelectImages}
            disabled={picking}
            style={{ ...btnStyle, opacity: picking ? 0.6 : 1 }}
          >
            {picking ? '選取中...' : '+ 選擇圖片'}
          </button>

          <div style={{ marginTop: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontWeight: 600, color: '#cbd5e1', fontSize: '0.9rem' }}>
                已選擇 {directories.length} 張圖片
              </span>
              {directories.length > 0 && (
                <button onClick={() => setDirectories([])} style={clearBtnStyle}>全部清除</button>
              )}
            </div>

            {directories.length > 0 && (
              <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
                {directories.slice(0, 5).map((dir, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    backgroundColor: 'rgba(59,130,246,0.08)',
                    border: '1px solid rgba(59,130,246,0.2)',
                    padding: '8px 12px', borderRadius: '8px', marginBottom: '6px',
                  }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                      📷 圖片 #{i + 1}
                    </span>
                    <button onClick={() => handleRemoveDirectory(i)} style={removeBtnStyle}>✕</button>
                  </div>
                ))}
                {directories.length > 5 && (
                  <p style={{ color: '#64748b', fontSize: '0.8rem', textAlign: 'center', margin: '4px 0' }}>
                    ...還有 {directories.length - 5} 張
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Card 2: 佈局與視覺 */}
        <div style={cardStyle}>
          <h2 style={cardTitleStyle}>⛶ 佈局與視覺</h2>
          <div style={inputGroupStyle}>
            <label style={labelStyle}>版面配置 (Layout)：</label>
            <select value={layout} onChange={e => setLayout(e.target.value)} style={selectStyle}>
              <option value="random">🎲 隨機 (安全上限內)</option>
              <option value="1x1">單畫面 (1x1)</option>
              <option value="2x2">四格矩陣 (2x2)</option>
              <option value="1x4">四格直列 (1x4)</option>
              <option value="1x5">中央聚焦 (1x5 非對稱)</option>
              <option value="4x4">十六格矩陣 (4x4)</option>
              <option value="1+3">非對稱 - 1大3小</option>
              <option value="1+4">非對稱 - 1大4小 (雜誌風)</option>
              <option value="center-focus">非對稱 - 置中焦點</option>
              <option value="10x10">超高密度照片牆 (100格)</option>
            </select>
          </div>
        </div>

        {/* Card 3: 播放與轉場 */}
        <div style={cardStyle}>
          <h2 style={cardTitleStyle}>▶ 播放與轉場</h2>
          <div style={inputGroupStyle}>
            <label style={labelStyle}>排序策略：</label>
            <select value={order} onChange={e => setOrder(e.target.value)} style={selectStyle}>
              <option value="shuffle">🔀 隨機打散播放</option>
              <option value="sequential">⬇️ 循序播放</option>
            </select>
          </div>
          <div style={inputGroupStyle}>
            <label style={labelStyle}>轉場效果：</label>
            <select value={transition} onChange={e => setTransition(e.target.value)} style={selectStyle}>
              <option value="fade">柔和淡入淡出 (Fade)</option>
              <option value="slide">平滑推移 (Slide)</option>
              <option value="zoom">微縮放漸變 (Zoom)</option>
              <option value="blur">唯美模糊 (Blur)</option>
              <option value="wipe">光影百葉 (Wipe)</option>
              <option value="random">🎲 隨機變換</option>
            </select>
          </div>
          <div style={inputGroupStyle}>
            <label style={labelStyle}>輪播間隔（秒）：</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input
                type="range" min="1" max="30" value={intervalTime}
                onChange={e => setIntervalTime(Number(e.target.value))}
                style={{ flex: 1, accentColor: '#6366f1' }}
              />
              <span style={{ color: '#94a3b8', minWidth: '32px', textAlign: 'right', fontSize: '1.1rem', fontWeight: 600 }}>
                {intervalTime}s
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: 進階控制 */}
        <div style={cardStyle}>
          <h2 style={cardTitleStyle}>⚙️ 進階控制</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 0' }}>
            <div
              onClick={() => setRecursive(!recursive)}
              style={{
                width: '52px', height: '28px', borderRadius: '14px',
                backgroundColor: recursive ? '#6366f1' : '#374151',
                position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <div style={{
                width: '22px', height: '22px', borderRadius: '50%',
                backgroundColor: '#fff',
                position: 'absolute', top: '3px',
                left: recursive ? '27px' : '3px',
                transition: 'left 0.2s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }} />
            </div>
            <label style={{ cursor: 'pointer', fontSize: '1rem', color: '#cbd5e1' }} onClick={() => setRecursive(!recursive)}>
              深度掃描（包含所有子目錄）
            </label>
          </div>
          <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '4px 0 0', lineHeight: 1.5 }}>
            開啟後將遞迴讀取所有子資料夾的圖片。
          </p>
        </div>

        {/* Card 5: DB 狀態 */}
        {canStart && (
          <div style={{ ...cardStyle }}>
            <h2 style={cardTitleStyle}>🔍 Viewport DB 狀態</h2>
            {checkingDb ? (
              <span style={{ color: '#64748b', fontSize: '0.9rem' }}>⏳ 檢查中...</span>
            ) : dbStatus ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '6px 16px', borderRadius: '20px', alignSelf: 'flex-start',
                  background: 'rgba(34,197,94,0.12)', border: '1px solid #22c55e66',
                  color: '#22c55e', fontWeight: 600,
                }}>
                  ✅ DB 已存在
                </span>
                <span style={{ color: '#64748b', fontSize: '0.85rem' }}>
                  最後掃描：{formatDate(dbStatus.scannedAt)}　共 {dbStatus.total} 張
                  {dbStatus.failedCount > 0 && (
                    <span style={{ color: '#ef4444', marginLeft: '8px' }}>
                      ⚠ {dbStatus.failedCount} 張失敗
                    </span>
                  )}
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '6px 16px', borderRadius: '20px',
                  background: 'rgba(234,179,8,0.12)', border: '1px solid #eab30866',
                  color: '#eab308', fontWeight: 600,
                }}>
                  ⚠ 尚無 DB
                </span>
                <span style={{ color: '#64748b', fontSize: '0.85rem' }}>需先執行掃描</span>
              </div>
            )}
          </div>
        )}

        {/* 操作按鈕 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '40px' }}>
          {canStart && dbStatus && dbStatus.failedCount > 0 && (
            <button
              onClick={() => onAnnotate(...getArgs())}
              style={{
                padding: '18px', fontSize: '1.1rem', fontWeight: 700,
                backgroundColor: '#78350f', color: '#fef08a', border: '1px solid #854d0e',
                borderRadius: '16px', cursor: 'pointer', width: '100%',
              }}
            >
              🖊 手動標註工具 ({dbStatus.failedCount} 張失敗)
            </button>
          )}

          {canStart && dbStatus && (
            <button
              onClick={() => onPlayDirect(...getArgs())}
              style={{
                padding: '18px', fontSize: '1.1rem', fontWeight: 700,
                background: 'linear-gradient(135deg, #059669, #10b981)',
                color: 'white', border: 'none', borderRadius: '16px', cursor: 'pointer', width: '100%',
                boxShadow: '0 4px 20px rgba(16,185,129,0.35)',
              }}
            >
              ▶ 直接播放
            </button>
          )}

          <button
            onClick={() => onScan(...getArgs())}
            disabled={!canStart}
            style={{
              padding: '18px', fontSize: '1.1rem', fontWeight: 700,
              background: !canStart
                ? 'rgba(255,255,255,0.06)'
                : dbStatus
                  ? 'linear-gradient(135deg, #2563eb, #6366f1)'
                  : 'linear-gradient(135deg, #4ade80, #22c55e)',
              color: !canStart ? '#475569' : 'white',
              border: 'none', borderRadius: '16px',
              cursor: !canStart ? 'not-allowed' : 'pointer',
              width: '100%',
              boxShadow: canStart ? '0 4px 20px rgba(99,102,241,0.3)' : 'none',
            }}
          >
            {!canStart ? '請先選擇圖片' : (dbStatus ? '🔍 增量掃描' : '🔍 掃描後播放')}
          </button>
        </div>

      </div>
    </div>
  );
};

// ─── 樣式 ──────────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  backgroundColor: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  padding: '20px', borderRadius: '20px',
  backdropFilter: 'blur(4px)',
};
const cardTitleStyle: React.CSSProperties = {
  margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 600, color: '#f1f5f9',
  borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px',
};
const inputGroupStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px',
};
const labelStyle: React.CSSProperties = {
  color: '#94a3b8', fontSize: '0.9rem', fontWeight: 500,
};
const selectStyle: React.CSSProperties = {
  padding: '12px 14px', borderRadius: '10px',
  backgroundColor: 'rgba(255,255,255,0.06)', color: '#e2e8f0',
  border: '1px solid rgba(255,255,255,0.12)',
  fontSize: '1rem', minHeight: '48px',
};
const btnStyle: React.CSSProperties = {
  padding: '14px 20px', backgroundColor: '#3b82f6', color: '#fff',
  border: 'none', borderRadius: '12px', cursor: 'pointer',
  fontSize: '1rem', fontWeight: 700, width: '100%', minHeight: '52px',
};
const clearBtnStyle: React.CSSProperties = {
  padding: '6px 14px', backgroundColor: 'transparent', color: '#ef4444',
  border: '1px solid rgba(239,68,68,0.4)', borderRadius: '8px',
  cursor: 'pointer', fontSize: '0.9rem',
};
const removeBtnStyle: React.CSSProperties = {
  background: 'transparent', color: '#ef4444', border: 'none',
  cursor: 'pointer', fontSize: '1.1rem', padding: '4px 8px', flexShrink: 0,
};

export default ConfigView;
