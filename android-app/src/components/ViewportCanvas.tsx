/**
 * ViewportCanvas.tsx — Android 版本
 *
 * 疊加在圖片上的互動選取畫布（觸控最佳化）。
 *
 * 支援兩種選取模式：
 *   A. 拖曳模式：觸控滑動超過 DRAG_THRESHOLD 像素後釋放
 *   B. 兩點點擊模式：第一次點擊定起點，第二次點擊定終點
 *
 * 長寬比模式（aspectRatio prop）：
 *   'none'      → 自由拖曳（預設，框色 #00ff88）
 *   'portrait'  → 鎖定 9:16 直式（框色 #a78bfa 紫）
 *   'landscape' → 鎖定 16:9 橫式（框色 #38bdf8 藍）
 *
 * Android 差異：同時處理 Touch 與 Mouse 事件
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

export type AspectRatioMode = 'none' | 'portrait' | 'landscape';

const RATIO_MAP: Record<AspectRatioMode, number | null> = {
  none:      null,
  portrait:  9 / 16,
  landscape: 16 / 9,
};

interface Props {
  imgRef:       React.RefObject<HTMLImageElement>;
  hasSelection: boolean;
  onSelect:     (rect: NormalizedRect) => void;
  onClear:      () => void;
  aspectRatio?: AspectRatioMode;
}

const DRAG_THRESHOLD = 8; // 觸控裝置設定略大的閾值

const dist = (a: CanvasPt, b: CanvasPt) =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

const ViewportCanvas: React.FC<Props> = ({
  imgRef, hasSelection, onSelect, onClear, aspectRatio = 'none',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const [isDragging,   setIsDragging]   = useState(false);
  const [dragStart,    setDragStart]    = useState<CanvasPt | null>(null);
  const [dragEnd,      setDragEnd]      = useState<CanvasPt | null>(null);
  const [firstClick,   setFirstClick]   = useState<CanvasPt | null>(null);
  const [hoverPt,      setHoverPt]      = useState<CanvasPt | null>(null);
  const [confirmedStart, setConfirmedStart] = useState<CanvasPt | null>(null);
  const [confirmedEnd,   setConfirmedEnd]   = useState<CanvasPt | null>(null);

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

  const applyAspectRatio = useCallback((a: CanvasPt, b: CanvasPt): CanvasPt => {
    const ratio = RATIO_MAP[aspectRatio];
    if (!ratio) return b;

    const imgEl       = imgRef.current;
    const containerEl = containerRef.current;
    if (!imgEl || !containerEl) return b;

    const imgRect       = imgEl.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();

    const offX = imgRect.left - containerRect.left;
    const offY = imgRect.top  - containerRect.top;

    const ax = a.x - offX, ay = a.y - offY;
    const bx = b.x - offX, by = b.y - offY;

    const signX = bx >= ax ? 1 : -1;
    const signY = by >= ay ? 1 : -1;

    const maxW = signX > 0 ? imgRect.width  - ax : ax;
    const maxH = signY > 0 ? imgRect.height - ay : ay;

    const dx = Math.abs(bx - ax);
    const dy = Math.abs(by - ay);

    let finalW: number, finalH: number;

    if (dx <= maxW && dx / ratio <= maxH) {
      finalW = dx; finalH = dx / ratio;
    } else if (dy * ratio <= maxW && dy <= maxH) {
      finalW = dy * ratio; finalH = dy;
    } else {
      finalW = Math.min(maxW, maxH * ratio);
      finalH = finalW / ratio;
    }

    return {
      x: offX + ax + signX * finalW,
      y: offY + ay + signY * finalH,
    };
  }, [imgRef, aspectRatio]);

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

  const finalizeSelection = useCallback((a: CanvasPt, b: CanvasPt) => {
    const cb = applyAspectRatio(a, b);
    const rect = computeNormalized(a, cb);
    if (rect && rect.w > 0.01 && rect.h > 0.01) {
      setConfirmedStart(a);
      setConfirmedEnd(cb);
      onSelect(rect);
    } else {
      handleClear();
    }
  }, [applyAspectRatio, computeNormalized, onSelect, handleClear]);

  const downPtRef = useRef<CanvasPt | null>(null);

  // ── Mouse 事件（桌面 fallback） ──────────────────────────────────────────────
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
    if (isDragging && dragStart) setDragEnd(applyAspectRatio(dragStart, pt));
    else if (firstClick) setHoverPt(applyAspectRatio(firstClick, pt));
  }, [toCanvasPt, isDragging, dragStart, firstClick, applyAspectRatio]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const pt = toCanvasPt(e.clientX, e.clientY);
    if (!pt) return;

    if (firstClick && !isDragging) {
      setFirstClick(null); setHoverPt(null);
      finalizeSelection(firstClick, pt); return;
    }
    if (!isDragging || !dragStart) return;
    setIsDragging(false); setDragStart(null); setDragEnd(null);

    const downPt = downPtRef.current;
    const movement = downPt ? dist(downPt, pt) : 0;
    if (movement > DRAG_THRESHOLD) {
      finalizeSelection(downPt!, pt);
    } else {
      setFirstClick(downPt!); setHoverPt(pt);
      setConfirmedStart(null); setConfirmedEnd(null);
    }
  }, [toCanvasPt, isDragging, dragStart, firstClick, finalizeSelection]);

  // ── Touch 事件（Android 原生觸控） ──────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const t = e.touches[0];
    const pt = toCanvasPt(t.clientX, t.clientY);
    if (!pt) return;

    if (firstClick) { downPtRef.current = pt; return; }

    downPtRef.current = pt;
    setDragStart(pt); setDragEnd(pt); setIsDragging(true);
    setConfirmedStart(null); setConfirmedEnd(null);
    onClear();
  }, [toCanvasPt, firstClick, onClear]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const t = e.touches[0];
    const pt = toCanvasPt(t.clientX, t.clientY);
    if (!pt) return;
    if (isDragging && dragStart) setDragEnd(applyAspectRatio(dragStart, pt));
  }, [toCanvasPt, isDragging, dragStart, applyAspectRatio]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    const pt = toCanvasPt(t.clientX, t.clientY);
    if (!pt) return;

    if (firstClick && !isDragging) {
      setFirstClick(null); setHoverPt(null);
      finalizeSelection(firstClick, pt); return;
    }
    if (!isDragging || !dragStart) return;
    setIsDragging(false); setDragStart(null); setDragEnd(null);

    const downPt = downPtRef.current;
    const movement = downPt ? dist(downPt, pt) : 0;
    if (movement > DRAG_THRESHOLD) {
      finalizeSelection(downPt!, pt);
    } else {
      setFirstClick(downPt!); setHoverPt(pt);
      setConfirmedStart(null); setConfirmedEnd(null);
    }
  }, [toCanvasPt, isDragging, dragStart, firstClick, finalizeSelection]);

  // ── CSS 框計算 ────────────────────────────────────────────────────────────────
  const getLiveDashedStyle = (): React.CSSProperties | null => {
    const a = isDragging ? dragStart : firstClick;
    const b = isDragging ? dragEnd   : hoverPt;
    if (!a || !b) return null;
    return {
      left:   Math.min(a.x, b.x), top:    Math.min(a.y, b.y),
      width:  Math.abs(b.x - a.x), height: Math.abs(b.y - a.y),
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

  const ratioColor =
    aspectRatio === 'portrait'  ? '#a78bfa' :
    aspectRatio === 'landscape' ? '#38bdf8' :
    '#00ff88';

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ position: 'absolute', inset: 0, cursor: 'crosshair', userSelect: 'none', zIndex: 10, touchAction: 'none' }}
    >
      {firstClick && !isDragging && (
        <div style={{
          position: 'absolute',
          left: firstClick.x - 6, top: firstClick.y - 6,
          width: 12, height: 12, borderRadius: '50%',
          background: ratioColor, boxShadow: `0 0 8px ${ratioColor}`,
          pointerEvents: 'none',
        }} />
      )}

      {liveDashed && (
        <div style={{
          position: 'absolute',
          left: liveDashed.left, top: liveDashed.top,
          width: liveDashed.width, height: liveDashed.height,
          border: `2px dashed ${ratioColor}`,
          boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
          pointerEvents: 'none', boxSizing: 'border-box',
        }} />
      )}

      {confirmedBox && (
        <div style={{
          position: 'absolute',
          left: confirmedBox.left, top: confirmedBox.top,
          width: confirmedBox.width, height: confirmedBox.height,
          border: `2px solid ${ratioColor}`,
          background: `${ratioColor}12`,
          pointerEvents: 'none', boxSizing: 'border-box',
        }} />
      )}

      {firstClick && !isDragging && (
        <div style={{
          position: 'absolute', top: 8, left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.75)', color: ratioColor,
          padding: '5px 16px', borderRadius: '20px',
          fontSize: '0.82rem', pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          ✦ 第一點已設定 — 點擊第二點完成選取
          {aspectRatio !== 'none' && (
            <span style={{ marginLeft: 8, opacity: 0.8 }}>
              [{aspectRatio === 'portrait' ? '9:16 直式' : '16:9 橫式'}]
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default ViewportCanvas;
