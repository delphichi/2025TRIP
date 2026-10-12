// 紙雕基本零件（16:9）：分層投影、切口受光、定格「一拍兩格」、鏡頭。
// 與 tomorrow/build_storyboard.py 同一套手法與座標，分鏡上的關鍵格可以直接對照。
import React from "react";
import { Easing, interpolate, random, staticFile, useCurrentFrame } from "remotion";
import { loadFont } from "@remotion/fonts";

for (const w of ["700", "900"]) {
  loadFont({ family: "Noto Serif TC", url: staticFile(`noto-serif-tc-${w}.woff2`), weight: w });
}

export const FPS = 24;
export const W = 1920;
export const H = 1080;
export const SERIF = "Noto Serif TC";
export const C = {
  wall: "#D9E1DF",
  wall2: "#C3CDCB",
  ceil: "#E8E3D8",
  floor: "#9C8068",
  floor2: "#86694F",
  wood: "#D8B88A",
  wood2: "#B48E66",
  bed: "#3E4352",
  blanket: "#E9E2D3",
  orange: "#E0663A",
  mustard: "#D9B44A",
  ink: "#2A2522",
  paper: "#FBF7F0",
  calred: "#D6453A",
  hoodie: "#4F7FA6",
  hoodie2: "#3E6A92",
  skin: "#F2D4B0",
  hair: "#3B2A20",
  sage: "#8FA98B",
  note: "#FFF6D6",
  pants: "#3A3A44",
  brad: "#C9A24A",
  dark: "#1d1a18",
};

/** 秒 → 格 */
export const s2f = (s: number) => Math.round(s * FPS);

export const EXPO_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EXPO_IN = Easing.bezier(0.7, 0, 0.84, 0);
export const IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
export const SINE = Easing.bezier(0.37, 0, 0.63, 1);
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const tw = (f: number, a: number, b: number, from: number, to: number, easing = EXPO_OUT) =>
  interpolate(f, [a, b], [from, to], { ...clamp, easing });
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 立體書彈起：0 → 過衝 → 1 */
export const popUp = (f: number, start: number, n = 8) =>
  interpolate(f, [start, start + n * 0.55, start + n], [0, 1.12, 1], { ...clamp, easing: EXPO_OUT });
/** 落地：從上方掉下、落地彈一下。回傳 [y 位移, 壓扁量] */
export const drop = (f: number, start: number, h = 500, n = 8): [number, number] => {
  if (f < start) return [-h, 0];
  const t = (f - start) / n;
  if (t < 1) return [-h * (1 - t * t), 0];
  const b = (f - start - n) / 6;
  if (b < 1) return [-30 * Math.sin(Math.PI * b), b < 0.3 ? 0.15 * (1 - b / 0.3) : 0];
  return [0, 0];
};

/** 定格節奏：動作「一拍兩格」—— 每 2 格才更新一次。鏡頭不套用。 */
export const twos = (f: number) => Math.floor(f / 2) * 2;

/** 全片共用的濾鏡與漸層。放在畫面最底下一次就好。 */
export const PaperDefs: React.FC = () => (
  <svg width={0} height={0} style={{ position: "absolute" }}>
    <defs>
      {[1, 2, 3, 4].map((d) => (
        <filter key={d} id={`d${d}`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx={2 + d * 3} dy={4 + d * 5} stdDeviation={3 + d * 2.5} floodColor="#3b2a1a" floodOpacity={0.22 + d * 0.05} />
        </filter>
      ))}
      <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation={14} />
      </filter>
      <filter id="dof" x="-5%" y="-5%" width="110%" height="110%">
        <feGaussianBlur stdDeviation={9} />
      </filter>
      <linearGradient id="beam" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#FFE9B8" stopOpacity={0.95} />
        <stop offset="1" stopColor="#FFD58A" stopOpacity={0.15} />
      </linearGradient>
      <linearGradient id="dawn" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#FFD1A6" stopOpacity={0.95} />
        <stop offset="1" stopColor="#FFB98A" stopOpacity={0.12} />
      </linearGradient>
      <linearGradient id="moon" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#BFD3FF" stopOpacity={0.55} />
        <stop offset="1" stopColor="#9DB6E8" stopOpacity={0.05} />
      </linearGradient>
      <radialGradient id="lamp">
        <stop offset="0" stopColor="#FFE2A0" stopOpacity={0.95} />
        <stop offset="0.45" stopColor="#FFC970" stopOpacity={0.35} />
        <stop offset="1" stopColor="#FFC970" stopOpacity={0} />
      </radialGradient>
    </defs>
  </svg>
);

/** 一張剪好的紙：平塗色＋投影＋左上切口受光的細亮邊。flat = 不各自投影（交給外層群組一次算）。 */
export const Cut: React.FC<{ d: string; fill: string; depth?: number; opacity?: number; evenodd?: boolean; flat?: boolean }> = ({
  d,
  fill,
  depth = 2,
  opacity = 1,
  evenodd,
  flat,
}) => (
  <g filter={flat ? undefined : `url(#d${depth})`} opacity={opacity}>
    <path d={d} fill={fill} fillRule={evenodd ? "evenodd" : undefined} />
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

/** 整個場景的 SVG 畫布（16:9）。 */
export const Stage: React.FC<{ children: React.ReactNode; bg?: string }> = ({ children, bg = C.wall }) => (
  <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, background: bg }}>
    {children}
  </svg>
);

/** 鏡頭：把房間座標 (cx, cy) 對準畫面中心、放大 z 倍。紙的投影也跟著放大，就像攝影機靠近模型。 */
export const Cam: React.FC<{ cx?: number; cy?: number; z?: number; rot?: number; children: React.ReactNode; filter?: string }> = ({
  cx = 960,
  cy = 540,
  z = 1,
  rot = 0,
  children,
  filter,
}) => (
  <g filter={filter}>
    <g transform={`translate(960 540) rotate(${rot}) scale(${z}) translate(${-cx} ${-cy})`}>{children}</g>
  </g>
);

/** 鏡頭關鍵格之間的插值（放大倍率在對數空間插值，推近拉遠速度才均勻）。 */
export type Shot = { f: number; cx: number; cy: number; z: number };
export const camAt = (f: number, keys: Shot[], easing = IN_OUT) => {
  if (f <= keys[0].f) return keys[0];
  for (let k = 1; k < keys.length; k++) {
    const a = keys[k - 1];
    const b = keys[k];
    if (f <= b.f) {
      const t = easing((f - a.f) / (b.f - a.f));
      return { f, cx: lerp(a.cx, b.cx, t), cy: lerp(a.cy, b.cy, t), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), t)) };
    }
  }
  return keys[keys.length - 1];
};

/** 手持感：極小的鏡頭晃動（不套「一拍兩格」，保持平順）。 */
export const handheld = (f: number, amp = 1) => ({
  x: (Math.sin(f / 23) * 3 + Math.sin(f / 9.7) * 1.2) * amp,
  y: (Math.cos(f / 19) * 2.4 + Math.sin(f / 11.3) * 1) * amp,
});

// ── 形狀工具 ─────────────────────────────────────────────────
export const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const circleD = (cx: number, cy: number, r: number) => `M${cx + r},${cy} A${r},${r} 0 1 0 ${cx - r},${cy} A${r},${r} 0 1 0 ${cx + r},${cy}Z`;

export const strip = (ax: number, ay: number, bx: number, by: number, w = 24) => {
  let nx = -(by - ay);
  let ny = bx - ax;
  const L = Math.hypot(nx, ny) || 1;
  nx = (nx / L) * (w / 2);
  ny = (ny / L) * (w / 2);
  return `M${(ax + nx).toFixed(1)},${(ay + ny).toFixed(1)} L${(bx + nx).toFixed(1)},${(by + ny).toFixed(1)} L${(bx - nx).toFixed(1)},${(by - ny).toFixed(1)} L${(ax - nx).toFixed(1)},${(ay - ny).toFixed(1)}Z`;
};

export const rad = (d: number) => (d * Math.PI) / 180;

/** 速度線（啪！） */
export const PopLines: React.FC<{ x: number; y: number; r?: number; k?: number; color?: string }> = ({ x, y, r = 60, k = 1, color = C.ink }) => {
  if (k <= 0) return null;
  return (
    <g opacity={Math.min(1, k * 2)}>
      {[-150, -110, -70, -30].map((d) => {
        const a = rad(d);
        const r0 = r + (1 - k) * 30;
        return (
          <path
            key={d}
            d={`M${x + Math.cos(a) * r0},${y + Math.sin(a) * r0} l${Math.cos(a) * 30 * k},${Math.sin(a) * 30 * k}`}
            stroke={color}
            strokeWidth={6}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
};
