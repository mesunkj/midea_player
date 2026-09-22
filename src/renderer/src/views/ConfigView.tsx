import React, { useState, useEffect } from 'react';

interface DbStatus {
  exists:      boolean;
  scannedAt:   string;
  total:       number;
  failedCount: number;
}

interface Props {
  initialDirectories:    string[];
  initialLayout:         string;
  initialInterval:       number;
  initialOrder:          string;
  initialRecursive:      boolean;
  initialTransition:     string;
  initialSubDirKeyword:  string;
  initialDbRootDir:      string;
  /** 進入「增量掃描」流程 */
  onScan: (
    dirs: string[], layout: string, interval: number, order: string,
    recursive: boolean, transition: string, subDirKeyword: string, dbRootDir: string
  ) => void;
  /** DB 已存在，直接進入播放 */
  onPlayDirect: (
    dirs: string[], layout: string, interval: number, order: string,
    recursive: boolean, transition: string, subDirKeyword: string, dbRootDir: string
  ) => void;
  /** 進入「手動標註工具」（DB 有失敗圖檔時顯示） */
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
  const [directories,   setDirectories]  = useState<string[]>(initialDirectories);
  const [layout,        setLayout]        = useState<string>(initialLayout);
  const [intervalTime,  setIntervalTime]  = useState<number>(initialInterval);
  const [order,         setOrder]         = useState<string>(initialOrder);
  const [recursive,     setRecursive]     = useState<boolean>(initialRecursive);
  const [transition,    setTransition]    = useState<string>(initialTransition);
  const [subDirKeyword, setSubDirKeyword] = useState<string>(initialSubDirKeyword);
  const [dbRootDir,     setDbRootDir]     = useState<string>(initialDbRootDir);
  const [dbStatus,      setDbStatus]      = useState<DbStatus | null>(null);
  const [checkingDb,    setCheckingDb]    = useState(false);

  // ── DB 狀態偵測 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const effectiveRoot = dbRootDir.trim() || (directories.length > 0 ? directories[0] : '');
    if (!effectiveRoot) { setDbStatus(null); return; }

    let cancelled = false;
    setCheckingDb(true);

    const api = (window as any).electronAPI;
    if (!api?.checkViewportDb) { setCheckingDb(false); return; }

    api.checkViewportDb(effectiveRoot).then((result: DbStatus | null) => {
      if (!cancelled) {
        setDbStatus(result);
        setCheckingDb(false);
      }
    }).catch(() => {
      if (!cancelled) { setDbStatus(null); setCheckingDb(false); }
    });

    return () => { cancelled = true; };
  }, [directories.join('|'), dbRootDir]);

  const handleSelectDirectory = async () => {
    const api = (window as any).electronAPI;
    if (api?.selectDirectories) {
      const dirs = await api.selectDirectories();
      if (dirs && dirs.length > 0) {
        setDirectories(prev => Array.from(new Set([...prev, ...dirs])));
      }
    }
  };

  const handleSelectDbDir = async () => {
    const api = (window as any).electronAPI;
    if (api?.selectDirectories) {
      const dirs = await api.selectDirectories();
      if (dirs && dirs.length > 0) setDbRootDir(dirs[0]);
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
    <div style={{ padding: '40px', backgroundColor: '#1a1a1a', color: '#eaeaea', minHeight: '100vh', boxSizing: 'border-box' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '40px', fontWeight: 300, letterSpacing: '2px' }}>Midea Player</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '30px', maxWidth: '1100px', margin: '0 auto' }}>

        {/* Card 1: 圖片來源管理 */}
        <div style={cardStyle}>
          <h2 style={cardTitleStyle}>📁 圖片來源管理</h2>
          <button onClick={handleSelectDirectory} style={btnStyle}>+ 選擇圖片目錄</button>

          <div style={{ marginTop: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontWeight: 'bold' }}>已選擇的目錄：</span>
              {directories.length > 0 && (
                <button onClick={() => setDirectories([])} style={clearBtnStyle}>全部清除</button>
              )}
            </div>

            {directories.length === 0 ? <p style={{ color: '#888' }}>尚未選擇任何目錄</p> : (
              <ul style={{ paddingLeft: 0, listStyle: 'none', margin: 0, maxHeight: '150px', overflowY: 'auto' }}>
                {directories.map((dir, i) => (
                  <li key={i} style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#444', padding: '8px 12px', borderRadius: '6px' }}>
                    <span style={{ wordBreak: 'break-all', marginRight: '10px', fontSize: '0.9rem' }}>{dir}</span>
                    <button onClick={() => handleRemoveDirectory(i)} style={removeBtnStyle}>✕</button>
                  </li>
                ))}
              </ul>
            )}

            <div style={{ marginTop: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>篩選子目錄 (選填)：</label>
              <input
                type="text" placeholder="輸入關鍵字..."
                value={subDirKeyword} onChange={e => setSubDirKeyword(e.target.value)}
                style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' }}
              />
              <p style={{ color: '#aaa', fontSize: '0.85rem', marginTop: '8px', marginBottom: 0 }}>
                僅載入路徑包含此關鍵字的子資料夾照片。若輸入關鍵字，將強制啟用深度掃描。
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: 佈局與視覺 */}
        <div style={cardStyle}>
          <h2 style={cardTitleStyle}>⛶ 佈局與視覺</h2>
          <div style={inputGroupStyle}>
            <label>版面配置 (Layout)：</label>
            <select value={layout} onChange={e => setLayout(e.target.value)} style={selectStyle}>
              <option value="random">🎲 隨機 (安全上限內)</option>
              <option value="1x1">單畫面 (1x1)</option>
              <option value="2x2">四格矩陣 (2x2)</option>
              <option value="1x4">四格直列 (1x4)</option>
              <option value="1x5">中央聚焦 (1x5 非對稱)</option>
              <option value="4x4">十六格矩陣 (4x4)</option>
              <option value="1+3">非對稱 - 1大3小</option>
              <option value="1+4">非對稱 - 1大4小 (雜誌風)</option>
              <option value="center-focus">非對稱 - 置中焦點 (中大外圍小)</option>
              <option value="10x10">超高密度照片牆 (100格)</option>
            </select>
          </div>
        </div>

        {/* Card 3: 播放與轉場 */}
        <div style={cardStyle}>
          <h2 style={cardTitleStyle}>▶ 播放與轉場</h2>
          <div style={inputGroupStyle}>
            <label>排序策略：</label>
            <select value={order} onChange={e => setOrder(e.target.value)} style={selectStyle}>
              <option value="shuffle">🔀 隨機打散播放</option>
              <option value="sequential">⬇️ 循序播放 (依檔案順序)</option>
            </select>
          </div>
          <div style={inputGroupStyle}>
            <label>轉場效果：</label>
            <select value={transition} onChange={e => setTransition(e.target.value)} style={selectStyle}>
              <option value="fade">柔和淡入淡出 (Fade)</option>
              <option value="slide">平滑推移 (Slide)</option>
              <option value="zoom">微縮放漸變 (Zoom)</option>
              <option value="blur">唯美模糊 (Blur Reveal)</option>
              <option value="wipe">光影百葉 (Wipe Reveal)</option>
              <option value="random">🎲 隨機變換 (Random)</option>
            </select>
          </div>
          <div style={inputGroupStyle}>
            <label>輪播間隔 (秒)：</label>
            <input
              type="number" min="1" max="60"
              value={intervalTime} onChange={e => setIntervalTime(Number(e.target.value))}
              style={{ ...selectStyle, width: '80px' }}
            />
          </div>
        </div>

        {/* Card 4: 進階控制 */}
        <div style={cardStyle}>
          <h2 style={cardTitleStyle}>⚙️ 進階控制</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
            <input
              type="checkbox" id="recursiveCheck"
              checked={recursive} onChange={e => setRecursive(e.target.checked)}
              style={{ transform: 'scale(1.5)', cursor: 'pointer' }}
            />
            <label htmlFor="recursiveCheck" style={{ cursor: 'pointer', fontSize: '1.1rem' }}>
              深度掃描 (包含所有子目錄)
            </label>
          </div>
          <p style={{ color: '#aaa', fontSize: '0.85rem', marginTop: '8px' }}>
            若開啟此選項，系統將會遞迴讀取所選資料夾內所有的子資料夾照片。
          </p>

          {/* DB 路徑設定 */}
          <div style={{ marginTop: '20px', borderTop: '1px solid #333', paddingTop: '15px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              🗂 Viewport DB 路徑（選填）：
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="空白 = 與圖片目錄相同（預設）"
                value={dbRootDir}
                onChange={e => setDbRootDir(e.target.value)}
                style={{ ...selectStyle, flex: 1, fontSize: '0.85rem' }}
              />
              <button onClick={handleSelectDbDir} style={{ ...btnStyle, padding: '8px 12px', fontSize: '0.85rem', flexShrink: 0 }}>
                📂
              </button>
              {dbRootDir && (
                <button onClick={() => setDbRootDir('')} style={{ ...clearBtnStyle, flexShrink: 0 }}>清除</button>
              )}
            </div>
            <p style={{ color: '#aaa', fontSize: '0.82rem', marginTop: '6px', marginBottom: 0 }}>
              指定 .viewport_db.json 的儲存目錄。正式發布時可設定為獨立路徑。
            </p>
          </div>
        </div>

        {/* Card 5: Viewport DB 狀態 */}
        {canStart && (
          <div style={{ ...cardStyle, gridColumn: '1 / -1' }}>
            <h2 style={cardTitleStyle}>🔍 Viewport DB 狀態</h2>

            {checkingDb ? (
              <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>⏳ 檢查中...</div>
            ) : dbStatus ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '6px 16px', borderRadius: '20px',
                  background: 'rgba(34,197,94,0.15)', border: '1px solid #22c55e66',
                  color: '#22c55e', fontWeight: 600,
                }}>
                  ✅ DB 已存在
                </span>
                <span style={{ color: '#94a3b8', fontSize: '0.88rem' }}>
                  最後掃描：{formatDate(dbStatus.scannedAt)}
                </span>
                <span style={{ color: '#94a3b8', fontSize: '0.88rem' }}>
                  共 {dbStatus.total} 張
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
                <span style={{ color: '#64748b', fontSize: '0.85rem' }}>
                  需先執行掃描才能建立資料庫
                </span>
              </div>
            )}
          </div>
        )}

      </div>

      {/* 操作按鈕 */}
      <div style={{ textAlign: 'center', marginTop: '40px', display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
        {/* 手動標註工具（DB 有失敗圖片時顯示） */}
        {canStart && dbStatus && dbStatus.failedCount > 0 && (
          <button
            onClick={() => onAnnotate(...getArgs())}
            style={{
              padding: '15px 28px', fontSize: '1rem', fontWeight: 'bold',
              backgroundColor: '#78350f', color: '#fef08a', border: '1px solid #854d0e',
              borderRadius: '30px', cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(120,53,15,0.35)',
              transition: 'all 0.3s'
            }}
          >
            🖊 手動標註工具 ({dbStatus.failedCount} 張失敗)
          </button>
        )}

        {/* 直接播放（DB 存在才顯示） */}
        {canStart && dbStatus && (
          <button
            onClick={() => onPlayDirect(...getArgs())}
            style={{
              padding: '15px 36px', fontSize: '1.1rem', fontWeight: 'bold',
              backgroundColor: '#1d6f42', color: 'white', border: 'none', borderRadius: '30px',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(29,111,66,0.35)',
              transition: 'all 0.3s'
            }}
          >
            ▶ 直接播放
          </button>
        )}

        {/* 掃描（永遠顯示，文字依狀態變化） */}
        <button
          onClick={() => onScan(...getArgs())}
          disabled={!canStart}
          style={{
            padding: '15px 36px', fontSize: '1.1rem', fontWeight: 'bold',
            backgroundColor: !canStart ? '#555' : (dbStatus ? '#2563eb' : '#4caf50'),
            color: 'white', border: 'none', borderRadius: '30px',
            cursor: !canStart ? 'not-allowed' : 'pointer',
            boxShadow: !canStart ? 'none' : '0 4px 15px rgba(76,175,80,0.35)',
            transition: 'all 0.3s'
          }}
        >
          {!canStart ? '請先選擇目錄' : (dbStatus ? '🔍 增量掃描' : '🔍 掃描後播放')}
        </button>
      </div>
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#2a2a2a', padding: '25px', borderRadius: '16px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column'
};
const cardTitleStyle: React.CSSProperties = {
  margin: '0 0 20px 0', fontSize: '1.3rem', borderBottom: '1px solid #444',
  paddingBottom: '10px', color: '#fff'
};
const inputGroupStyle: React.CSSProperties  = { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' };
const selectStyle: React.CSSProperties      = { padding: '10px', borderRadius: '6px', backgroundColor: '#333', color: '#fff', border: '1px solid #555', fontSize: '1rem' };
const btnStyle: React.CSSProperties         = { padding: '10px 15px', backgroundColor: '#3a7bd5', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' };
const clearBtnStyle: React.CSSProperties    = { padding: '4px 10px', backgroundColor: 'transparent', color: '#ff5252', border: '1px solid #ff5252', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' };
const removeBtnStyle: React.CSSProperties   = { background: 'transparent', color: '#ff5252', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0 5px' };

declare global {
  interface Window {
    electronAPI: {
      selectDirectories:   () => Promise<string[]>;
      scanDirectories:     (paths: string[], recursive: boolean, subDirKeyword: string) => Promise<string[]>;
      checkViewportDb:     (rootDir: string) => Promise<DbStatus | null>;
      loadViewportDb:      (rootDir: string) => Promise<any>;
      saveViewportDb:      (rootDir: string, db: any) => Promise<any>;
      updateViewportEntry: (rootDir: string, imagePath: string, entry: any) => Promise<any>;
      imageToBase64:       (imagePath: string) => Promise<string | null>;
      saveImage:           (imagePath: string) => Promise<any>;
      snapshot:            () => Promise<any>;
    }
  }
}

export default ConfigView;
