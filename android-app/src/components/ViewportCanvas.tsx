/**
 * ViewportCanvas.tsx — Android 版本
 *
 * 疊加在圖片上的互動選取畫布，支援觸控操作。
 * Android 差異：
 *   - 新增 onTouchStart/onTouchMove/onTouchEnd 事件處理
 *   - 滑鼠事件仍保留（供桌機測試）
 *   - 觸控模式：單指拖曳選取區域
 */

import React, { useRef, useState, useCallback } from 'react';

export interface NormalizedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CanvasPt {
  x: number;
  y: number;
}

interface Props {
  imgRef:       React.RefObject<HTMLImageElement>;
  hasSelection: boolean;
  onSelect:     (rect: NormalizedRect) => void;
  onClear:      () => void;
}

const DRAG_THRESHOLD = 8;
const dist = (a: CanvasPt, b: CanvasPt) =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

const ViewportCanvas: React.FC<Props> = ({ imgRef, hasSelection, onSelect, onClear }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const [isDragging,     setIsDragging]     = useState(false);
  const [dragStart,      setDragStart]      = useState<CanvasPt | null>(null);
  const [dragEnd,        setDragEnd]        = useState<CanvasPt | null>(null);
  const [firstClick,     setFirstClick]     = useState<CanvasPt | null>(null);
  const [hoverPt,        setHoverPt]        = useState<CanvasPt | null>(null);
  const [confirmedStart, setConfirmedStart] = useState<CanvasPt | null>(null);
  const [confirmedEnd,   setConfirmedEnd]   = useState<CanvasPt | null>(null);

  const downPtRef = useRef<CanvasPt | null>(null);

  // ── 工具：clientX/Y → 容器相對座標（夾緊到圖片邊界） ─────────────────────────
  const toCanvasPt = useCallback((clientX: number, clientY: number): CanvasPt | null => {
    const imgEl       = imgRef.current;
    const containerEl = containerRef.current;
    if (!imgEl || !containerEl) return null;

    const imgRect       = imgEl.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();

    const imgRelX = Math.max(0, Math.min(clientX - imgRect.left, imgRect.width));
    const imgRelY = Math.max(0, Math.min(clientY - imgRect.top,  imgRect.height));

    return {
      x: (imgRect.left - containerRect.left) + imgRelX,
      y: (imgRect.top  - containerRect.top)  + imgRelY,
    };
  }, [imgRef]);

  // ── 計算正規化矩形 ──────────────────────────────────────────────────────────
  const computeNormalized = useCallback((a: CanvasPt, b: CanvasPt): NormalizedRect | null => {
    const imgEl       = imgRef.current;
    const containerEl = containerRef.current;
    if (!imgEl || !containerEl) return null;

    const imgRect       = imgEl.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();
    if (imgRect.width === 0 || imgRect.height === 0) return null;

    const offX = imgRect.left - containerRect.left;
    const offY = imgRect.top  - containerRect.top;

    const ax = a.x - offX, ay = a.y - offY;
    const bx = b.x - offX, by = b.y - offY;

    return {
      x: Math.max(0, Math.min(ax, bx) / imgRect.width),
      y: Math.max(0, Math.min(ay, by) / imgRect.height),
      w: Math.min(1, Math.abs(bx - ax) / imgRect.width),
      h: Math.min(1, Math.abs(by - ay) / imgRect.height),
    };
  }, [imgRef]);

  const finalizeSelection = useCallback((a: CanvasPt, b: CanvasPt) => {
    const rect = computeNormalized(a, b);
    if (rect && rect.w > 0.01 && rect.h > 0.01) {
      setConfirmedStart(a);
      setConfirmedEnd(b);
      onSelect(rect);
    } else {
      handleClear();
    }
  }, [computeNormalized, onSelect]);

  const handleClear = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
    setFirstClick(null);
    setHoverPt(null);
    setConfirmedStart(null);
    setConfirmedEnd(null);
    onClear();
  }, [onClear]);

  // ── 滑鼠事件 ───────────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const pt = toCanvasPt(e.clientX, e.clientY);
    if (!pt) return;

    if (firstClick) { downPtRef.current = pt; return; }

    downPtRef.current = pt;
    setDragStart(pt); setDragEnd(pt); setIsDragging(true);
    setConfirmedStart(null); setConfirmedEnd(null);
    onClear();
  }, [toCanvasPt, firstClick, onClear]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const pt = toCanvasPt(e.clientX, e.clientY);
    if (!pt) return;
    if (isDragging) setDragEnd(pt);
    else if (firstClick) setHoverPt(pt);
  }, [toCanvasPt, isDragging, firstClick]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const pt = toCanvasPt(e.clientX, e.clientY);
    if (!pt) return;

    if (firstClick && !isDragging) {
      setFirstClick(null); setHoverPt(null);
      finalizeSelection(firstClick, pt);
      return;
    }

    if (!isDragging || !dragStart) return;
    setIsDragging(false); setDragStart(null); setDragEnd(null);

    const downPt   = downPtRef.current;
    const movement = downPt ? dist(downPt, pt) : 0;

    if (movement > DRAG_THRESHOLD) {
      finalizeSelection(downPt!, pt);
    } else {
      setFirstClick(downPt!);
      setHoverPt(pt);
      setConfirmedStart(null); setConfirmedEnd(null);
    }
  }, [toCanvasPt, isDragging, dragStart, firstClick, finalizeSelection]);

  const handleMouseLeave = useCallback(() => {
    if (isDragging && dragStart && dragEnd) {
      setIsDragging(false); setDragStart(null); setDragEnd(null);
      finalizeSelection(dragStart, dragEnd);
    }
    setHoverPt(null);
  }, [isDragging, dragStart, dragEnd, finalizeSelection]);

  // ── 觸控事件（Android 主要操作方式）──────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    const pt = toCanvasPt(touch.clientX, touch.clientY);
    if (!pt) return;

    downPtRef.current = pt;
    setDragStart(pt); setDragEnd(pt); setIsDragging(true);
    setFirstClick(null); setHoverPt(null);
    setConfirmedStart(null); setConfirmedEnd(null);
    onClear();
  }, [toCanvasPt, onClear]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    const pt = toCanvasPt(touch.clientX, touch.clientY);
    if (!pt) return;
    if (isDragging) setDragEnd(pt);
  }, [toCanvasPt, isDragging]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const pt = toCanvasPt(touch.clientX, touch.clientY);
    if (!pt || !dragStart) return;

    setIsDragging(false); setDragStart(null); setDragEnd(null);

    const downPt   = downPtRef.current;
    const movement = downPt ? dist(downPt, pt) : 0;

    if (movement > DRAG_THRESHOLD) {
      finalizeSelection(downPt!, pt);
    }
    // 觸控不使用兩點點擊模式（體驗較差）
  }, [toCanvasPt, isDragging, dragStart, finalizeSelection]);

  // ── 虛線框計算 ──────────────────────────────────────────────────────────────
  const getLiveDashedStyle = (): React.CSSProperties | null => {
    const a = isDragging ? dragStart : firstClick;
    const b = isDragging ? dragEnd   : hoverPt;
    if (!a || !b) return null;
    return {
      left:   Math.min(a.x, b.x),
      top:    Math.min(a.y, b.y),
      width:  Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
    };
  };

  const getConfirmedStyle = (): React.CSSProperties | null => {
    if (!confirmedStart || !confirmedEnd || !hasSelection) return null;
    return {
      left:   Math.min(confirmedStart.x, confirmedEnd.x),
      top:    Math.min(confirmedStart.y, confirmedEnd.y),
      width:  Math.abs(confirmedEnd.x - confirmedStart.x),
      height: Math.abs(confirmedEnd.y - confirmedStart.y),
    };
  };

  const liveDashed   = getLiveDashedStyle();
  const confirmedBox = getConfirmedStyle();

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ position: 'absolute', inset: 0, cursor: 'crosshair', userSelect: 'none', zIndex: 10, touchAction: 'none' }}
    >
      {/* 起點標記（兩點模式，PC 使用） */}
      {firstClick && !isDragging && (
        <div style={{
          position: 'absolute',
          left: firstClick.x - 6, top: firstClick.y - 6,
          width: 12, height: 12, borderRadius: '50%',
          background: '#00ff88', boxShadow: '0 0 8px #00ff88',
          pointerEvents: 'none',
        }} />
      )}

      {/* 即時虛線框 */}
      {liveDashed && (
        <div style={{
          position: 'absolute',
          left: liveDashed.left, top: liveDashed.top,
          width: liveDashed.width, height: liveDashed.height,
          border: '2px dashed #00ff88',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
          pointerEvents: 'none', boxSizing: 'border-box',
        }} />
      )}

      {/* 確認後的實線框 */}
      {confirmedBox && (
        <div style={{
          position: 'absolute',
          left: confirmedBox.left, top: confirmedBox.top,
          width: confirmedBox.width, height: confirmedBox.height,
          border: '2px solid #00ff88',
          background: 'rgba(0,255,136,0.07)',
          pointerEvents: 'none', boxSizing: 'border-box',
        }} />
      )}

      {/* 兩點模式提示（PC） */}
      {firstClick && !isDragging && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.75)', color: '#00ff88',
          padding: '4px 14px', borderRadius: '20px',
          fontSize: '0.78rem', pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          ✦ 第一點已設定 — 點擊第二點完成選取
        </div>
      )}

      {/* 觸控提示 */}
      {!isDragging && !confirmedBox && !firstClick && (
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.6)', color: 'rgba(0,255,136,0.7)',
          padding: '4px 14px', borderRadius: '20px',
          fontSize: '0.75rem', pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          👆 手指拖曳選取 Viewport
        </div>
      )}
    </div>
  );
};

export default ViewportCanvas;
