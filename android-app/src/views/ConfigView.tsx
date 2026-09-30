/**
 * ConfigView.tsx - Android version
 * Direct play always available; no scan required.
 */
import React, { useState, useEffect } from "react";
import { checkViewportDb } from "../platform";

interface DbStatus {
  exists: boolean;
  scannedAt: string;
  total: number;
  failedCount: number;
}

interface Props {
  initialDirectories:   string[];
  initialLayout:        string;
  initialInterval:      number;
  initialOrder:         string;
  initialRecursive:     boolean;
  initialTransition:    string;
  initialSubDirKeyword: string;
  initialDbRootDir:     string;
  initialAiMode?:       boolean;
  onScan: (dirs: string[], layout: string, interval: number, order: string, recursive: boolean, transition: string, subDirKeyword: string, dbRootDir: string) => void;
  onPlayDirect: (dirs: string[], layout: string, interval: number, order: string, recursive: boolean, transition: string, subDirKeyword: string, dbRootDir: string, aiMode: boolean) => void;
  onAnnotate: (dirs: string[], layout: string, interval: number, order: string, recursive: boolean, transition: string, subDirKeyword: string, dbRootDir: string) => void;
}

const ConfigView: React.FC<Props> = ({
  initialDirectories, initialLayout, initialInterval, initialOrder,
  initialRecursive, initialTransition, initialSubDirKeyword, initialDbRootDir, initialAiMode,
  onScan, onPlayDirect, onAnnotate,
}) => {
  const [directories,   setDirectories]   = useState<string[]>(initialDirectories);
  const [layout,        setLayout]         = useState<string>(initialLayout);
  const [intervalTime,  setIntervalTime]   = useState<number>(initialInterval);
  const [order,         setOrder]          = useState<string>(initialOrder);
  const [recursive,     setRecursive]      = useState<boolean>(initialRecursive);
  const [transition,    setTransition]     = useState<string>(initialTransition);
  const [subDirKeyword, setSubDirKeyword]  = useState<string>(initialSubDirKeyword);
  const [dbRootDir,     setDbRootDir]      = useState<string>(initialDbRootDir);
  const [aiMode,        setAiMode]         = useState<boolean>(() => {
    const saved = localStorage.getItem('midea_ai_mode');
    return saved !== null ? saved === 'true' : (initialAiMode ?? true);
  });
  const [dbStatus,      setDbStatus]       = useState<DbStatus | null>(null);
  const [checkingDb,    setCheckingDb]     = useState(false);
  const [picking,       setPicking]        = useState(false);

  useEffect(() => {
    localStorage.setItem('midea_ai_mode', String(aiMode));
  }, [aiMode]);

  useEffect(() => {
    const effectiveRoot = dbRootDir.trim() || (directories.length > 0 ? directories[0] : "");
    if (!effectiveRoot) { setDbStatus(null); return; }
    let cancelled = false;
    setCheckingDb(true);
    checkViewportDb(effectiveRoot).then(result => {
      if (!cancelled) { setDbStatus(result); setCheckingDb(false); }
    }).catch(() => {
      if (!cancelled) { setDbStatus(null); setCheckingDb(false); }
    });
    return () => { cancelled = true; };
  }, [directories.join("|"), dbRootDir]);

  const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/heic', 'image/heif'];

  const handleSelectImages = async () => {
    setPicking(true);
    try {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.multiple = true;
      input.onchange = () => {
        if (!input.files) { setPicking(false); return; }
        const uris: string[] = [];
        for (let i = 0; i < input.files.length; i++) {
          uris.push(URL.createObjectURL(input.files[i]));
        }
        if (uris.length > 0) {
          setDirectories(prev => Array.from(new Set([...prev, ...uris])));
        }
        setPicking(false);
      };
      input.addEventListener("cancel", () => setPicking(false));
      input.click();
    } catch (e) {
      console.error("File picker failed:", e);
      setPicking(false);
    }
  };

  const handleSelectFolder = async () => {
    setPicking(true);
    try {
      const input = document.createElement("input");
      input.type = "file";
      // @ts-ignore — webkitdirectory 讓使用者選取整個資料夾
      input.webkitdirectory = true;
      input.multiple = true;
      input.onchange = () => {
        if (!input.files || input.files.length === 0) { setPicking(false); return; }
        const uris: string[] = [];
        for (let i = 0; i < input.files.length; i++) {
          const file = input.files[i];
          // 只保留圖片檔案（依 MIME type 或副檔名判斷）
          const isImage = IMAGE_TYPES.includes(file.type) ||
            /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name);
          if (isImage) {
            uris.push(URL.createObjectURL(file));
          }
        }
        if (uris.length > 0) {
          setDirectories(prev => Array.from(new Set([...prev, ...uris])));
        }
        setPicking(false);
      };
      input.addEventListener("cancel", () => setPicking(false));
      input.click();
    } catch (e) {
      console.error("Folder picker failed:", e);
      setPicking(false);
    }
  };

  const handleRemoveDirectory = (i: number) => {
    setDirectories(prev => prev.filter((_, idx) => idx !== i));
  };

  const getArgs = (): [string[], string, number, string, boolean, string, string, string] =>
    [directories, layout, intervalTime, order, recursive, transition, subDirKeyword, dbRootDir];

  const canStart = directories.length > 0;

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleString("zh-TW"); } catch { return iso; }
  };

  return (
    <div style={{
      padding: "env(safe-area-inset-top, 24px) 20px env(safe-area-inset-bottom, 24px) 20px",
      backgroundColor: "#0f1117", color: "#e2e8f0",
      height: "100%", boxSizing: "border-box",
      fontFamily: "'Inter', 'Noto Sans TC', 'Segoe UI', sans-serif",
      overflowY: "scroll", overflowX: "hidden",
      touchAction: "pan-y",
      WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
    }}>
      <div style={{ textAlign: "center", marginBottom: "32px", paddingTop: "16px" }}>
        <h1 style={{
          margin: 0, fontSize: "1.8rem", fontWeight: 700,
          background: "linear-gradient(135deg, #93c5fd, #c4b5fd)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          letterSpacing: "1px",
        }}>
          {String.fromCodePoint(0x1F338)} Midea Player
        </h1>
        <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: "0.9rem" }}>
          Android {String.fromCodePoint(0xB7)} {String.fromCodePoint(0x8DE8)}{String.fromCodePoint(0x5E73)}{String.fromCodePoint(0x53F0)}{String.fromCodePoint(0x5716)}{String.fromCodePoint(0x7247)}{String.fromCodePoint(0x8F2A)}{String.fromCodePoint(0x64AD)}{String.fromCodePoint(0x7CFB)}{String.fromCodePoint(0x7D71)}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "600px", margin: "0 auto" }}>

        <div style={cardStyle}>
          <h2 style={cardTitleStyle}>📁 圖片來源</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <button onClick={handleSelectImages} disabled={picking} style={{ ...btnStyle, opacity: picking ? 0.6 : 1 }}>
              {picking ? "選取中..." : "🖼️ + 選擇圖片（支援多選）"}
            </button>
            <button onClick={handleSelectFolder} disabled={picking} style={{
              ...btnStyle,
              opacity: picking ? 0.6 : 1,
              background: "#6366f1",
            }}>
              {picking ? "選取中..." : "📂 選擇整個資料夾"}
            </button>
          </div>
          <p style={{ margin: "10px 0 0", color: "#475569", fontSize: "0.8rem" }}>
            可選單張圖片或整個資料夾 · 支援 JPG / PNG / WebP / HEIC
          </p>
          <div style={{ marginTop: "15px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <span style={{ fontWeight: 600, color: "#cbd5e1", fontSize: "0.9rem" }}>
                {String.fromCodePoint(0x5DF2)}{String.fromCodePoint(0x9078)}{String.fromCodePoint(0x64C7)} {directories.length} {String.fromCodePoint(0x5F35)}{String.fromCodePoint(0x5716)}{String.fromCodePoint(0x7247)}
              </span>
              {directories.length > 0 && (
                <button onClick={() => setDirectories([])} style={clearBtnStyle}>{String.fromCodePoint(0x5168)}{String.fromCodePoint(0x90E8)}{String.fromCodePoint(0x6E05)}{String.fromCodePoint(0x9664)}</button>
              )}
            </div>
            {directories.length > 0 && (
              <div style={{ maxHeight: "120px", overflowY: "auto", WebkitOverflowScrolling: "touch" as any }}>
                {directories.slice(0, 5).map((dir, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    backgroundColor: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)",
                    padding: "8px 12px", borderRadius: "8px", marginBottom: "6px",
                  }}>
                    <span style={{ fontSize: "0.8rem", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>
                      {String.fromCodePoint(0x1F5BC)+"\uFE0F"} {String.fromCodePoint(0x5716)}{String.fromCodePoint(0x7247)} #{i + 1}
                    </span>
                    <button onClick={() => handleRemoveDirectory(i)} style={removeBtnStyle}>&#x2715;</button>
                  </div>
                ))}
                {directories.length > 5 && (
                  <p style={{ color: "#64748b", fontSize: "0.8rem", textAlign: "center", margin: "4px 0" }}>
                    ...{String.fromCodePoint(0x9084)}{String.fromCodePoint(0x6709)} {directories.length - 5} {String.fromCodePoint(0x5F35)}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 播放模式選擇 */}
        <div style={cardStyle}>
          <h2 style={cardTitleStyle}>🎯 播放模式</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <button
              type="button"
              onClick={() => setAiMode(true)}
              style={{
                padding: "16px 12px",
                borderRadius: "14px",
                border: aiMode ? "2px solid #6366f1" : "1px solid rgba(255,255,255,0.1)",
                backgroundColor: aiMode ? "rgba(99,102,241,0.22)" : "rgba(255,255,255,0.03)",
                color: aiMode ? "#ffffff" : "#94a3b8",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
                boxShadow: aiMode ? "0 0 16px rgba(99,102,241,0.35)" : "none",
                transition: "all 0.2s ease",
              }}
            >
              <span style={{ fontSize: "1.8rem" }}>🤖</span>
              <span style={{ fontWeight: 700, fontSize: "1rem" }}>AI 智慧播放</span>
              <span style={{ fontSize: "0.78rem", color: aiMode ? "#cbd5e1" : "#64748b", textAlign: "center", lineHeight: "1.3" }}>
                人臉偵測 · 自動特寫
              </span>
            </button>

            <button
              type="button"
              onClick={() => setAiMode(false)}
              style={{
                padding: "16px 12px",
                borderRadius: "14px",
                border: !aiMode ? "2px solid #10b981" : "1px solid rgba(255,255,255,0.1)",
                backgroundColor: !aiMode ? "rgba(16,185,129,0.22)" : "rgba(255,255,255,0.03)",
                color: !aiMode ? "#ffffff" : "#94a3b8",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
                boxShadow: !aiMode ? "0 0 16px rgba(16,185,129,0.35)" : "none",
                transition: "all 0.2s ease",
              }}
            >
              <span style={{ fontSize: "1.8rem" }}>🖼️</span>
              <span style={{ fontWeight: 700, fontSize: "1rem" }}>正常播放</span>
              <span style={{ fontSize: "0.78rem", color: !aiMode ? "#cbd5e1" : "#64748b", textAlign: "center", lineHeight: "1.3" }}>
                原始照片 · 流暢省電
              </span>
            </button>
          </div>
        </div>

        <div style={cardStyle}>
          <h2 style={cardTitleStyle}>{"\u29C6"} {String.fromCodePoint(0x4F48)}{String.fromCodePoint(0x5C40)}{String.fromCodePoint(0x8207)}{String.fromCodePoint(0x8996)}{String.fromCodePoint(0x89BA)}</h2>
          <div style={inputGroupStyle}>
            <label style={labelStyle}>{String.fromCodePoint(0x7248)}{String.fromCodePoint(0x9762)}{String.fromCodePoint(0x914D)}{String.fromCodePoint(0x7F6E)}:</label>
            <select value={layout} onChange={e => setLayout(e.target.value)} style={selectStyle}>
              <option value="random">{"\uD83C\uDFB2"} {String.fromCodePoint(0x96A8)}{String.fromCodePoint(0x6A5F)}</option>
              <option value="1x1">{String.fromCodePoint(0x55AE)}{String.fromCodePoint(0x756B)}{String.fromCodePoint(0x9762)} (1x1)</option>
              <option value="2x2">{String.fromCodePoint(0x56DB)}{String.fromCodePoint(0x683C)}{String.fromCodePoint(0x77E9)}{String.fromCodePoint(0x9663)} (2x2)</option>
              <option value="1x4">{String.fromCodePoint(0x56DB)}{String.fromCodePoint(0x683C)}{String.fromCodePoint(0x76F4)}{String.fromCodePoint(0x5217)} (1x4)</option>
              <option value="1x5">{String.fromCodePoint(0x4E2D)}{String.fromCodePoint(0x592E)}{String.fromCodePoint(0x805A)}{String.fromCodePoint(0x7126)} (1x5)</option>
              <option value="4x4">{String.fromCodePoint(0x5341)}{String.fromCodePoint(0x516D)}{String.fromCodePoint(0x683C)} (4x4)</option>
              <option value="1+3">1{String.fromCodePoint(0x5927)}3{String.fromCodePoint(0x5C0F)}</option>
              <option value="1+4">{String.fromCodePoint(0x96DC)}{String.fromCodePoint(0x8A8C)}{String.fromCodePoint(0x98A8)} (1+4)</option>
              <option value="center-focus">{String.fromCodePoint(0x7F6E)}{String.fromCodePoint(0x4E2D)}{String.fromCodePoint(0x7126)}{String.fromCodePoint(0x9EDE)}</option>
              <option value="10x10">{String.fromCodePoint(0x7167)}{String.fromCodePoint(0x7247)}{String.fromCodePoint(0x7246)} (100{String.fromCodePoint(0x683C)})</option>
            </select>
          </div>
        </div>

        <div style={cardStyle}>
          <h2 style={cardTitleStyle}>{"\u25B6"} {String.fromCodePoint(0x64AD)}{String.fromCodePoint(0x653E)}{String.fromCodePoint(0x8207)}{String.fromCodePoint(0x8F49)}{String.fromCodePoint(0x5834)}</h2>
          <div style={inputGroupStyle}>
            <label style={labelStyle}>{String.fromCodePoint(0x6392)}{String.fromCodePoint(0x5E8F)}{String.fromCodePoint(0x7B56)}{String.fromCodePoint(0x7565)}:</label>
            <select value={order} onChange={e => setOrder(e.target.value)} style={selectStyle}>
              <option value="shuffle">{"\uD83D\uDD00"} {String.fromCodePoint(0x96A8)}{String.fromCodePoint(0x6A5F)}</option>
              <option value="sequential">{"\u2B07\uFE0F"} {String.fromCodePoint(0x5FAA)}{String.fromCodePoint(0x5E8F)}</option>
            </select>
          </div>
          <div style={inputGroupStyle}>
            <label style={labelStyle}>{String.fromCodePoint(0x8F49)}{String.fromCodePoint(0x5834)}{String.fromCodePoint(0x6548)}{String.fromCodePoint(0x679C)}:</label>
            <select value={transition} onChange={e => setTransition(e.target.value)} style={selectStyle}>
              <option value="fade">Fade</option>
              <option value="slide">Slide</option>
              <option value="zoom">Zoom</option>
              <option value="blur">Blur</option>
              <option value="wipe">Wipe</option>
              <option value="random">{"\uD83C\uDFB2"} {String.fromCodePoint(0x96A8)}{String.fromCodePoint(0x6A5F)}</option>
            </select>
          </div>
          <div style={inputGroupStyle}>
            <label style={labelStyle}>輪播間隔（秒）:</label>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <input type="range" min="1" max="30" value={intervalTime}
                onChange={e => setIntervalTime(Number(e.target.value))}
                style={{ flex: 1, accentColor: "#6366f1" }} />
              <span style={{ color: "#94a3b8", minWidth: "32px", textAlign: "right", fontSize: "1.1rem", fontWeight: 600 }}>
                {intervalTime}s
              </span>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <h2 style={cardTitleStyle}>{"\u2699\uFE0F"} {String.fromCodePoint(0x9032)}{String.fromCodePoint(0x968E)}{String.fromCodePoint(0x63A7)}{String.fromCodePoint(0x5236)}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px 0" }}>
            <div onClick={() => setRecursive(!recursive)} style={{
              width: "52px", height: "28px", borderRadius: "14px",
              backgroundColor: recursive ? "#6366f1" : "#374151",
              position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0,
            }}>
              <div style={{
                width: "22px", height: "22px", borderRadius: "50%", backgroundColor: "#fff",
                position: "absolute", top: "3px", left: recursive ? "27px" : "3px",
                transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
              }} />
            </div>
            <label style={{ cursor: "pointer", fontSize: "1rem", color: "#cbd5e1" }} onClick={() => setRecursive(!recursive)}>
              深度掃描（包含子目錄）
            </label>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", paddingBottom: "40px" }}>

          <button
            onClick={() => onPlayDirect(...getArgs(), aiMode)}
            disabled={!canStart}
            style={{
              padding: "20px", fontSize: "1.2rem", fontWeight: 700,
              background: !canStart
                ? "rgba(255,255,255,0.06)"
                : (aiMode
                  ? "linear-gradient(135deg, #4f46e5, #6366f1)"
                  : "linear-gradient(135deg, #059669, #10b981)"),
              color: !canStart ? "#475569" : "white",
              border: "none", borderRadius: "16px",
              cursor: !canStart ? "not-allowed" : "pointer", width: "100%",
              boxShadow: canStart
                ? (aiMode ? "0 4px 24px rgba(99,102,241,0.45)" : "0 4px 24px rgba(16,185,129,0.45)")
                : "none",
              transition: "all 0.25s ease",
            }}
          >
            {!canStart
              ? "請先選擇圖片"
              : (aiMode ? "▶ 開始 AI 智慧播放" : "▶ 開始正常播放")}
          </button>
        </div>

      </div>
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
  padding: "20px", borderRadius: "20px", backdropFilter: "blur(4px)",
};
const cardTitleStyle: React.CSSProperties = {
  margin: "0 0 16px 0", fontSize: "1.1rem", fontWeight: 600, color: "#f1f5f9",
  borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "12px",
};
const inputGroupStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px",
};
const labelStyle: React.CSSProperties = { color: "#94a3b8", fontSize: "0.9rem", fontWeight: 500 };
const selectStyle: React.CSSProperties = {
  padding: "12px 14px", borderRadius: "10px",
  backgroundColor: "rgba(255,255,255,0.06)", color: "#e2e8f0",
  border: "1px solid rgba(255,255,255,0.12)", fontSize: "1rem", minHeight: "48px",
};
const btnStyle: React.CSSProperties = {
  padding: "14px 20px", backgroundColor: "#3b82f6", color: "#fff",
  border: "none", borderRadius: "12px", cursor: "pointer",
  fontSize: "1rem", fontWeight: 700, width: "100%", minHeight: "52px",
};
const clearBtnStyle: React.CSSProperties = {
  padding: "6px 14px", backgroundColor: "transparent", color: "#ef4444",
  border: "1px solid rgba(239,68,68,0.4)", borderRadius: "8px", cursor: "pointer", fontSize: "0.9rem",
};
const removeBtnStyle: React.CSSProperties = {
  background: "transparent", color: "#ef4444", border: "none",
  cursor: "pointer", fontSize: "1.1rem", padding: "4px 8px", flexShrink: 0,
};

export default ConfigView;
