import React from 'react';

interface Props {
  imagePath: string;
  onClose: () => void;
}

const Lightbox: React.FC<Props> = ({ imagePath, onClose }) => {
  // 將 Windows 的反斜線轉為正斜線
  const safeImagePath = imagePath.replace(/\\/g, '/');
  const fileUrl = `local-resource://${safeImagePath}`;

  const handleSave = async () => {
    if (window.electronAPI && (window.electronAPI as any).saveImage) {
      const res = await (window.electronAPI as any).saveImage(imagePath);
      if (res && res.success) {
        alert('圖片已成功儲存至: ' + res.filePath);
      } else if (res && res.reason !== 'canceled') {
        alert('儲存失敗: ' + res.reason);
      }
    } else {
      alert('無法儲存：後端 API 未就緒');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <div style={{ position: 'absolute', top: '20px', right: '30px', display: 'flex', gap: '15px' }}>
        <button onClick={handleSave} style={btnStyle}>💾 儲存原圖</button>
        <button onClick={onClose} style={btnStyle}>❌ 關閉</button>
      </div>

      <img 
        src={fileUrl} 
        alt="Enlarged view" 
        style={{
          maxWidth: '90%',
          maxHeight: '85%',
          objectFit: 'contain',
          boxShadow: '0 0 30px rgba(0,0,0,0.5)'
        }} 
      />

      {/* 獨立控制列 */}
      <div style={{ marginTop: '20px', display: 'flex', gap: '20px' }}>
        <button style={ctrlBtnStyle}>⏮ 上一張</button>
        <button style={ctrlBtnStyle}>⏸ 暫停</button>
        <button style={ctrlBtnStyle}>下一張 ⏭</button>
      </div>
    </div>
  );
};

const btnStyle = {
  padding: '8px 16px', fontSize: '1.2rem', cursor: 'pointer',
  backgroundColor: '#333', color: 'white', border: 'none', borderRadius: '5px'
};

const ctrlBtnStyle = {
  padding: '10px 20px', fontSize: '1.2rem', cursor: 'pointer',
  backgroundColor: '#555', color: 'white', border: 'none', borderRadius: '5px'
};

export default Lightbox;
