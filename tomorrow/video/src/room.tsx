// 房間（單點透視的紙模型）、光、日曆、紙山、紙盒、紙飛機、紙鳥。座標與分鏡 build_storyboard.py 相同。
import React from "react";
import { random } from "remotion";
import { C, Cut, SERIF, circleD, rng } from "./paper";

// ── 房間 ──────────────────────────────────────────────────────
export const Room: React.FC<{ books?: boolean; guitar?: boolean; shoes?: boolean; diary?: boolean; sky?: string; lampOn?: number }> = ({
  books = true,
  guitar = true,
  shoes = true,
  diary = true,
  sky = "#F6E7C8",
  lampOn = 0,
}) => (
  <g>
    <Cut d="M-400,-300 H2320 L1620,90 L300,90Z" fill={C.ceil} depth={1} />
    <Cut d="M300,90 H1620 V700 H300Z" fill={C.wall} depth={1} />
    <Cut d="M-400,-300 L300,90 L300,700 L-400,1400Z" fill={C.wall2} depth={2} />
    <Cut d="M1620,90 L2320,-300 L2320,1400 L1620,700Z" fill={C.wall2} depth={2} />
    <Cut d="M300,700 H1620 L2320,1400 H-400Z" fill={C.floor} depth={1} />
    {Array.from({ length: 8 }, (_, i) => {
      const k = i + 1;
      return <path key={k} d={`M${300 + (k * 1320) / 9},700 L${-400 + (k * 2720) / 9},1400`} stroke={C.floor2} strokeWidth={3} opacity={0.6} />;
    })}
    {/* 窗（左牆） */}
    <Cut d="M40,180 L232,232 L232,522 L40,562Z" fill={sky} depth={2} />
    <path d="M40,180 L232,232 L232,522 L40,562Z M136,206 L136,542 M40,370 L232,377" fill="none" stroke={C.paper} strokeWidth={12} />
    {/* 窗台 */}
    <Cut d="M30,560 L242,520 L262,532 L40,580Z" fill={C.paper} depth={2} />
    {/* 層架 */}
    <Cut d="M420,300 H760 V318 H420Z" fill={C.paper} depth={2} />
    {[
      [C.calred, 70],
      [C.sage, 82],
      [C.mustard, 64],
      [C.hoodie, 76],
      [C.wood2, 70],
    ].map(([c, h], k) => (
      <Cut key={k} d={`M${440 + k * 34},300 V${300 - (h as number)} H${468 + k * 34} V300Z`} fill={c as string} depth={1} />
    ))}
    {/* 海報 */}
    <Cut d="M880,330 H1220 V540 H880Z" fill="#2F4A5E" depth={2} />
    <Cut d="M900,520 L980,420 L1040,480 L1100,400 L1200,520Z" fill={C.mustard} depth={1} />
    <circle cx={1150} cy={380} r={22} fill={C.paper} opacity={0.8} />
    {/* 床 */}
    <Cut d="M1120,600 H1600 V780 H1120Z" fill={C.wood} depth={3} />
    <Cut d="M1130,560 H1590 V640 H1130Z" fill={C.bed} depth={3} />
    <Cut d="M1300,540 H1600 V650 H1300Z" fill={C.blanket} depth={3} />
    <Cut d="M1140,520 Q1160,490 1230,500 Q1270,520 1250,560 H1150Z" fill={C.paper} depth={3} />
    <Cut d="M1160,690 H1290 V730 H1160Z M1420,690 H1550 V730 H1420Z" fill={C.wood2} depth={2} />
    {/* 書桌 */}
    <Cut d="M400,640 H880 V676 H400Z" fill={C.wood} depth={3} />
    <Cut d="M420,676 H446 V900 H420Z M834,676 H860 V900 H834Z" fill={C.wood2} depth={3} />
    <Cut d="M700,676 H834 V780 H700Z" fill={C.wood} depth={3} />
    <Cut d="M752,720 H784 V734 H752Z" fill={C.mustard} depth={1} />
    {/* 檯燈 */}
    <Cut d="M470,640 H530 V628 H470Z" fill={C.paper} depth={3} />
    <g filter="url(#d3)" stroke={C.paper} strokeWidth={9} fill="none" strokeLinecap="round">
      <path d="M500,630 L470,520 L560,470" />
    </g>
    <Cut d="M540,450 L620,470 L600,520 L520,500Z" fill={C.paper} depth={3} />
    {lampOn > 0 ? <path d="M528,500 L600,518 L596,526 L524,508Z" fill="#FFE2A0" opacity={lampOn} /> : null}
    {books ? (
      <>
        <Cut d="M600,640 L760,640 L752,622 L608,622Z" fill={C.paper} depth={3} />
        <Cut d="M604,622 H756 V614 H604Z" fill={C.hoodie} depth={3} />
      </>
    ) : null}
    {diary ? <Cut d="M780,640 L860,640 L854,628 L786,628Z" fill={C.orange} depth={3} /> : null}
    {guitar ? <Guitar /> : null}
    {shoes ? <Cut d="M540,940 q10,-34 60,-30 l40,14 q30,4 30,22 Z M640,948 q10,-30 56,-28 l40,12 q28,6 28,22 Z" fill={C.paper} depth={3} /> : null}
  </g>
);

export const Guitar: React.FC = () => (
  <g transform="rotate(-12 1720 760)">
    <Cut d="M1700,420 H1740 V640 H1700Z" fill={C.wood2} depth={3} />
    <Cut d={`${circleD(1720, 640, 72)} ${circleD(1720, 780, 92)}`} fill={C.orange} depth={3} />
    <circle cx={1720} cy={720} r={22} fill={C.ink} />
  </g>
);

// ── 光 ────────────────────────────────────────────────────────
export type Lights = { sun?: number; moon?: number; night?: number; lamp?: number; dawn?: number; dim?: number; sweep?: number };
const BIG = { x: -3000, y: -3000, width: 9000, height: 9000 };

/** 一整格的光。sweep：光束落在地上的位置左右移動（時間流逝用）。 */
export const Light: React.FC<Lights> = ({ sun = 0, moon = 0, night = 0, lamp = 0, dawn = 0, dim = 0, sweep = 0 }) => {
  const beam = `M45,190 L232,236 L${1080 + sweep},972 L${540 + sweep * 0.8},1000Z`;
  const patch = `M${560 + sweep * 0.8},770 L${990 + sweep},760 L${1090 + sweep},990 L${520 + sweep * 0.8},1000Z`;
  return (
    <g style={{ pointerEvents: "none" }}>
      {night > 0 ? <rect {...BIG} fill="#1d2a45" style={{ mixBlendMode: "multiply" }} opacity={0.62 * night} /> : null}
      {dim > 0 ? <rect {...BIG} fill="#5a4a3a" style={{ mixBlendMode: "multiply" }} opacity={0.35 * dim} /> : null}
      {sun > 0 ? (
        <>
          <path d={beam} fill="url(#beam)" filter="url(#soft)" style={{ mixBlendMode: "screen" }} opacity={0.75 * sun} />
          <path d={patch} fill="#FFE6B0" filter="url(#soft)" style={{ mixBlendMode: "screen" }} opacity={0.45 * sun} />
        </>
      ) : null}
      {moon > 0 ? <path d={beam} fill="url(#moon)" filter="url(#soft)" style={{ mixBlendMode: "screen" }} opacity={0.55 * moon} /> : null}
      {dawn > 0 ? (
        <>
          <path d="M45,200 L232,250 L1180,920 L660,960Z" fill="url(#dawn)" filter="url(#soft)" style={{ mixBlendMode: "screen" }} opacity={0.8 * dawn} />
          <rect {...BIG} fill="#FFD9B8" style={{ mixBlendMode: "multiply" }} opacity={0.18 * dawn} />
        </>
      ) : null}
      {lamp > 0 ? <ellipse cx={600} cy={580} rx={460} ry={330} fill="url(#lamp)" style={{ mixBlendMode: "screen" }} opacity={0.7 * lamp} /> : null}
    </g>
  );
};

/** 光束裡的浮塵：慢慢漂，飄出光束就從另一頭回來。 */
export const Dust: React.FC<{ f: number; k?: number; n?: number }> = ({ f, k = 1, n = 46 }) => {
  if (k <= 0) return null;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const t0 = random(`dt${i}`);
        const kk = random(`dk${i}`);
        const t = (t0 + f * (0.0006 + random(`ds${i}`) * 0.0008)) % 1;
        const x = 140 + t * 820 + kk * 160 + Math.sin(f / 30 + i) * 6;
        const y = 220 + t * 760 - kk * 40 + Math.cos(f / 26 + i * 2) * 8;
        const a = Math.sin(Math.PI * t);
        return <circle key={i} cx={x} cy={y} r={1.5 + random(`dr${i}`) * 2.5} fill="#FFF4D8" opacity={(0.3 + random(`do${i}`) * 0.55) * a * k} />;
      })}
    </g>
  );
};

// ── 日曆 ──────────────────────────────────────────────────────
export const Cal: React.FC<{ x: number; y: number; s?: number; rot?: number; text?: string; depth?: number; flat?: boolean; sq?: number }> = ({
  x,
  y,
  s = 1,
  rot = 0,
  text = "明天",
  depth = 2,
  flat,
  sq = 0,
}) => {
  const lines = text.split("/");
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s * (1 + sq)} ${s * (1 - sq)})`}>
      <Cut d="M-36,-44 H36 V44 H-36Z" fill={C.paper} depth={depth} flat={flat} />
      <path d="M-36,-44 H36 V-24 H-36Z" fill={C.calred} />
      <circle cx={-16} cy={-34} r={3} fill={C.paper} />
      <circle cx={16} cy={-34} r={3} fill={C.paper} />
      {text && lines.length === 1 ? (
        <text x={0} y={16} textAnchor="middle" fontFamily={SERIF} fontWeight={900} fontSize={text.length <= 2 ? 26 : 17} fill={C.ink}>
          {text}
        </text>
      ) : null}
      {lines.length > 1
        ? lines.map((ln, k) => (
            <text key={k} x={0} y={4 + k * 22} textAnchor="middle" fontFamily={SERIF} fontWeight={900} fontSize={k ? 17 : 20} fill={C.ink}>
              {ln}
            </text>
          ))
        : null}
    </g>
  );
};

const WORDS = ["明天", "明天", "下週", "星期一", "星期三", "明天", "", "明天", "星期五", "下週"];

// ── 紙山：level 0–1 ─────────────────────────────────────────────
const bez = (p0: number, p1: number, p2: number, t: number) => (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
const surface = (top: number) => {
  const segs: [number, number, number, number, number, number][] = [
    [-60, top + 320, 300, top + 60, 700, top],
    [700, top, 1100, top - 20, 1400, top + 140],
    [1400, top + 140, 1700, top + 260, 1980, top + 300],
  ];
  const pts: [number, number][] = [];
  for (const [x0, y0, x1, y1, x2, y2] of segs) for (let i = 0; i <= 16; i++) pts.push([bez(x0, x1, x2, i / 16), bez(y0, y1, y2, i / 16)]);
  return (x: number) => {
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        const [ax, ay] = pts[i - 1];
        const [bx, by] = pts[i];
        return ay + ((by - ay) * (x - ax)) / (bx - ax || 1);
      }
    }
    return pts[pts.length - 1][1];
  };
};

const PILE = (() => {
  const r = rng(77);
  return Array.from({ length: 110 }, () => ({ x: r() * 1960 - 20, d: Math.pow(r(), 0.8), s: 0.7 + r() * 0.45, rot: r() * 70 - 35, w: WORDS[Math.floor(r() * WORDS.length)] }));
})();

export const Mountain: React.FC<{ level: number; cut?: number }> = ({ level, cut }) => {
  if (level <= 0.01) return null;
  const top = 1020 - 620 * level;
  const surf = surface(top);
  const d = `M-400,1400 L-400,${top + 320} L-60,${top + 320} Q300,${top + 60} 700,${top} Q1100,${top - 20} 1400,${top + 140} Q1700,${top + 260} 1980,${top + 300} L2320,${top + 300} L2320,1400Z`;
  const n = Math.round(PILE.length * Math.min(1, level * 1.1));
  return (
    <g>
      <Cut d={d} fill="#F1EADB" depth={3} />
      <g filter="url(#d2)">
        {PILE.slice(0, cut ?? n).map((p, i) => {
          const sy = surf(p.x);
          const y = sy + 24 + p.d * (1100 - sy);
          return <Cal key={i} x={p.x} y={y} s={p.s} rot={p.rot} text={p.w} flat />;
        })}
      </g>
    </g>
  );
};

/** 散在地上的日曆（紙山出現之前）。 */
export const FLOOR_CALS = [
  [600, 900, 12],
  [760, 960, -20],
  [980, 1010, 8],
  [1180, 880, -30],
  [420, 1010, 25],
  [1380, 990, -8],
  [880, 860, 40],
  [1560, 930, 18],
  [300, 920, -14],
  [1060, 940, -40],
  [700, 1040, 6],
  [1260, 1050, 30],
] as const;
export const FloorCals: React.FC<{ n: number }> = ({ n }) => (
  <g filter="url(#d2)">
    {FLOOR_CALS.slice(0, n).map(([x, y, r], i) => (
      <Cal key={i} x={x} y={y} s={1} rot={r} text={WORDS[i % WORDS.length] || "明天"} flat />
    ))}
  </g>
);

// ── 紙盒 ──────────────────────────────────────────────────────
export const Box: React.FC<{ x: number; y: number; label: string; color: string; items?: number; bump?: number }> = ({ x, y, label, color, items = 2, bump = 0 }) => (
  <g transform={`translate(0 ${-bump * 10})`}>
    <Cut d={`M${x - 130},${y} V${y - 150} H${x + 130} V${y}Z`} fill="#D9B98E" depth={3} />
    <Cut
      d={`M${x - 130},${y - 150} L${x - 160},${y - 200} L${x - 100},${y - 200} L${x - 80},${y - 150}Z M${x + 130},${y - 150} L${x + 160},${y - 200} L${x + 100},${y - 200} L${x + 80},${y - 150}Z`}
      fill="#C9A579"
      depth={3}
    />
    {Array.from({ length: Math.min(items, 7) }, (_, k) => (
      <Cal key={k} x={x - 60 + (k % 4) * 40} y={y - 166 - Math.floor(k / 4) * 16 + (k % 3) * 4} s={0.8} rot={[-12, 8, -4, 14, -8][k % 5]} text="" />
    ))}
    <Cut d={`M${x - 110},${y - 110} H${x + 110} V${y - 50} H${x - 110}Z`} fill={color} depth={2} />
    <text x={x} y={y - 68} textAnchor="middle" fontFamily={SERIF} fontWeight={900} fontSize={label.length <= 4 ? 30 : 24} fill={C.paper}>
      {label}
    </text>
  </g>
);

// ── 小紙條、紙飛機、紙鳥 ───────────────────────────────────────
export const Note: React.FC<{ x: number; y: number; s?: number; rot?: number; text?: string }> = ({ x, y, s = 1, rot = 0, text = "數學…" }) => (
  <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
    <Cut d="M-40,-26 L38,-30 L42,24 L-36,28Z" fill={C.note} depth={2} />
    <text x={0} y={8} textAnchor="middle" fontFamily={SERIF} fontWeight={900} fontSize={20} fill={C.ink}>
      {text}
    </text>
  </g>
);

/** 日曆 → 紙飛機：k = 0 是一張日曆，k = 1 摺好。 */
export const Plane: React.FC<{ x: number; y: number; s?: number; rot?: number; k: number; flip?: boolean }> = ({ x, y, s = 1, rot = 0, k, flip }) => {
  const L = (a: number, b: number) => a + (b - a) * k;
  // 四角從方形（日曆）移到機翼形狀
  const p = [
    [L(-36, -70), L(-44, -30)],
    [L(36, 70), L(-44, 0)],
    [L(36, -70), L(44, 30)],
    [L(-36, -40), L(44, 0)],
  ];
  const d = `M${p[0][0]},${p[0][1]} L${p[1][0]},${p[1][1]} L${p[2][0]},${p[2][1]} L${p[3][0]},${p[3][1]}Z`;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${flip ? -s : s} ${s})`}>
      <Cut d={d} fill={C.paper} depth={4} />
      {k < 0.5 ? <path d={`M${p[0][0]},${p[0][1]} L${p[1][0]},${p[1][1]} L${L(36, 50)},${L(-24, 0)} L${L(-36, -50)},${L(-24, -10)}Z`} fill={C.calred} opacity={1 - k * 2} /> : null}
      {k > 0.5 ? (
        <>
          <path d={`M${p[0][0]},${p[0][1]} L${p[1][0]},${p[1][1]} L${p[0][0] + 10},${p[0][1] + 14}Z`} fill={C.calred} opacity={(k - 0.5) * 2} />
          <path d={`M${p[3][0]},${p[3][1]} L${p[1][0]},${p[1][1]}`} stroke={C.ink} strokeOpacity={0.35 * (k - 0.5) * 2} strokeWidth={3} />
        </>
      ) : null}
    </g>
  );
};

export const Bird: React.FC<{ x: number; y: number; s?: number; flap: number; rot?: number }> = ({ x, y, s = 1, flap, rot = -10 }) => {
  const wy = -80 * flap;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <Cut d={`M0,0 L-80,${-40 * flap} L-20,-6 L-60,${wy} L10,-10 L70,-24 L30,8 L90,0 L20,22Z`} fill={C.paper} depth={3} />
    </g>
  );
};

/** 紙山表面在 x 的高度（角色站上去用）。 */
export const mountainY = (level: number, x: number) => surface(1020 - 620 * level)(x);
