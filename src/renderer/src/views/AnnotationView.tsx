/**
 * AnnotationView.tsx
 *
 * 失敗圖檔手動標註介面（Manual Viewport Annotation Tool）。
 * 實作規格：sp2.md + sp4.md
 *
 * 功能：
 * - 從 DB 讀取 failedFiles，逐一顯示
 * - 拖曳 or 兩點點擊 選取 Viewport（ViewportCanvas）
 * - 確認標註：status 設為 'manual'，從 failedFiles 移除
 * - Check-out（維持原圖）：單張 x:0,y:0,w:1,h:1（status: 'unchanged'）
 * - 全域 Check-out：批次套用相同 basename 的所有圖片
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ViewportCanvas, { NormalizedRect } from '../components/ViewportCanvas';
import type { ViewportDb } from '../hooks/useViewportDb';

interface Props {
  directories: string[];
  dbRootDir:   string;
  onBack:      () => void;
  onDone:      () => void;
}

const getBasename = (path: string) =>
  path.replace(/\\/g, '/').split('/').pop() ?? path;

const AnnotationView: React.FC<Props> = ({ directories, dbRootDir, onBack, onDone }) => {
  const effectiveRoot = dbRootDir.trim() || (directories.length > 0 ? directories[0] : '');

  const [failedFiles,  setFailedFiles]  = useState<string[]>([]);
  const [currentIdx,   setCurrentIdx]   = useState(0);
  const [selection,    setSelection]    = useState<NormalizedRect | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [confirmedN,   setConfirmedN]   = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [imgSrc,       setImgSrc]       = useState<string | null>(null);
  const [loadingImg,   setLoadingImg]   = useState(false);
  const [allDone,      setAllDone]      = useState(false);
  const [lastAction,   setLastAction]   = useState<string | null>(null); // 操作回饋訊息

  const imgRef = useRef<HTMLImageElement>(null);

  // ── 載入 DB，提取 failedFiles ─────────────────────────────────────────────
  useEffect(() => {
    if (!effectiveRoot) { setLoading(false); return; }
    const api = (window as any).electronAPI;
    if (!api?.loadViewportDb) { setLoading(false); return; }

    api.loadViewportDb(effectiveRoot).then((db: ViewportDb | null) => {
      const files = db?.failedFiles ?? [];
      setFailedFiles(files);
      setCurrentIdx(0);
      setLoading(false);
      if (files.length === 0) setAllDone(true);
    }).catch(() => setLoading(false));
  }, [effectiveRoot]);

  // ── 載入當前圖片 ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (failedFiles.length === 0 || currentIdx >= failedFiles.length) return;
    const rawPath = failedFiles[currentIdx];

    setImgSrc(null);
    setLoadingImg(true);
    setSelection(null);

    const api = (window as any).electronAPI;
    if (!api?.imageToBase64) {
      // fallback: try local-resource://
      setImgSrc(`local-resource://${rawPath.replace(/\\/g, '/')}`);
      setLoadingImg(false);
      return;
    }

    api.imageToBase64(rawPath).then((dataUrl: string | null) => {
      setImgSrc(dataUrl);
      setLoadingImg(false);
    }).catch(() => setLoadingImg(false));
  }, [currentIdx, failedFiles]);

  // ── 清除選取 ──────────────────────────────────────────────────────────────
  const handleClear = useCallback(() => setSelection(null), []);

  // ── 移除圖片並前進 ────────────────────────────────────────────────────────
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

  // ── 確認標註（手動 Viewport）─────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!selection || saving || !effectiveRoot) return;
    const imagePath = failedFiles[currentIdx];
    setSaving(true);

    const entry = {
      status: 'manual',
      cropX: selection.x, cropY: selection.y,
      cropW: selection.w, cropH: selection.h,
    };

    try {
      await (window as any).electronAPI?.updateViewportEntry?.(effectiveRoot, imagePath, entry);
      setLastAction(`✅ 已標註 ${getBasename(imagePath)}`);
    } catch (e) {
      console.error('[Annotation] confirm failed:', e);
    }
    removeAndAdvance(imagePath);
  };

  // ── Check-out（單張維持原圖）────────────────────────────────────────────
  const handleCheckout = async () => {
    if (saving || !effectiveRoot) return;
    const imagePath = failedFiles[currentIdx];
    setSaving(true);

    const entry = { status: 'unchanged', cropX: 0, cropY: 0, cropW: 1, cropH: 1 };
    try {
      await (window as any).electronAPI?.updateViewportEntry?.(effectiveRoot, imagePath, entry);
      setLastAction(`🖼 Check-out：${getBasename(imagePath)} 已設為原圖`);
    } catch (e) {
      console.error('[Annotation] checkout failed:', e);
    }
    removeAndAdvance(imagePath);
  };

  // ── 全域 Check-out（所有相同 basename）──────────────────────────────────
  const handleBatchCheckout = async () => {
    if (saving || !effectiveRoot) return;
    const imagePath = failedFiles[currentIdx];
    const basename  = getBasename(imagePath);
    setSaving(true);

    try {
      const res = await (window as any).electronAPI?.batchCheckoutViewport?.(effectiveRoot, basename);
      const count = res?.count ?? 1;
      setLastAction(`♻ 全域 Check-out：「${basename}」共 ${count} 筆已設為原圖`);
      removeByBasename(basename, count);
    } catch (e) {
      console.error('[Annotation] batchCheckout failed:', e);
      setSaving(false);
    }
  };

  // ── 跳過 ─────────────────────────────────────────────────────────────────
  const handleSkip = () => {
    setSelection(null);
    setCurrentIdx(i => (i + 1) % failedFiles.length);
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ ...S.root, justifyContent: 'center', alignItems: 'center' }}>
        <p style={{ color: '#94a3b8', fontSize: '1.2rem' }}>⏳ 載入資料庫...</p>
      </div>
    );
  }

  if (allDone) {
    return (
      <div style={{ ...S.root, justifyContent: 'center', alignItems: 'center', gap: '20px' }}>
        <div style={{ fontSize: '4rem' }}>🎉</div>
        <h2 style={{ color: '#22c55e', margin: 0 }}>所有失敗圖檔已標註完成！</h2>
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

      {/* ── 頂部標題列 ── */}
      <div style={S.header}>
        <button onClick={onBack} style={S.backBtn}>← 返回</button>
        <div style={{ textAlign: 'center' }}>
          <h1 style={S.title}>🖊 手動 Viewport 標註</h1>
          <p style={S.subtitle}>
            拖曳或兩點點擊選取 Viewport，確認後儲存；或直接 Check-out 維持原圖
          </p>
        </div>
        <div style={{ color: '#64748b', fontSize: '0.9rem', textAlign: 'right', flexShrink: 0 }}>
          <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '1.2rem' }}>
            {currentIdx + 1} / {failedFiles.length}
          </div>
          <div>已完成 {confirmedN} 張</div>
        </div>
      </div>

      {/* ── 主體 ── */}
      <div style={S.body}>

        {/* 左側：圖片 + 畫布 */}
        <div style={S.canvasPanel}>
          <div style={S.imageWrapper}>
            {loadingImg ? (
              <div style={S.placeholder}>⏳ 載入圖片...</div>
            ) : imgSrc ? (
              <>
                <img
                  ref={imgRef}
                  src={imgSrc}
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
                {/* 座標即時顯示 */}
                {selection && (
                  <div style={S.coordLabel}>
                    x:{(selection.x * 100).toFixed(1)}%&nbsp;
                    y:{(selection.y * 100).toFixed(1)}%&nbsp;
                    w:{(selection.w * 100).toFixed(1)}%&nbsp;
                    h:{(selection.h * 100).toFixed(1)}%
                  </div>
                )}
              </>
            ) : (
              <div style={S.placeholder}>❌ 無法載入圖片</div>
            )}
          </div>
          <p style={S.tip}>
            💡 <strong>拖曳</strong>或<strong>兩點點擊</strong>選取範圍（支援任意方向）。
            按 Check-out 可跳過 AI 直接使用原圖。
          </p>
        </div>

        {/* 右側：控制面板 */}
        <div style={S.controlPanel}>

          {/* 操作回饋 */}
          {lastAction && (
            <div style={S.feedbackBadge}>{lastAction}</div>
          )}

          {/* 圖片資訊 */}
          <div style={S.infoCard}>
            <div style={S.infoLabel}>檔案名稱</div>
            <div style={S.infoValue}>{fileName}</div>
            <div style={{ ...S.infoLabel, marginTop: '10px' }}>完整路徑</div>
            <div style={{ ...S.infoValue, fontSize: '0.76rem', color: '#475569', wordBreak: 'break-all' }}>
              {currentPath}
            </div>
          </div>

          {/* 選取狀態 */}
          <div style={S.infoCard}>
            <div style={S.infoLabel}>選取狀態</div>
            {selection ? (
              <div style={{ color: '#22c55e', fontWeight: 600, fontSize: '0.95rem', marginTop: '8px' }}>
                ✅ 已選取 Viewport
                <div style={{ color: '#86efac', fontSize: '0.8rem', marginTop: '4px' }}>
                  左:{(selection.x*100).toFixed(1)}%  上:{(selection.y*100).toFixed(1)}%<br/>
                  寬:{(selection.w*100).toFixed(1)}%  高:{(selection.h*100).toFixed(1)}%
                </div>
              </div>
            ) : (
              <div style={{ color: '#475569', fontSize: '0.88rem', marginTop: '8px' }}>
                請在圖片上拖曳或點擊兩點選取
              </div>
            )}
          </div>

          {/* 導覽 */}
          <div style={{ display: 'flex', gap: '8px' }}>
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

          {/* ── 確認標註 ── */}
          <button
            onClick={handleConfirm}
            disabled={!selection || saving}
            style={{
              ...S.primaryBtn,
              opacity: (!selection || saving) ? 0.45 : 1,
              cursor:  (!selection || saving) ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? '儲存中...' : '✅ 確認標註（手動 Viewport）'}
          </button>

          {/* ── 復原 ── */}
          <button
            onClick={() => { handleClear(); }}
            disabled={!selection}
            style={{ ...S.secondaryBtn, opacity: !selection ? 0.4 : 1, cursor: !selection ? 'not-allowed' : 'pointer' }}
          >
            ↩ 復原（清除選取）
          </button>

          {/* ── 分隔線 ── */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
            <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '10px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Check-out（維持原圖）
            </div>

            {/* 單張 Check-out */}
            <button
              onClick={handleCheckout}
              disabled={saving}
              style={{
                ...S.checkoutBtn,
                marginBottom: '8px',
                opacity: saving ? 0.5 : 1,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              🖼 Check-out — 此圖維持原圖 (1:1)
            </button>

            {/* 全域 Check-out（跨 Model 批次） */}
            <button
              onClick={handleBatchCheckout}
              disabled={saving}
              style={{
                ...S.globalCheckoutBtn,
                opacity: saving ? 0.5 : 1,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              ♻ 全域 Check-out — 所有「{fileName}」同步套用
            </button>
            <p style={{ color: '#475569', fontSize: '0.76rem', margin: '6px 0 0' }}>
              套用於 DB 中所有相同檔名的圖片（跨 Model）
            </p>
          </div>

          {/* 跳過 */}
          <button onClick={handleSkip} style={S.skipBtn}>⏭ 跳過此張</button>

          {/* 進度條 */}
          <div style={{ marginTop: 'auto' }}>
            <div style={{ color: '#475569', fontSize: '0.8rem', marginBottom: '6px' }}>
              剩餘 {failedFiles.length} 張待處理
            </div>
            <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: '999px',
                background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                width: `${confirmedN > 0 ? (confirmedN / (confirmedN + failedFiles.length)) * 100 : 0}%`,
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

// ─── 樣式 ─────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh', backgroundColor: '#0f1117', color: '#e2e8f0',
    display: 'flex', flexDirection: 'column',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'linear-gradient(135deg, rgba(217,119,6,0.06) 0%, rgba(245,158,11,0.06) 100%)',
    gap: '16px',
  },
  title:   { margin: 0, fontSize: '1.4rem', fontWeight: 700, background: 'linear-gradient(135deg, #fcd34d, #f97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  subtitle:{ margin: '4px 0 0', color: '#64748b', fontSize: '0.82rem' },
  backBtn: { padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#94a3b8', cursor: 'pointer', fontSize: '0.88rem', flexShrink: 0 },
  body: {
    flex: 1, display: 'flex', gap: '20px', padding: '20px',
    maxWidth: '1400px', margin: '0 auto', width: '100%', boxSizing: 'border-box',
  },
  canvasPanel:  { flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 },
  imageWrapper: {
    position: 'relative', flex: '1 1 auto',
    background: '#0a0a14', borderRadius: '12px', overflow: 'hidden',
    minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  image: {
    maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block',
    userSelect: 'none', pointerEvents: 'none', borderRadius: '4px',
  },
  placeholder: { color: '#475569', fontSize: '1rem' },
  coordLabel: {
    position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.75)', color: '#00ff88', fontSize: '0.75rem',
    padding: '3px 12px', borderRadius: '20px', whiteSpace: 'nowrap', pointerEvents: 'none',
  },
  tip: { color: '#475569', fontSize: '0.8rem', margin: 0, textAlign: 'center' },
  controlPanel: { width: '290px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '12px' },
  feedbackBadge: {
    padding: '10px 14px', borderRadius: '10px', fontSize: '0.82rem',
    background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#86efac',
  },
  infoCard:  { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '14px' },
  infoLabel: { color: '#475569', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' },
  infoValue: { color: '#e2e8f0', fontSize: '0.9rem', marginTop: '5px', fontWeight: 500 },
  navBtn: {
    flex: 1, padding: '9px', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.09)', borderRadius: '8px',
    color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem',
  },
  primaryBtn: {
    padding: '13px', fontSize: '0.92rem', fontWeight: 700,
    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
    color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer',
    boxShadow: '0 3px 14px rgba(34,197,94,0.28)', transition: 'all 0.2s',
  },
  secondaryBtn: {
    padding: '10px', fontSize: '0.88rem', fontWeight: 500,
    background: 'rgba(255,255,255,0.04)', color: '#94a3b8',
    border: '1px solid rgba(255,255,255,0.09)', borderRadius: '10px', cursor: 'pointer',
  },
  checkoutBtn: {
    width: '100%', padding: '11px', fontSize: '0.88rem', fontWeight: 600,
    background: 'rgba(59,130,246,0.1)', color: '#93c5fd',
    border: '1px solid rgba(59,130,246,0.25)', borderRadius: '10px', cursor: 'pointer',
    transition: 'all 0.2s',
  },
  globalCheckoutBtn: {
    width: '100%', padding: '11px', fontSize: '0.85rem', fontWeight: 600,
    background: 'rgba(6,182,212,0.1)', color: '#67e8f9',
    border: '1px solid rgba(6,182,212,0.25)', borderRadius: '10px', cursor: 'pointer',
    transition: 'all 0.2s',
  },
  skipBtn: {
    padding: '9px', fontSize: '0.85rem',
    background: 'transparent', color: '#475569',
    border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '9px', cursor: 'pointer',
  },
};

export default AnnotationView;
