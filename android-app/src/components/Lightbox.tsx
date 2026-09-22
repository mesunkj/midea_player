/**
 * Lightbox.tsx — Android 版本
 *
 * 全螢幕圖片預覽。
 * Android 差異：
 *   - 不使用 local-resource:// 協定，直接使用 imageUri（content:// 或 data: URL）
 *   - 儲存透過 platform.ts saveImageToDevice
 *   - 增加觸控滑動關閉手勢
 */

import React, { useRef, useState } from 'react';
import { saveImageToDevice } from '../platform';

interface Props {
  imagePath: string;  // content:// URI 或 data: URL
  onClose: () => void;
}

const Lightbox: React.FC<Props> = ({ imagePath, onClose }) => {
  const [saving, setSaving] = useState(false);
  const touchStartY = useRef<number | null>(null);

  const handleSave = async () => {
    setSaving(true);
    const res = await saveImageToDevice(imagePath);
    setSaving(false);
    if (res.success) {
      alert('圖片已儲存！');
    } else if (res.reason) {
      alert('儲存失敗: ' + res.reason);
    }
  };

  // 觸控下滑關閉
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current !== null) {
      const deltaY = e.changedTouches[0].clientY - touchStartY.current;
      if (deltaY > 80) onClose(); // 下滑 80px 關閉
    }
    touchStartY.current = null;
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* 工具列 */}
      <div style={{
        position: 'absolute', top: 'env(safe-area-inset-top, 20px)',
        left: 0, right: 0,
        display: 'flex', justifyContent: 'flex-end',
        padding: '12px 20px', gap: '12px',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
      }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '10px 20px', fontSize: '1rem', cursor: 'pointer',
            backgroundColor: saving ? '#555' : '#2563eb',
            color: 'white', border: 'none', borderRadius: '20px',
            fontWeight: 600, minWidth: '44px', minHeight: '44px',
          }}
        >
          {saving ? '儲存中...' : '💾 儲存'}
        </button>
        <button
          onClick={onClose}
          style={{
            padding: '10px 20px', fontSize: '1rem', cursor: 'pointer',
            backgroundColor: 'rgba(255,255,255,0.12)',
            color: 'white', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '20px', minWidth: '44px', minHeight: '44px',
          }}
        >
          ✕ 關閉
        </button>
      </div>

      {/* 圖片 */}
      <img
        src={imagePath}
        alt="Enlarged view"
        style={{
          maxWidth: '95%',
          maxHeight: '80%',
          objectFit: 'contain',
          boxShadow: '0 0 40px rgba(0,0,0,0.8)',
          borderRadius: '8px',
        }}
      />

      {/* 下滑提示 */}
      <p style={{
        position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
        color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', margin: 0,
      }}>
        ↓ 下滑關閉
      </p>
    </div>
  );
};

export default Lightbox;
