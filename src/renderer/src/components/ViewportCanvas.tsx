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
 * 長寬比模式（aspectRatio prop）：
 *   'none'      → 自由拖曳（預設，虛線框 #00ff88）
 *   'portrait'  → 鎖定 9:16 直式（框色 #a78bfa 紫）
 *   'landscape' → 鎖定 16:9 橫式（框色 #38bdf8 藍）
 */

import React, { useRef, useState, useCallback } from 'react';

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

export type AspectRatioMode = 'none' | 'portrait' | 'landscape';

/** aspectRatio → w/h 數值（null = 無限制） */
const RATIO_MAP: Record<AspectRatioMode, number | null> = {
  none:      null,
  portrait:  9 / 16,   // 寬/高 = 9/16
  landscape: 16 / 9,
};

interface Props {
  /** 對應圖片 img 元素的 Ref，用於計算實際顯示尺寸 */
  imgRef:       React.RefObject<HTMLImageElement>;
  /** 目前是否已有確認的選取框（已確認後顯示實線） */
  hasSelection: boolean;
  /** 選取完成的回呼 */
  onSelect:     (rect: NormalizedRect) => void;
  /** 清除選取的回呼 */
  onClear:      () => void;
  /**
   * 長寬比限制模式（預設 'none'）：
   *   'none'      → 自由拖曳
   *   'portrait'  → 鎖定 9:16（直式）
   *   'landscape' → 鎖定 16:9（橫式）
   */
  aspectRatio?: AspectRatioMode;
}

/** 超過此像素距離視為「拖曳」，否則視為「點擊」 */
const DRAG_THRESHOLD = 6;

const dist = (a: CanvasPt, b: CanvasPt) =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

const ViewportCanvas: React.FC<Props> = ({
  imgRef, hasSelection, onSelect, onClear, aspectRatio = 'none',
}) => {
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

  // ── 工具：依長寬比限制，調整終點 b 使框符合目標比例 ─────────────────────────
  //
  // 演算法：
  //   1. 以起點 a 為錨點，從 a→b 的方向符號決定往哪個象限延伸
  //   2. 計算各方向到圖片邊界的剩餘距離（maxW, maxH）
  //   3. 嘗試以 dx 為主或以 dy 為主推算另一邊，取第一個滿足邊界的方案
  //   4. 若兩者都超出邊界，以邊界夾緊後的最大值為準
  const applyAspectRatio = useCallback((a: CanvasPt, b: CanvasPt): CanvasPt => {
    const ratio = RATIO_MAP[aspectRatio]; // w/h，null = 不限制
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

    const wFromDx = dx, hFromDx = dx / ratio;
    const wFromDy = dy * ratio, hFromDy = dy;

    if (wFromDx <= maxW && hFromDx <= maxH) {
      finalW = wFromDx; finalH = hFromDx;
    } else if (wFromDy <= maxW && hFromDy <= maxH) {
      finalW = wFromDy; finalH = hFromDy;
    } else {
      finalW = Math.min(maxW, maxH * ratio);
      finalH = finalW / ratio;
    }

    return {
      x: offX + ax + signX * finalW,
      y: offY + ay + signY * finalH,
    };
  }, [imgRef, aspectRatio]);

  // ── 工具：從兩個容器相對點計算正規化矩形 ─────────────────────────────────────
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

  // ── 確認選取並回呼 ────────────────────────────────────────────────────────────
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
    const constrainedB = applyAspectRatio(a, b);
    const rect = computeNormalized(a, constrainedB);
    if (rect && rect.w > 0.01 && rect.h > 0.01) {
      setConfirmedStart(a);
      setConfirmedEnd(constrainedB);
      onSelect(rect);
    } else {
      handleClear();
    }
  }, [applyAspectRatio, computeNormalized, onSelect, handleClear]);

  // ── 滑鼠事件 ──────────────────────────────────────────────────────────────────
  const downPtRef = useRef<CanvasPt | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();

    const pt = toCanvasPt(e.clientX, e.clientY);
    if (!pt) return;

    if (firstClick) {
      downPtRef.current = pt;
      return;
    }

    downPtRef.current = pt;
    setDragStart(pt);
    setDragEnd(pt);
    setIsDragging(true);
    setConfirmedStart(null);
    setConfirmedEnd(null);
    onClear();
  }, [toCanvasPt, firstClick, onClear]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const pt = toCanvasPt(e.clientX, e.clientY);
    if (!pt) return;

    if (isDragging && dragStart) {
      // 套用比例限制後更新 dragEnd（即時預覽）
      setDragEnd(applyAspectRatio(dragStart, pt));
    } else if (firstClick) {
      setHoverPt(applyAspectRatio(firstClick, pt));
    }
  }, [toCanvasPt, isDragging, dragStart, firstClick, applyAspectRatio]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const pt = toCanvasPt(e.clientX, e.clientY);
    if (!pt) return;

    // ── 兩點模式：已有第一點 ────────────────────────────────────────────────
    if (firstClick && !isDragging) {
      setFirstClick(null);
      setHoverPt(null);
      finalizeSelection(firstClick, pt);
      return;
    }

    // ── 拖曳 or 點擊模式 ────────────────────────────────────────────────────
    if (!isDragging || !dragStart) return;
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);

    const downPt = downPtRef.current;
    const movement = downPt ? dist(downPt, pt) : 0;

    if (movement > DRAG_THRESHOLD) {
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
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      finalizeSelection(dragStart, dragEnd);
    }
    setHoverPt(null);
  }, [isDragging, dragStart, dragEnd, finalizeSelection]);

  // ── 計算當前虛線框的 CSS 尺寸 ────────────────────────────────────────────────
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

  // 依比例模式顯示不同顏色
  const ratioColor =
    aspectRatio === 'portrait'  ? '#a78bfa' :   // 紫（直式 9:16）
    aspectRatio === 'landscape' ? '#38bdf8' :   // 藍（橫式 16:9）
    '#00ff88';                                   // 綠（自由）

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      style={{ position: 'absolute', inset: 0, cursor: 'crosshair', userSelect: 'none', zIndex: 10 }}
    >
      {/* 兩點模式：起點標記 */}
      {firstClick && !isDragging && (
        <div style={{
          position: 'absolute',
          left: firstClick.x - 5, top: firstClick.y - 5,
          width: 10, height: 10,
          borderRadius: '50%',
          background: ratioColor,
          boxShadow: `0 0 6px ${ratioColor}`,
          pointerEvents: 'none',
        }} />
      )}

      {/* 即時虛線框（拖曳中 or 等待第二點懸停） */}
      {liveDashed && (
        <div style={{
          position: 'absolute',
          left: liveDashed.left, top: liveDashed.top,
          width: liveDashed.width, height: liveDashed.height,
          border: `2px dashed ${ratioColor}`,
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
          border: `2px solid ${ratioColor}`,
          background: `${ratioColor}12`,
          pointerEvents: 'none',
          boxSizing: 'border-box',
        }} />
      )}

      {/* 兩點模式 / 比例模式提示 */}
      {firstClick && !isDragging && (
        <div style={{
          position: 'absolute', top: 8, left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.7)', color: ratioColor,
          padding: '4px 14px', borderRadius: '20px',
          fontSize: '0.78rem', pointerEvents: 'none', whiteSpace: 'nowrap',
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
