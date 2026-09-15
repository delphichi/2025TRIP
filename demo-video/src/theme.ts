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
  accent: "#F5A524",
} as const;

/** 1920×1080 的安全邊界（依 1080 寬的 80/100px 規範等比放大） */
export const SAFE = { x: 150, y: 178 } as const;
