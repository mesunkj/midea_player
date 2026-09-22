/**
 * AnnotationView.tsx — Android 版本
 *
 * 失敗圖檔手動標註介面（Mobile 觸控最佳化）。
 * Android 差異：
 *   - DB 操作透過 platform.ts（Capacitor Preferences）
 *   - 圖片直接使用 URI（不需 imageToBase64 IPC）
 *   - 垂直堆疊佈局（行動裝置適配）
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ViewportCanvas, { NormalizedRect } from '../components/ViewportCanvas';
import { loadViewportDb, updateViewportEntry, batchCheckoutViewport } from '../platform';
import type { ViewportDb } from '../platform';

interface Props {
  directories: string[];
  dbRootDir:   string;
  onBack:      () => void;
  onDone:      () => void;
}

const getBasename = (path: string) =>
  path.replace(/\\/g, '/').split('/').pop() ?? path;

const AnnotationView: React.FC<Props> = ({ directories, dbRootDir, onBack, onDone }) => {
  const effectiveRoot = dbRootDir.trim() || (directories.length > 0 ? 'midea_player_db' : '');

  const [failedFiles, setFailedFiles] = useState<string[]>([]);
  const [currentIdx,  setCurrentIdx]  = useState(0);
  const [selection,   setSelection]   = useState<NormalizedRect | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [confirmedN,  setConfirmedN]  = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [allDone,     setAllDone]     = useState(false);
  const [lastAction,  setLastAction]  = useState<string | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);

  // ── 載入 DB 提取 failedFiles ──────────────────────────────────────────────
  useEffect(() => {
    if (!effectiveRoot) { setLoading(false); return; }

    loadViewportDb(effectiveRoot).then((db: ViewportDb | null) => {
      const files = db?.failedFiles ?? [];
      setFailedFiles(files);
      setCurrentIdx(0);
      setLoading(false);
      if (files.length === 0) setAllDone(true);
    }).catch(() => setLoading(false));
  }, [effectiveRoot]);

  const handleClear = useCallback(() => setSelection(null), []);

  const removeAndAdvance = useCallback((removedPath: string, count = 1) => {
    setFailedFiles(prev => {
      const next = prev.filter(p => p !== removedPath);
      if (next.length === 0) setAllDone(true);
      else setCurrentIdx(i => Math.min(i, next.length - 1));
      return next;
    });
    setConfirmedN(n => n + count);
    setSelection(null);
    setSaving(false);
  }, []);

  const removeByBasename = useCallback((basename: string, count: number) => {
    setFailedFiles(prev => {
      const next = prev.filter(p => getBasename(p) !== basename);
      if (next.length === 0) setAllDone(true);
      else setCurrentIdx(i => Math.min(i, next.length - 1));
      return next;
    });
    setConfirmedN(n => n + count);
    setSelection(null);
    setSaving(false);
  }, []);

  // ── 確認標註 ──────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!selection || saving || !effectiveRoot) return;
    const imagePath = failedFiles[currentIdx];
    setSaving(true);

    const entry = {
      status: 'manual' as const,
      cropX: selection.x, cropY: selection.y,
      cropW: selection.w, cropH: selection.h,
    };

    try {
      await updateViewportEntry(effectiveRoot, imagePath, entry);
      setLastAction(`✅ 已標註 ${getBasename(imagePath)}`);
    } catch (e) {
      console.error('[Annotation] confirm failed:', e);
    }
    removeAndAdvance(imagePath);
  };

  // ── Check-out（單張維持原圖）──────────────────────────────────────────────
  const handleCheckout = async () => {
    if (saving || !effectiveRoot) return;
    const imagePath = failedFiles[currentIdx];
    setSaving(true);

    const entry = { status: 'unchanged' as const, cropX: 0, cropY: 0, cropW: 1, cropH: 1 };
    try {
      await updateViewportEntry(effectiveRoot, imagePath, entry);
      setLastAction(`🖼 Check-out：${getBasename(imagePath)} 已設為原圖`);
    } catch (e) {
      console.error('[Annotation] checkout failed:', e);
    }
    removeAndAdvance(imagePath);
  };

  // ── 全域 Check-out ─────────────────────────────────────────────────────────
  const handleBatchCheckout = async () => {
    if (saving || !effectiveRoot) return;
    const imagePath = failedFiles[currentIdx];
    const basename  = getBasename(imagePath);
    setSaving(true);

    try {
      await batchCheckoutViewport(effectiveRoot, basename);
      const count = failedFiles.filter(p => getBasename(p) === basename).length;
      setLastAction(`♻ 全域 Check-out：「${basename}」共 ${count} 筆`);
      removeByBasename(basename, count);
    } catch (e) {
      console.error('[Annotation] batchCheckout failed:', e);
      setSaving(false);
    }
  };

  const handleSkip = () => {
    setSelection(null);
    setCurrentIdx(i => (i + 1) % failedFiles.length);
  };

  // ── 狀態畫面 ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ ...S.root, justifyContent: 'center', alignItems: 'center' }}>
        <div style={S.spinner} />
        <p style={{ color: '#94a3b8', marginTop: '16px' }}>載入資料庫...</p>
        <style>{spinStyle}</style>
      </div>
    );
  }

  if (allDone) {
    return (
      <div style={{ ...S.root, justifyContent: 'center', alignItems: 'center', gap: '20px', padding: '40px' }}>
        <div style={{ fontSize: '4rem' }}>🎉</div>
        <h2 style={{ color: '#22c55e', margin: 0, textAlign: 'center' }}>所有失敗圖檔已標註完成！</h2>
        <p style={{ color: '#94a3b8' }}>共完成 {confirmedN} 張標註/Check-out。</p>
        <button onClick={onDone} style={S.primaryBtn}>▶ 返回播放</button>
      </div>
    );
  }

  if (failedFiles.length === 0) {
    return (
      <div style={{ ...S.root, justifyContent: 'center', alignItems: 'center', gap: '16px' }}>
        <div style={{ fontSize: '3rem' }}>✅</div>
        <h2 style={{ color: '#22c55e', margin: 0 }}>沒有需要標註的失敗圖片</h2>
        <button onClick={onBack} style={S.secondaryBtn}>← 返回</button>
      </div>
    );
  }

  const currentPath = failedFiles[currentIdx];
  const fileName    = getBasename(currentPath);

  return (
    <div style={S.root}>

      {/* 頂部導覽列 */}
      <div style={S.header}>
        <button onClick={onBack} style={S.backBtn}>←</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <h1 style={S.title}>🖊 手動標註</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem' }}>
            {currentIdx + 1} / {failedFiles.length}　已完成 {confirmedN} 張
          </p>
        </div>
        <button onClick={handleSkip} style={S.backBtn}>跳過⏭</button>
      </div>

      {/* 操作回饋 */}
      {lastAction && (
        <div style={S.feedbackBadge}>{lastAction}</div>
      )}

      {/* 圖片 + 畫布（佔主要空間） */}
      <div style={S.imageWrapper}>
        <img
          ref={imgRef}
          src={currentPath}
          alt={fileName}
          style={S.image}
          draggable={false}
        />
        <ViewportCanvas
          imgRef={imgRef}
          hasSelection={!!selection}
          onSelect={setSelection}
          onClear={handleClear}
        />
        {selection && (
          <div style={S.coordLabel}>
            x:{(selection.x * 100).toFixed(1)}%&nbsp;
            y:{(selection.y * 100).toFixed(1)}%&nbsp;
            w:{(selection.w * 100).toFixed(1)}%&nbsp;
            h:{(selection.h * 100).toFixed(1)}%
          </div>
        )}
      </div>

      {/* 操作按鈕區（底部） */}
      <div style={S.actionArea}>

        {/* 導覽 */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <button
            onClick={() => { setCurrentIdx(i => Math.max(0, i - 1)); setSelection(null); }}
            disabled={currentIdx === 0}
            style={{ ...S.navBtn, opacity: currentIdx === 0 ? 0.4 : 1 }}
          >← 上一張</button>
          <button
            onClick={() => { setCurrentIdx(i => Math.min(failedFiles.length - 1, i + 1)); setSelection(null); }}
            disabled={currentIdx >= failedFiles.length - 1}
            style={{ ...S.navBtn, opacity: currentIdx >= failedFiles.length - 1 ? 0.4 : 1 }}
          >下一張 →</button>
        </div>

        {/* 確認標註 */}
        <button
          onClick={handleConfirm}
          disabled={!selection || saving}
          style={{ ...S.primaryBtn, opacity: (!selection || saving) ? 0.4 : 1, marginBottom: '6px' }}
        >
          {saving ? '儲存中...' : '✅ 確認標註（手動 Viewport）'}
        </button>

        {/* 清除選取 */}
        {selection && (
          <button onClick={handleClear} style={{ ...S.secondaryBtn, marginBottom: '6px' }}>
            ↩ 清除選取
          </button>
        )}

        {/* 分隔線 */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px', display: 'flex', gap: '8px' }}>
          {/* 單張 Check-out */}
          <button
            onClick={handleCheckout}
            disabled={saving}
            style={{ ...S.checkoutBtn, flex: 1, opacity: saving ? 0.5 : 1 }}
          >
            🖼 原圖
          </button>

          {/* 全域 Check-out */}
          <button
            onClick={handleBatchCheckout}
            disabled={saving}
            style={{ ...S.globalCheckoutBtn, flex: 2, opacity: saving ? 0.5 : 1 }}
          >
            ♻ 全域「{fileName}」
          </button>
        </div>

      </div>
    </div>
  );
};

// ─── 樣式 ─────────────────────────────────────────────────────────────────────

const spinStyle = `@keyframes spin { to { transform: rotate(360deg); } }`;

const S: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh', backgroundColor: '#0f1117', color: '#e2e8f0',
    display: 'flex', flexDirection: 'column',
    fontFamily: "'Inter', 'Noto Sans TC', sans-serif",
  },
  header: {
    display: 'flex', alignItems: 'center', padding: 'env(safe-area-inset-top, 12px) 12px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'linear-gradient(135deg, rgba(217,119,6,0.06) 0%, rgba(245,158,11,0.06) 100%)',
    gap: '8px',
  },
  title: { margin: 0, fontSize: '1.1rem', fontWeight: 700, background: 'linear-gradient(135deg, #fcd34d, #f97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  backBtn: {
    padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem',
    minWidth: '44px', minHeight: '44px',
  },
  feedbackBadge: {
    margin: '8px 12px 0', padding: '10px 14px', borderRadius: '10px', fontSize: '0.85rem',
    background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#86efac',
  },
  imageWrapper: {
    flex: '1 1 auto', position: 'relative',
    background: '#0a0a14', display: 'flex',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    minHeight: '200px',
  },
  image: {
    maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
    display: 'block', userSelect: 'none', pointerEvents: 'none',
  },
  coordLabel: {
    position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.75)', color: '#00ff88', fontSize: '0.72rem',
    padding: '3px 12px', borderRadius: '20px', whiteSpace: 'nowrap', pointerEvents: 'none',
  },
  actionArea: {
    padding: '12px 12px calc(env(safe-area-inset-bottom, 0px) + 12px)',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    display: 'flex', flexDirection: 'column', gap: '0',
  },
  navBtn: {
    flex: 1, padding: '12px', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.09)', borderRadius: '10px',
    color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem', minHeight: '48px',
  },
  primaryBtn: {
    padding: '14px', fontSize: '0.95rem', fontWeight: 700,
    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
    color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer',
    minHeight: '52px',
  },
  secondaryBtn: {
    padding: '12px', fontSize: '0.9rem', fontWeight: 500,
    background: 'rgba(255,255,255,0.04)', color: '#94a3b8',
    border: '1px solid rgba(255,255,255,0.09)', borderRadius: '12px', cursor: 'pointer',
    minHeight: '48px',
  },
  checkoutBtn: {
    padding: '12px 8px', fontSize: '0.85rem', fontWeight: 600,
    background: 'rgba(59,130,246,0.1)', color: '#93c5fd',
    border: '1px solid rgba(59,130,246,0.25)', borderRadius: '10px', cursor: 'pointer',
    minHeight: '48px',
  },
  globalCheckoutBtn: {
    padding: '12px 8px', fontSize: '0.82rem', fontWeight: 600,
    background: 'rgba(6,182,212,0.1)', color: '#67e8f9',
    border: '1px solid rgba(6,182,212,0.25)', borderRadius: '10px', cursor: 'pointer',
    minHeight: '48px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  spinner: {
    width: '40px', height: '40px', borderRadius: '50%',
    border: '3px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1',
    animation: 'spin 1s linear infinite',
  },
};

export default AnnotationView;
