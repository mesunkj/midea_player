/**
 * ViewportCanvas.tsx
 *
 * 疊加在圖片上的互動選取畫布。
 *
 * 支援兩種選取模式（自動判斷）：
 *   A. 拖曳模式：按住左鍵拖曳超過 DRAG_THRESHOLD 像素後釋放
 *   B. 兩點點擊模式：第一次小點擊定起點，移動滑鼠預覽虛線框，第二次點擊定終點
 *
 * 座標計算：
 *   - 使用 imgRef 取得圖片的實際顯示尺寸與位置（而非容器）
 *   - 輸出正規化座標 (x, y, w, h) 均在 [0, 1] 區間
 *   - 支援任意拖曳方向（自動取 min/max）
 *
 * 顏色：虛線框 #00ff88（符合 sp4 規格）
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';

export interface NormalizedRect {
  x: number;  // 左上角橫座標 (0–1)，相對於圖片實際顯示尺寸
  y: number;  // 左上角縱座標 (0–1)
  w: number;  // 寬度 (0–1)
  h: number;  // 高度 (0–1)
}

/** 容器相對座標（px），用於 CSS 定位虛線框 */
interface CanvasPt {
  x: number;
  y: number;
}

interface Props {
  /** 對應圖片 img 元素的 Ref，用於計算實際顯示尺寸 */
  imgRef:       React.RefObject<HTMLImageElement>;
  /** 目前是否已有確認的選取框（已確認後顯示實線） */
  hasSelection: boolean;
  /** 選取完成的回呼 */
  onSelect:     (rect: NormalizedRect) => void;
  /** 清除選取的回呼 */
  onClear:      () => void;
}

/** 超過此像素距離視為「拖曳」，否則視為「點擊」 */
const DRAG_THRESHOLD = 6;

const dist = (a: CanvasPt, b: CanvasPt) =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

const ViewportCanvas: React.FC<Props> = ({ imgRef, hasSelection, onSelect, onClear }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // 拖曳狀態
  const [isDragging,   setIsDragging]   = useState(false);
  const [dragStart,    setDragStart]    = useState<CanvasPt | null>(null);
  const [dragEnd,      setDragEnd]      = useState<CanvasPt | null>(null);

  // 兩點點擊模式狀態
  const [firstClick,   setFirstClick]   = useState<CanvasPt | null>(null);
  const [hoverPt,      setHoverPt]      = useState<CanvasPt | null>(null);

  // 已確認的最終框（供實線顯示）
  const [confirmedStart, setConfirmedStart] = useState<CanvasPt | null>(null);
  const [confirmedEnd,   setConfirmedEnd]   = useState<CanvasPt | null>(null);

  // ── 工具：將 clientX/Y 轉換為容器相對座標，並夾緊至圖片邊界 ────────────────
  const toCanvasPt = useCallback((clientX: number, clientY: number): CanvasPt | null => {
    const imgEl       = imgRef.current;
    const containerEl = containerRef.current;
    if (!imgEl || !containerEl) return null;

    const imgRect       = imgEl.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();

    // 夾緊至圖片顯示邊界
    const imgRelX = Math.max(0, Math.min(clientX - imgRect.left, imgRect.width));
    const imgRelY = Math.max(0, Math.min(clientY - imgRect.top,  imgRect.height));

    // 轉換為容器相對（用於 CSS 定位虛線框）
    return {
      x: (imgRect.left - containerRect.left) + imgRelX,
      y: (imgRect.top  - containerRect.top)  + imgRelY,
    };
  }, [imgRef]);

  // ── 工具：從兩個容器相對點計算正規化矩形 ─────────────────────────────────────
  const computeNormalized = useCallback((a: CanvasPt, b: CanvasPt): NormalizedRect | null => {
    const imgEl       = imgRef.current;
    const containerEl = containerRef.current;
    if (!imgEl || !containerEl) return null;

    const imgRect       = imgEl.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();
    if (imgRect.width === 0 || imgRect.height === 0) return null;

    // 容器相對 → 圖片相對（px）
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

  // ── 確認選取並回呼 ────────────────────────────────────────────────────────────
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

  // ── 滑鼠事件 ──────────────────────────────────────────────────────────────────
  const downPtRef = useRef<CanvasPt | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();

    const pt = toCanvasPt(e.clientX, e.clientY);
    if (!pt) return;

    // 若有兩點模式的第一點待定，此次 mousedown 用作第二點（在 mouseup 確認）
    if (firstClick) {
      downPtRef.current = pt;
      return;
    }

    // 開始新的潛在拖曳
    downPtRef.current = pt;
    setDragStart(pt);
    setDragEnd(pt);
    setIsDragging(true);
    // 清除舊確認框，進入新選取流程
    setConfirmedStart(null);
    setConfirmedEnd(null);
    onClear();
  }, [toCanvasPt, firstClick, onClear]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const pt = toCanvasPt(e.clientX, e.clientY);
    if (!pt) return;

    if (isDragging) {
      setDragEnd(pt);
    } else if (firstClick) {
      setHoverPt(pt);
    }
  }, [toCanvasPt, isDragging, firstClick]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const pt = toCanvasPt(e.clientX, e.clientY);
    if (!pt) return;

    // ── 兩點模式：已有第一點，此次是第二點 ──────────────────────────────────
    if (firstClick && !isDragging) {
      setFirstClick(null);
      setHoverPt(null);
      finalizeSelection(firstClick, pt);
      return;
    }

    // ── 拖曳 or 點擊模式 ──────────────────────────────────────────────────────
    if (!isDragging || !dragStart) return;
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);

    const downPt = downPtRef.current;
    const movement = downPt ? dist(downPt, pt) : 0;

    if (movement > DRAG_THRESHOLD) {
      // 拖曳模式：直接確認
      finalizeSelection(downPt!, pt);
    } else {
      // 點擊模式：設定第一點，等待第二次點擊
      setFirstClick(downPt!);
      setHoverPt(pt);
      setConfirmedStart(null);
      setConfirmedEnd(null);
    }
  }, [toCanvasPt, isDragging, dragStart, firstClick, finalizeSelection]);

  const handleMouseLeave = useCallback(() => {
    if (isDragging && dragStart && dragEnd) {
      // 離開容器時結束拖曳
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      finalizeSelection(dragStart, dragEnd);
    }
    setHoverPt(null);
  }, [isDragging, dragStart, dragEnd, finalizeSelection]);

  // ── 計算當前虛線框的 CSS 尺寸（拖曳中 or 兩點模式 hover）────────────────────
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

  // 確認後的最終框
  const getConfirmedStyle = (): React.CSSProperties | null => {
    if (!confirmedStart || !confirmedEnd || !hasSelection) return null;
    return {
      left:   Math.min(confirmedStart.x, confirmedEnd.x),
      top:    Math.min(confirmedStart.y, confirmedEnd.y),
      width:  Math.abs(confirmedEnd.x - confirmedStart.x),
      height: Math.abs(confirmedEnd.y - confirmedStart.y),
    };
  };

  const liveDashed    = getLiveDashedStyle();
  const confirmedBox  = getConfirmedStyle();

  // 滑鼠游標：十字（拖曳中 or 兩點模式等待第二點）
  const cursor = isDragging || !!firstClick ? 'crosshair' : 'crosshair';

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      style={{ position: 'absolute', inset: 0, cursor, userSelect: 'none', zIndex: 10 }}
    >
      {/* 兩點模式：起點標記 */}
      {firstClick && !isDragging && (
        <div style={{
          position: 'absolute',
          left: firstClick.x - 5, top: firstClick.y - 5,
          width: 10, height: 10,
          borderRadius: '50%',
          background: '#00ff88',
          boxShadow: '0 0 6px #00ff88',
          pointerEvents: 'none',
        }} />
      )}

      {/* 即時虛線框（拖曳中 or 等待第二點懸停） */}
      {liveDashed && (
        <div style={{
          position: 'absolute',
          left: liveDashed.left, top: liveDashed.top,
          width: liveDashed.width, height: liveDashed.height,
          border: '2px dashed #00ff88',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
          boxSizing: 'border-box',
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
          pointerEvents: 'none',
          boxSizing: 'border-box',
        }} />
      )}

      {/* 兩點模式提示 */}
      {firstClick && !isDragging && (
        <div style={{
          position: 'absolute', top: 8, left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.7)', color: '#00ff88',
          padding: '4px 14px', borderRadius: '20px',
          fontSize: '0.78rem', pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          ✦ 第一點已設定 — 點擊第二點完成選取
        </div>
      )}
    </div>
  );
};

export default ViewportCanvas;
