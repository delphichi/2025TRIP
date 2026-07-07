/**
 * SVG Parts · 固定不變的元件
 * -----------------------------------
 * 這些零件永遠一樣 · 不管什麼姿勢/表情/背景
 * · 頭部（禿頭小和尚）
 * · 耳朵
 * · 腮紅
 *
 * 座標系：viewBox 0 0 400 500
 * 角色中心 x=200 · 頭部 y≈140 · 身體 y≈200-400
 */

export const HEAD = `
    <!-- Ears · 隱藏在頭部後方 -->
    <ellipse cx="150" cy="145" rx="9" ry="16" fill="#f0d0a0" stroke="#3a3a3a" stroke-width="2"/>
    <ellipse cx="250" cy="145" rx="9" ry="16" fill="#f0d0a0" stroke="#3a3a3a" stroke-width="2"/>
    <!-- 禿頭 · 主要膚色 -->
    <circle cx="200" cy="140" r="55" fill="#f5deb3" stroke="#3a3a3a" stroke-width="2.5"/>
`.trim();

export const BLUSH = `
    <ellipse cx="165" cy="160" rx="11" ry="6" fill="#ffb6c1" opacity="0.55"/>
    <ellipse cx="235" cy="160" rx="11" ry="6" fill="#ffb6c1" opacity="0.55"/>
`.trim();

/** 眉毛 · 通用的一對小弧 */
export const EYEBROWS = `
    <path d="M167,127 Q175,124 183,127" stroke="#3a3a3a" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M217,127 Q225,124 233,127" stroke="#3a3a3a" stroke-width="2" fill="none" stroke-linecap="round"/>
`.trim();

/** 鼻子 · 簡單一小點 */
export const NOSE = `
    <ellipse cx="200" cy="155" rx="2" ry="1.5" fill="#c4a080"/>
`.trim();
