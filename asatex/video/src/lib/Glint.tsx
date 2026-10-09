import React from "react";
import { C } from "../theme";

let uid = 0;

/**
 * 全片唯一的「發光」語彙：4 芒鑽石星 + 45° 小星 + 水平變形光暈。
 * 以 SVG <g> 輸出，放進任何 1080×1920 的 <svg> 內。
 */
export const Glint: React.FC<{
  x: number;
  y: number;
  size: number;
  scale?: number;
  rotate?: number;
  streak?: number; // 光暈半寬（px）
  opacity?: number;
  glow?: string;
  color?: string;
}> = ({ x, y, size, scale = 1, rotate = 0, streak = 0, opacity = 1, glow = C.gold, color = "#fff" }) => {
  const id = React.useMemo(() => `g${uid++}`, []);
  if (scale <= 0.001 || opacity <= 0.001) return null;
  const s = size;
  const k = s * 0.11;
  const star = `M0,${-s} Q${k},${-k} ${s},0 Q${k},${k} 0,${s} Q${-k},${k} ${-s},0 Q${-k},${-k} 0,${-s}Z`;
  const m = s * 0.45;
  const k2 = m * 0.12;
  const small = `M0,${-m} Q${k2},${-k2} ${m},0 Q${k2},${k2} 0,${m} Q${-k2},${k2} ${-m},0 Q${-k2},${-k2} 0,${-m}Z`;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity}>
      <defs>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor={glow} stopOpacity={0.9} />
          <stop offset="0.35" stopColor={glow} stopOpacity={0.25} />
          <stop offset="1" stopColor={glow} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`${id}-streak`}>
          <stop offset="0" stopColor={glow} stopOpacity={0} />
          <stop offset="0.5" stopColor="#fff" stopOpacity={0.95} />
          <stop offset="1" stopColor={glow} stopOpacity={0} />
        </linearGradient>
      </defs>
      <circle r={s * 0.6} fill={`url(#${id}-glow)`} />
      {streak > 0 ? (
        <ellipse rx={streak / scale} ry={Math.max(3, s * 0.045)} fill={`url(#${id}-streak)`} />
      ) : null}
      <g transform={`rotate(${rotate})`}>
        <path d={small} fill={color} opacity={0.75} transform="rotate(45)" />
        <path d={star} fill={color} />
      </g>
    </g>
  );
};
