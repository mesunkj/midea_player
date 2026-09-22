/**
 * ScanView.tsx — Android 版本
 *
 * 離線 Viewport 預掃描介面（增量模式）。
 * Android 差異：
 *   - 圖片路徑為 Object URL (blob:) 或 content:// URI
 *   - 不需要額外的「掃描目錄」步驟（圖片已由 ConfigView 選取）
 *   - 觸控友善的進度顯示
 */

import React, { useEffect, useState } from 'react';
import { useViewportScanner, ScanState } from '../hooks/useViewportScanner';
import { scanDirectories } from '../platform';

interface Props {
  directories:   string[];  // 已選圖片 URI 陣列（直接當作圖片路徑）
  recursive:     boolean;
  subDirKeyword: string;
  dbRootDir:     string;
  onProceed:     () => void;
  onAnnotate:    () => void;
  onSkip:        () => void;
  onBack:        () => void;
}

const ScanView: React.FC<Props> = ({
  directories, recursive, subDirKeyword, dbRootDir,
  onProceed, onAnnotate, onSkip, onBack,
}) => {
  const { scanState, progress, summary, errorMsg, startScan, cancel, reset } = useViewportScanner();
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Android：直接使用已選取的圖片 URI（不需再掃描目錄）
  const effectiveDbRoot = dbRootDir.trim() || (directories.length > 0 ? 'midea_player_db' : '');

  useEffect(() => {
    let cancelled = false;
    setLoadingFiles(true);

    // 若 directories 裡的項目是目錄（content:// tree URI），需要掃描
    // 若是個別圖片（blob: 或 file:），直接使用
    const processUris = async () => {
      const results: string[] = [];
      for (const uri of directories) {
        if (uri.startsWith('blob:') || uri.startsWith('data:')) {
          // 個別圖片：直接使用
          results.push(uri);
        } else {
          // 目錄或 content:// tree：嘗試掃描
          try {
            const scanned = await scanDirectories([uri], recursive, subDirKeyword);
            results.push(...scanned);
          } catch {
            results.push(uri); // fallback
          }
        }
      }
      if (!cancelled) {
        setImagePaths(results);
        setLoadingFiles(false);
      }
    };

    processUris();
    return () => { cancelled = true; };
  }, []);

  const handleStartScan = () => {
    if (imagePaths.length === 0) return;
    startScan(imagePaths, dbRootDir, effectiveDbRoot);
  };

  const pct = progress && progress.total > 0
    ? Math.round((progress.done / progress.total) * 100) : 0;

  const isDone      = scanState === 'done';
  const isScanning  = ['scanning', 'loading-model', 'saving'].includes(scanState);
  const isCancelled = scanState === 'cancelled';
  const isError     = scanState === 'error';
  const isIdle      = scanState === 'idle';

  return (
    <div style={styles.root}>
      {/* 標題列 */}
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backBtn}>← 返回</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <h1 style={styles.title}>🔍 Viewport 預掃描</h1>
          <p style={styles.subtitle}>對選取的圖片執行 AI 人臉偵測，建立裁切資料庫。</p>
        </div>
        <button onClick={onSkip} style={styles.skipBtn}>跳過 →</button>
      </div>

      <div style={styles.body}>

        {/* 掃描範圍卡片 */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>📷 掃描範圍</h2>
          {loadingFiles ? (
            <p style={styles.hint}>計算圖片數量中...</p>
          ) : (
            <p style={styles.hint}>
              共 <strong style={{ color: '#e2e8f0' }}>{imagePaths.length}</strong> 張圖片
              {recursive && <span style={{ color: '#94a3b8' }}>&nbsp;(深度掃描)</span>}
            </p>
          )}
        </div>

        {/* 進度卡片 */}
        {(isScanning || isDone || isCancelled || isError) && progress && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>
              {isScanning  && '⚡ 掃描中...'}
              {isDone      && '✅ 掃描完成'}
              {isCancelled && '⏹ 已取消'}
              {isError     && '❌ 發生錯誤'}
            </h2>

            <div style={styles.progressTrack}>
              <div style={{
                ...styles.progressBar,
                width: `${pct}%`,
                background: isDone
                  ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                  : isCancelled
                  ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                  : 'linear-gradient(90deg, #3b82f6, #6366f1)',
              }} />
            </div>

            <div style={styles.progressMeta}>
              <span style={{ color: '#94a3b8', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                {progress.currentFile}
              </span>
              <span style={{ color: '#cbd5e1', fontWeight: 600 }}>
                {progress.done} / {progress.total} ({pct}%)
              </span>
            </div>

            <div style={styles.statsRow}>
              <StatBadge color="#22c55e" icon="🟩" value={progress.zoomed}       label="Zoom 成功" />
              <StatBadge color="#eab308" icon="🟨" value={progress.unchanged}    label="正常"       />
              <StatBadge color="#ef4444" icon="🟥" value={progress.unrecognized} label="失敗"       />
              <StatBadge color="#6366f1" icon="⏭" value={progress.skipped}      label="跳過"       />
              <StatBadge color="#06b6d4" icon="♻" value={progress.reused}       label="複用"       />
            </div>
          </div>
        )}

        {/* 完成摘要 */}
        {isDone && summary && summary.failedFiles.length > 0 && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>⚠ 辨識失敗 ({summary.failedFiles.length} 張)</h2>
            <p style={{ color: '#fca5a5', fontSize: '0.9rem', margin: 0 }}>
              可進入手動標註工具修正這些圖片的裁切區域。
            </p>
          </div>
        )}

        {isError && errorMsg && (
          <div style={{ ...styles.card, border: '1px solid #ef4444' }}>
            <p style={{ color: '#ef4444', margin: 0 }}>❌ {errorMsg}</p>
          </div>
        )}

        {/* 操作按鈕 */}
        <div style={styles.actions}>
          {isIdle && !loadingFiles && (
            <button
              onClick={handleStartScan}
              disabled={imagePaths.length === 0}
              style={{
                ...styles.primaryBtn,
                opacity: imagePaths.length === 0 ? 0.5 : 1,
              }}
            >
              🚀 開始掃描 ({imagePaths.length} 張)
            </button>
          )}

          {isScanning && (
            <button onClick={cancel} style={styles.cancelBtn}>⏹ 中止掃描</button>
          )}

          {(isDone || isCancelled || isError) && (
            <>
              <button onClick={reset} style={styles.secondaryBtn}>🔄 重新掃描</button>

              {isDone && summary && summary.failedFiles.length > 0 && (
                <button onClick={onAnnotate} style={{ ...styles.primaryBtn, background: 'linear-gradient(135deg, #d97706, #f59e0b)' }}>
                  🖊 手動標註 ({summary.failedFiles.length})
                </button>
              )}

              <button onClick={onProceed} style={styles.primaryBtn}>▶ 開始播放</button>
            </>
          )}
        </div>

      </div>
    </div>
  );
};

// ─── StatBadge ────────────────────────────────────────────────────────────────

const StatBadge: React.FC<{ color: string; icon: string; value: number; label: string }> = ({ color, icon, value, label }) => (
  <div style={{
    flex: '1 1 80px', display: 'flex', alignItems: 'center', gap: '8px',
    padding: '10px 12px', borderRadius: '10px',
    background: `${color}18`, border: `1px solid ${color}44`,
  }}>
    <span style={{ fontSize: '1.1rem' }}>{icon}</span>
    <div>
      <div style={{ color, fontWeight: 700, fontSize: '1.2rem' }}>{value}</div>
      <div style={{ color: `${color}cc`, fontSize: '0.7rem' }}>{label}</div>
    </div>
  </div>
);

// ─── 樣式 ─────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root:          { minHeight: '100vh', backgroundColor: '#0f1117', color: '#e2e8f0', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', 'Noto Sans TC', sans-serif" },
  header:        { display: 'flex', alignItems: 'center', padding: 'env(safe-area-inset-top, 16px) 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', gap: '8px' },
  title:         { margin: 0, fontSize: '1.2rem', fontWeight: 700, background: 'linear-gradient(135deg, #93c5fd, #c4b5fd)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  subtitle:      { margin: '4px 0 0', color: '#64748b', fontSize: '0.78rem', lineHeight: 1.4 },
  backBtn:       { padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem', minHeight: '44px' },
  skipBtn:       { padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem', minHeight: '44px' },
  body:          { flex: 1, padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '16px' },
  card:          { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '18px' },
  cardTitle:     { margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '10px' },
  hint:          { margin: 0, color: '#64748b', fontSize: '0.9rem' },
  progressTrack: { height: '8px', background: 'rgba(255,255,255,0.07)', borderRadius: '999px', overflow: 'hidden', marginBottom: '10px' },
  progressBar:   { height: '100%', borderRadius: '999px', transition: 'width 0.3s ease' },
  progressMeta:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  statsRow:      { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  actions:       { display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: 'env(safe-area-inset-bottom, 24px)' },
  primaryBtn:    { padding: '16px', fontSize: '1rem', fontWeight: 700, background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: '#fff', border: 'none', borderRadius: '14px', cursor: 'pointer', minHeight: '52px' },
  secondaryBtn:  { padding: '14px', fontSize: '1rem', fontWeight: 600, background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', cursor: 'pointer', minHeight: '52px' },
  cancelBtn:     { padding: '14px', fontSize: '1rem', fontWeight: 600, background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '14px', cursor: 'pointer', minHeight: '52px' },
};

export default ScanView;
