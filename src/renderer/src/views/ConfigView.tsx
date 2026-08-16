import React, { useState } from 'react';

interface Props {
  initialDirectories: string[];
  initialLayout: string;
  initialInterval: number;
  initialOrder: string;
  initialRecursive: boolean;
  initialTransition: string;
  onStart: (directories: string[], layout: string, interval: number, order: string, recursive: boolean, transition: string) => void;
}

const ConfigView: React.FC<Props> = ({ 
  initialDirectories, initialLayout, initialInterval, initialOrder, initialRecursive, initialTransition, onStart 
}) => {
  const [directories, setDirectories] = useState<string[]>(initialDirectories);
  const [layout, setLayout] = useState<string>(initialLayout);
  const [intervalTime, setIntervalTime] = useState<number>(initialInterval);
  const [order, setOrder] = useState<string>(initialOrder);
  const [recursive, setRecursive] = useState<boolean>(initialRecursive);
  const [transition, setTransition] = useState<string>(initialTransition);

  const handleSelectDirectory = async () => {
    if (window.electronAPI && (window.electronAPI as any).selectDirectories) {
      const dirs = await (window.electronAPI as any).selectDirectories();
      if (dirs && dirs.length > 0) {
        setDirectories(prev => Array.from(new Set([...prev, ...dirs])));
      }
    }
  };

  const handleRemoveDirectory = (indexToRemove: number) => {
    setDirectories(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  return (
    <div style={{ padding: '40px', backgroundColor: '#1a1a1a', color: '#eaeaea', minHeight: '100vh', boxSizing: 'border-box' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '40px', fontWeight: 300, letterSpacing: '2px' }}>Midea Player</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '30px', maxWidth: '1000px', margin: '0 auto' }}>
        
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
              value={intervalTime} 
              onChange={e => setIntervalTime(Number(e.target.value))} 
              style={{ ...selectStyle, width: '80px' }} 
            />
          </div>
        </div>

        {/* Card 4: 進階控制 */}
        <div style={cardStyle}>
          <h2 style={cardTitleStyle}>⚙️ 進階控制</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
            <input 
              type="checkbox" 
              id="recursiveCheck" 
              checked={recursive} 
              onChange={e => setRecursive(e.target.checked)} 
              style={{ transform: 'scale(1.5)', cursor: 'pointer' }}
            />
            <label htmlFor="recursiveCheck" style={{ cursor: 'pointer', fontSize: '1.1rem' }}>
              深度掃描 (包含所有子目錄)
            </label>
          </div>
          <p style={{ color: '#aaa', fontSize: '0.85rem', marginTop: '8px' }}>
            若開啟此選項，系統將會遞迴讀取所選資料夾內所有的子資料夾照片。若目錄極大可能需要稍長讀取時間。
          </p>
        </div>

      </div>

      <div style={{ textAlign: 'center', marginTop: '40px' }}>
        <button 
          onClick={() => onStart(directories, layout, intervalTime, order, recursive, transition)}
          disabled={directories.length === 0}
          style={{ 
            padding: '15px 40px', fontSize: '1.2rem', fontWeight: 'bold',
            backgroundColor: directories.length === 0 ? '#555' : '#4caf50',
            color: 'white', border: 'none', borderRadius: '30px',
            cursor: directories.length === 0 ? 'not-allowed' : 'pointer',
            boxShadow: directories.length === 0 ? 'none' : '0 4px 15px rgba(76, 175, 80, 0.4)',
            transition: 'all 0.3s'
          }}
        >
          {directories.length === 0 ? '請先選擇目錄' : '▶ 開始播放'}
        </button>
      </div>
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#2a2a2a', padding: '25px', borderRadius: '16px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column'
};
const cardTitleStyle: React.CSSProperties = { margin: '0 0 20px 0', fontSize: '1.3rem', borderBottom: '1px solid #444', paddingBottom: '10px', color: '#fff' };
const inputGroupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' };
const selectStyle: React.CSSProperties = { padding: '10px', borderRadius: '6px', backgroundColor: '#333', color: '#fff', border: '1px solid #555', fontSize: '1rem' };
const btnStyle: React.CSSProperties = { padding: '10px 15px', backgroundColor: '#3a7bd5', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' };
const clearBtnStyle: React.CSSProperties = { padding: '4px 10px', backgroundColor: 'transparent', color: '#ff5252', border: '1px solid #ff5252', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' };
const removeBtnStyle: React.CSSProperties = { background: 'transparent', color: '#ff5252', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0 5px' };

declare global {
  interface Window {
    electronAPI: {
      selectDirectories: () => Promise<string[]>;
      scanDirectories: (paths: string[], recursive: boolean) => Promise<string[]>;
    }
  }
}

export default ConfigView;
