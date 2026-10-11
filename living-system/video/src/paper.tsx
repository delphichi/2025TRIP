// 紙雕基本零件：與 living-system/build_storyboard.py 同一套手法，改成逐格可動的 React 元件。
import React from "react";
import { Easing, interpolate, random, staticFile, useCurrentFrame } from "remotion";
import { loadFont } from "@remotion/fonts";

for (const w of ["700", "900"]) {
  loadFont({ family: "Noto Serif TC", url: staticFile(`noto-serif-tc-${w}.woff2`), weight: w });
}

export const SERIF = "Noto Serif TC";
export const C = {
  paper: "#F3EBDD",
  sand: "#E6D6BC",
  ink: "#2A2522",
  root: "#7A5236", // 本
  green: "#4E7D63", // 能
  terra: "#C8664A", // 身
  water: "#4F7FA6", // 脈
  gold: "#E0A93B", // 留
  deep: "#2F5546",
  night: "#2E3F57",
  midnight: "#1E2A3E",
  light: "#F6C85F",
  coral: "#E58C6E",
  skin: "#F2C9A0",
  hair: "#2B2522",
  deer: "#FBF7F0",
  deer2: "#E9DFCF",
  wall: "#E9DCC6",
  desk: "#B8895A",
  brad: "#C9A24A",
  black: "#0f0e0d",
};

export const EXPO_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EXPO_IN = Easing.bezier(0.7, 0, 0.84, 0);
export const IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const tw = (f: number, a: number, b: number, from: number, to: number, easing = EXPO_OUT) =>
  interpolate(f, [a, b], [from, to], { ...clamp, easing });
/** 立體書彈起：0 → 過衝 → 1 */
export const popUp = (f: number, start: number, n = 8) =>
  interpolate(f, [start, start + n * 0.55, start + n], [0, 1.12, 1], { ...clamp, easing: EXPO_OUT });

/** 定格節奏：動作「一拍兩格」—— 每 2 格才更新一次。鏡頭不套用。 */
export const twos = (f: number) => Math.floor(f / 2) * 2;

/** 全片共用的投影濾鏡：深度 1–4，越前面影子越遠越柔。放在畫面最底下一次就好。 */
export const PaperDefs: React.FC = () => (
  <svg width={0} height={0} style={{ position: "absolute" }}>
    <defs>
      {[1, 2, 3, 4].map((d) => (
        <filter key={d} id={`d${d}`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx={2 + d * 3} dy={4 + d * 5} stdDeviation={3 + d * 2.5} floodColor="#3b2a1a" floodOpacity={0.22 + d * 0.05} />
        </filter>
      ))}
    </defs>
  </svg>
);

/** 一張剪好的紙：平塗色＋投影＋左上切口受光的細亮邊。 */
export const Cut: React.FC<{ d: string; fill: string; depth?: number; opacity?: number; evenodd?: boolean; stroke?: string }> = ({
  d,
  fill,
  depth = 2,
  opacity = 1,
  evenodd,
  stroke,
}) => (
  <g filter={`url(#d${depth})`} opacity={opacity}>
    <path d={d} fill={fill} fillRule={evenodd ? "evenodd" : undefined} stroke={stroke} strokeOpacity={stroke ? 0.35 : undefined} strokeWidth={stroke ? 2 : undefined} />
    <path d={d} fill="none" stroke="#fff" strokeOpacity={0.28} strokeWidth={2} transform="translate(-1 -1)" />
  </g>
);

/** 定格抖動：每 2 格換一次微小位移與旋轉，讓紙偶有手作的「呼吸」。 */
export const Boil: React.FC<{ id: string; amp?: number; children: React.ReactNode; x?: number; y?: number }> = ({ id, amp = 1, children, x = 0, y = 0 }) => {
  const step = Math.floor(useCurrentFrame() / 2);
  const dx = (random(`${id}x${step}`) - 0.5) * 1.2 * amp;
  const dy = (random(`${id}y${step}`) - 0.5) * 1.2 * amp;
  const r = (random(`${id}r${step}`) - 0.5) * 0.6 * amp;
  return <g transform={`translate(${dx} ${dy}) rotate(${r} ${x} ${y})`}>{children}</g>;
};

/** 整個場景的 SVG 畫布。 */
export const Stage: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{ position: "absolute", inset: 0, ...style }}>
    {children}
  </svg>
);

/** 紙盒外框：永遠在最前面，影子落進盒內。 */
export const BoxFrame: React.FC<{ color?: string }> = ({ color = C.sand }) => (
  <Cut d="M-20,-20 H1100 V1940 H-20Z M70,70 H1010 V1850 H70Z" fill={color} depth={3} evenodd />
);

// ── 形狀工具 ─────────────────────────────────────────────────
const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const wave = (y: number, amp: number, n: number, seed: number, x0 = -40, x1 = 1120) => {
  const r = rng(seed);
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y + (r() * 2 - 1) * amp]);
  let d = `M${x0},2000 L${pts[0][0]},${pts[0][1].toFixed(0)}`;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    d += ` Q${(ax + (bx - ax) * 0.5).toFixed(0)},${(ay - amp * 0.6).toFixed(0)} ${bx.toFixed(0)},${by.toFixed(0)}`;
  }
  return `${d} L${x1},2000Z`;
};

export const skylineD = (y: number, seed: number) => {
  const r = rng(seed);
  let d = `M-20,2000 L-20,${y}`;
  let x = -20;
  while (x < 1100) {
    const w = 60 + Math.floor(r() * 70);
    const h = 40 + Math.floor(r() * 160);
    d += ` L${x},${y - h} L${x + w},${y - h}`;
    if (r() < 0.35) d += ` L${x + w / 2},${y - h - 50}`;
    x += w;
    d += ` L${x},${y - h}`;
  }
  return `${d} L1100,${y} L1100,2000Z`;
};

export const circleD = (cx: number, cy: number, r: number) => `M${cx + r},${cy} A${r},${r} 0 1 0 ${cx - r},${cy} A${r},${r} 0 1 0 ${cx + r},${cy}Z`;

export const leafD = (x: number, y: number, L: number, W: number, ang: number) => {
  const a = (ang * Math.PI) / 180;
  const p = (u: number, v: number) => [x + u * Math.cos(a) - v * Math.sin(a), y + u * Math.sin(a) + v * Math.cos(a)].map((n) => n.toFixed(1));
  const t = p(L, 0);
  const c1 = p(L * 0.45, -W);
  const c2 = p(L * 0.45, W);
  return `M${x},${y} Q${c1} ${t} Q${c2} ${x},${y}Z`;
};

export const stemD = (x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, bend = 0) => {
  const mx = (x0 + x1) / 2 + bend;
  const my = (y0 + y1) / 2;
  return `M${x0 - w0 / 2},${y0} Q${mx - (w0 + w1) / 4},${my} ${x1 - w1 / 2},${y1} L${x1 + w1 / 2},${y1} Q${mx + (w0 + w1) / 4},${my} ${x0 + w0 / 2},${y0}Z`;
};

/** 對白／標題紙卡（HTML 排字，字型才能正確套用）。 */
export const Card: React.FC<{
  lines: string[];
  x: number;
  y: number;
  size?: number;
  who?: string;
  color?: string;
  ink?: string;
  rot?: number;
  show?: number; // 0–1
  from?: "top" | "bottom" | "none";
}> = ({ lines, x, y, size = 60, who, color = C.paper, ink = C.ink, rot = -1.5, show = 1, from = "bottom" }) => {
  if (show <= 0.001) return null;
  const off = from === "top" ? -260 : from === "bottom" ? 260 : 0;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        translate: `-50% ${(1 - show) * off}px`,
        rotate: `${rot}deg`,
        opacity: Math.min(1, show * 2),
        padding: `${size * 0.55}px ${size * 0.8}px ${size * 0.6}px`,
        background: color,
        boxShadow: "8px 14px 18px rgba(59,42,26,.35)",
        fontFamily: SERIF,
        fontWeight: 900,
        fontSize: size,
        lineHeight: 1.35,
        color: ink,
        textAlign: "center",
        whiteSpace: "nowrap",
      }}
    >
      {who ? (
        <div
          style={{
            position: "absolute",
            left: 24,
            top: -22,
            padding: "2px 14px 4px",
            background: C.ink,
            color: C.paper,
            fontSize: 28,
            fontWeight: 900,
            boxShadow: "3px 5px 8px rgba(59,42,26,.3)",
          }}
        >
          {who}
        </div>
      ) : null}
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  );
};
