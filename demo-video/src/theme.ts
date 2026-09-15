/**
 * 字型一律用容器內已安裝的本機字型。
 * 算繪用的 headless 瀏覽器連不到 fonts.gstatic.com，
 * 用 @remotion/google-fonts 會在載入字型檔時失敗。
 */
export const FONT = `"Liberation Sans", "DejaVu Sans", "WenQuanYi Zen Hei", sans-serif`;
export const MONO = `"DejaVu Sans Mono", "WenQuanYi Zen Hei Mono", monospace`;

export const COLORS = {
  bg: "#0B0E14",
  ink: "#F2F3F5",
  muted: "#8A93A6",
  dim: "#5C6475",
  accent: "#F5A524",
} as const;

/** 1920×1080 的安全邊界（依 1080 寬的 80/100px 規範等比放大） */
export const SAFE = { x: 150, y: 178 } as const;

/**
 * 漲跌用「暖 ↔ 冷」的 diverging 配對（紅漲藍跌），中性中點為灰。
 * 這組在深色底 #0B0E14 上通過 dataviz 驗證：
 * CVD 分離度 ΔE 19.2、常視覺 ΔE 29.0、對比皆 ≥ 3:1。
 * 顏色不單獨承載意義 —— 另外加上 ▲▼ 與數值直標。
 */
export const CHART = {
  up: "#e66767",
  down: "#3987e5",
  zero: "#4A4F5C",
  grid: "rgba(242,243,245,0.09)",
  axis: "rgba(242,243,245,0.28)",
} as const;

export const signColor = (v: number) => (v >= 0 ? CHART.up : CHART.down);
export const signMark = (v: number) => (v >= 0 ? "▲" : "▼");
export const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
