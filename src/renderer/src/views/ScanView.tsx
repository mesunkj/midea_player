/**
 * ScanView.tsx — 離線 Viewport 預掃描介面（增量模式）
 *
 * 支援：
 * - 增量掃描：跳過已成功掃描的圖片，顯示 skipped 計數
 * - 自訂 DB 路徑（dbRootDir）
 * - 掃描完成後若有失敗圖片，提示進入手動標註
 */

import React, { useEffect, useState } from 'react';
import { useViewportScanner, ScanState } from '../hooks/useViewportScanner';

interface Props {
  directories:   string[];
  recursive:     boolean;
  subDirKeyword: string;
  dbRootDir:     string;   // 空字串 = 使用 directories[0]
  onProceed:     () => void;
  onAnnotate:    () => void; // 前往手動標註失敗圖片
  onSkip:        () => void;
  onBack:        () => void;
}

function shortPath(p: string, maxLen = 60): string {
  const norm = p.replace(/\\/g, '/');
  if (norm.length <= maxLen) return norm;
  const parts    = norm.split('/');
  const fileName = parts[parts.length - 1];
  const head     = parts.slice(0, 2).join('/');
  return `${head}/…/${fileName}`;
}

const ScanView: React.FC<Props> = ({
  directories, recursive, subDirKeyword, dbRootDir,
  onProceed, onAnnotate, onSkip, onBack
}) => {
  const { scanState, progress, summary, errorMsg, startScan, cancel, reset } = useViewportScanner();
  const [imagePaths,   setImagePaths]   = useState<string[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const effectiveDbRoot = dbRootDir.trim() || (directories.length > 0 ? directories[0] : '');

  useEffect(() => {
    let cancelled = false;
    setLoadingFiles(true);
    const api = (window as any).electronAPI;
    if (api?.scanDirectories) {
      api.scanDirectories(directories, recursive, subDirKeyword).then((paths: string[]) => {
        if (!cancelled) { setImagePaths(paths); setLoadingFiles(false); }
      });
    } else {
      setLoadingFiles(false);
    }
    return () => { cancelled = true; };
  }, []);

  const handleStartScan = () => {
    if (imagePaths.length === 0 || !effectiveDbRoot) return;
    startScan(imagePaths, dbRootDir, directories[0] ?? '');
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
        <div>
          <h1 style={styles.title}>🔍 Viewport 預掃描</h1>
          <p style={styles.subtitle}>
            對目錄內所有圖片執行離線 AI 人臉偵測，建立本地資料庫。<br />
            已成功掃描的圖片將自動跳過（增量模式）。
          </p>
        </div>
        <button onClick={onSkip} style={styles.skipBtn}>跳過 →</button>
      </div>

      <div style={styles.body}>

        {/* 掃描範圍卡片 */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>📁 掃描範圍</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            {directories.map((d, i) => (
              <span key={i} style={styles.dirBadge}>{shortPath(d, 50)}</span>
            ))}
          </div>
          {effectiveDbRoot && (
            <p style={{ ...styles.hint, color: '#7dd3fc', marginBottom: '6px' }}>
              📄 DB 儲存：{shortPath(effectiveDbRoot + '/.viewport_db.json')}
            </p>
          )}
          {loadingFiles ? (
            <p style={styles.hint}>正在計算圖片數量...</p>
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
              <span style={{ color: '#94a3b8', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                {progress.currentFile}
              </span>
              <span style={{ color: '#cbd5e1', fontWeight: 600 }}>
                {progress.done} / {progress.total} ({pct}%)
              </span>
            </div>

            {/* 五色統計（含 skipped + reused） */}
            <div style={styles.statsRow}>
              <StatBadge color="#22c55e" icon="🟩" value={progress.zoomed}       label="Zoom-in 成功" />
              <StatBadge color="#eab308" icon="🟨" value={progress.unchanged}    label="判定正常"     />
              <StatBadge color="#ef4444" icon="🟥" value={progress.unrecognized} label="辨識失敗"     />
              <StatBadge color="#6366f1" icon="⏭" value={progress.skipped}      label="跳過 (已存)"  />
              <StatBadge color="#06b6d4" icon="♻" value={progress.reused}       label="檔名複用"     />
            </div>
          </div>
        )}

        {/* 完成摘要 */}
        {isDone && summary && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>📋 掃描摘要</h2>
            <p style={styles.hint}>
              DB 已儲存至：<code style={styles.code}>{summary.savedToDir}/.viewport_db.json</code>
            </p>
            {summary.skipped > 0 && (
              <p style={{ ...styles.hint, color: '#a5b4fc', marginTop: '8px' }}>
                ⏭ {summary.skipped} 張沿用完整路徑舊結果（跳過 AI）
              </p>
            )}
            {summary.reused > 0 && (
              <p style={{ ...styles.hint, color: '#67e8f9', marginTop: '8px' }}>
                ♻ {summary.reused} 張依檔名複用其他 Model 的偵測結果（跳過 AI）
              </p>
            )}
            {summary.failedFiles.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <p style={{ color: '#fca5a5', fontWeight: 600, marginBottom: '8px' }}>
                  ⚠ 辨識失敗 ({summary.failedFiles.length} 張) — 可進入手動標註修正：
                </p>
                <div style={styles.failedList}>
                  {summary.failedFiles.map((f, i) => (
                    <div key={i} style={styles.failedItem}>{shortPath(f)}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {isError && errorMsg && (
          <div style={{ ...styles.card, borderColor: '#ef4444', border: '1px solid #ef4444' }}>
            <p style={{ color: '#ef4444' }}>❌ {errorMsg}</p>
          </div>
        )}

        {/* 操作按鈕 */}
        <div style={styles.actions}>
          {isIdle && !loadingFiles && (
            <button
              onClick={handleStartScan}
              disabled={imagePaths.length === 0 || !effectiveDbRoot}
              style={{
                ...styles.primaryBtn,
                opacity: (imagePaths.length === 0 || !effectiveDbRoot) ? 0.5 : 1,
                cursor:  (imagePaths.length === 0 || !effectiveDbRoot) ? 'not-allowed' : 'pointer',
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
                  🖊 手動標註失敗圖片 ({summary.failedFiles.length})
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

// ─── StatBadge 子元件 ─────────────────────────────────────────────────────────

const StatBadge: React.FC<{ color: string; icon: string; value: number; label: string }> = ({ color, icon, value, label }) => (
  <div style={{
    flex: '1 1 130px', display: 'flex', alignItems: 'center', gap: '12px',
    padding: '14px 16px', borderRadius: '12px',
    background: `${color}18`, border: `1px solid ${color}44`,
  }}>
    <span style={{ fontSize: '1.3rem' }}>{icon}</span>
    <div>
      <div style={{ color, fontWeight: 700, fontSize: '1.4rem' }}>{value}</div>
      <div style={{ color: `${color}cc`, fontSize: '0.75rem' }}>{label}</div>
    </div>
  </div>
);

// ─── 樣式 ─────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root:          { minHeight: '100vh', backgroundColor: '#0f1117', color: '#e2e8f0', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', 'Segoe UI', sans-serif" },
  header:        { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 40px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'linear-gradient(135deg, rgba(59,130,246,0.06) 0%, rgba(99,102,241,0.06) 100%)' },
  title:         { margin: 0, fontSize: '1.6rem', fontWeight: 700, background: 'linear-gradient(135deg, #93c5fd, #c4b5fd)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  subtitle:      { margin: '6px 0 0', color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.6 },
  backBtn:       { padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem', flexShrink: 0 },
  skipBtn:       { padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem', flexShrink: 0 },
  body:          { flex: 1, maxWidth: '860px', width: '100%', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '20px' },
  card:          { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px', backdropFilter: 'blur(4px)' },
  cardTitle:     { margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 600, color: '#f1f5f9', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px' },
  dirBadge:      { display: 'inline-block', padding: '4px 12px', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '20px', fontSize: '0.82rem', color: '#93c5fd', wordBreak: 'break-all' },
  hint:          { margin: 0, color: '#64748b', fontSize: '0.9rem' },
  progressTrack: { height: '8px', background: 'rgba(255,255,255,0.07)', borderRadius: '999px', overflow: 'hidden', marginBottom: '10px' },
  progressBar:   { height: '100%', borderRadius: '999px', transition: 'width 0.3s ease' },
  progressMeta:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  statsRow:      { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  code:          { background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '6px', fontSize: '0.82rem', color: '#7dd3fc', wordBreak: 'break-all' },
  failedList:    { maxHeight: '180px', overflowY: 'auto', background: 'rgba(239,68,68,0.05)', borderRadius: '8px', padding: '8px' },
  failedItem:    { padding: '5px 8px', fontSize: '0.8rem', color: '#fca5a5', wordBreak: 'break-all', borderBottom: '1px solid rgba(239,68,68,0.1)' },
  actions:       { display: 'flex', gap: '14px', justifyContent: 'center', paddingTop: '8px', flexWrap: 'wrap' },
  primaryBtn:    { padding: '14px 36px', fontSize: '1rem', fontWeight: 700, background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: '#fff', border: 'none', borderRadius: '30px', cursor: 'pointer', boxShadow: '0 4px 20px rgba(99,102,241,0.35)', transition: 'all 0.2s' },
  secondaryBtn:  { padding: '14px 28px', fontSize: '1rem', fontWeight: 600, background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '30px', cursor: 'pointer', transition: 'all 0.2s' },
  cancelBtn:     { padding: '14px 28px', fontSize: '1rem', fontWeight: 600, background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '30px', cursor: 'pointer', transition: 'all 0.2s' },
};

export default ScanView;
