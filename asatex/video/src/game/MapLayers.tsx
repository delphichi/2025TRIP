import React from "react";
import { interpolate } from "remotion";
import { Glint } from "../lib/Glint";
import { EXPO_OUT, pop, tween } from "../lib/anim";
import { Dolphin } from "./Dolphin";
import { G, MONO } from "./theme";
import {
  ARRIVE_F, BOX_AT, DIST, DIST_TARGET, GEM_D, NODES, PICK_F, PIN_AT, ROUTE, TARGET, TOTAL,
  along, drop, landFrame, walkDist, walker,
} from "./world";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// ── 會動的城市：車、船、雲影 ─────────────────────────────────
const CARS: { path: [number, number, number, number]; speed: number; col: string; off: number }[] = [
  { path: [600, 1704, 2200, 1704], speed: 7, col: G.ink, off: 0 },
  { path: [2200, 1720, 600, 1720], speed: 6, col: G.pin, off: 700 },
  { path: [920, -200, 920, 1700], speed: 8, col: "#fff", off: 300 },
  { path: [1790, 1700, 1790, -200], speed: 6.5, col: G.park, off: 200 },
  { path: [940, 490, 2200, 490], speed: 7.5, col: G.navy, off: 500 },
  { path: [2200, 830, 940, 830], speed: 6, col: "#fff", off: 900 },
];

export const Cars: React.FC<{ f: number }> = ({ f }) => (
  <>
    {CARS.map((c, i) => {
      const [x0, y0, x1, y1] = c.path;
      const L = Math.hypot(x1 - x0, y1 - y0);
      const t = ((c.off + f * c.speed) % L) / L;
      const ang = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
      return (
        <g key={i} transform={`translate(${x0 + (x1 - x0) * t} ${y0 + (y1 - y0) * t}) rotate(${ang})`}>
          <rect x={-22} y={-11} width={44} height={22} rx={7} fill={c.col} stroke={G.ink} strokeWidth={3} />
          <rect x={4} y={-7} width={10} height={14} rx={2} fill="#cfe6f5" />
        </g>
      );
    })}
  </>
);

export const Boat: React.FC<{ f: number }> = ({ f }) => {
  const y = 1700 - f * 2.2;
  const x = 240 + Math.sin(f / 40) * 14;
  return (
    <g transform={`translate(${x} ${y}) rotate(-6)`}>
      <path d="M-18,70 L0,28 L18,70" fill="none" stroke="#fff" strokeWidth={4} opacity={0.8} />
      <path d="M-30,96 L0,28 L30,96" fill="none" stroke="#fff" strokeWidth={3} opacity={0.4} />
      <path d="M-16,-30 L16,-30 L12,26 L-12,26Z" fill="#fff" stroke={G.ink} strokeWidth={3} />
      <rect x={-8} y={-18} width={16} height={22} fill={G.pin} stroke={G.ink} strokeWidth={2} />
    </g>
  );
};

export const Clouds: React.FC<{ f: number }> = ({ f }) => (
  <>
    <defs>
      <radialGradient id="cloud">
        <stop offset="0" stopColor="#46392b" stopOpacity={0.13} />
        <stop offset="0.6" stopColor="#46392b" stopOpacity={0.06} />
        <stop offset="1" stopColor="#46392b" stopOpacity={0} />
      </radialGradient>
    </defs>
    {[
      [700, 700, 330, 170, 1.4],
      [1600, 2100, 380, 190, 1.1],
      [1150, 1250, 260, 120, 1.7],
      [1900, 600, 300, 150, 1.2],
    ].map(([x, y, rx, ry, v], i) => (
      <ellipse key={i} cx={x + f * v} cy={y + f * v * 0.25} rx={rx} ry={ry} fill="url(#cloud)" />
    ))}
  </>
);

// ── 地名（Geist Mono，需要網頁字體所以不放進快取底圖）──────────
export const Labels: React.FC = () => (
  <>
    {(
      [
        ["OCÉANO PACÍFICO", 160, 1900, -90, 30],
        ["PUERTO", 560, 380, -14, 30],
        ["ZOFRI · ZONA FRANCA", 1180, 230, 0, 30],
        ["IQUIQUE · CENTRO", 1050, 2150, 22, 30],
        ["MUELLE", 250, 860, 0, 22],
      ] as [string, number, number, number, number][]
    ).map(([t, x, y, a, s]) => (
      <text key={t} x={x} y={y} transform={`rotate(${a} ${x} ${y})`} fontFamily={MONO} fontSize={s} fontWeight={600} letterSpacing={5} fill={G.ink} opacity={0.55}>
        {t}
      </text>
    ))}
    <text x={1705} y={957} textAnchor="middle" fontFamily={MONO} fontSize={20} fontWeight={700} letterSpacing={2} fill="#fff">
      ASATEX
    </text>
  </>
);

// ── Dijkstra 擴散：交叉點依真實的最短距離依序點亮 ─────────────
export const Flood: React.FC<{ f: number }> = ({ f }) => {
  const R = interpolate(f, [48, 60], [0, DIST_TARGET * 1.12], clamp);
  const fade = tween(f, 70, 84, 1, 0);
  if (f < 48 || fade <= 0) return null;
  return (
    <g opacity={fade}>
      {NODES.map((n, k) => {
        const d = DIST[k];
        if (d > R) return null;
        const front = R - d < 220;
        return <circle key={k} cx={n[0]} cy={n[1]} r={front ? 13 : 8} fill={front ? G.pin : G.ink} opacity={front ? 1 : 0.35} />;
      })}
    </g>
  );
};

// ── 路線：走過的變淡紅實線，前方是虛線 ───────────────────────
const sub = (d0: number, d1: number) => {
  const pts: [number, number][] = [along(d0)];
  let acc = 0;
  for (let k = 1; k < ROUTE.length; k++) {
    acc += Math.hypot(ROUTE[k][0] - ROUTE[k - 1][0], ROUTE[k][1] - ROUTE[k - 1][1]);
    if (acc > d0 && acc < d1) pts.push(ROUTE[k]);
  }
  pts.push(along(d1));
  return "M" + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L");
};

export const Route: React.FC<{ f: number }> = ({ f }) => {
  if (f < 60) return null;
  const reveal = interpolate(f, [60, 68], [0, TOTAL], { ...clamp, easing: EXPO_OUT });
  const done = walkDist(f);
  const finished = f >= 270;
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {done > 0 ? <path d={sub(0, done)} stroke={G.pin} strokeWidth={finished ? 14 : 10} opacity={finished ? 0.85 : 0.3} /> : null}
      {done < TOTAL ? <path d={sub(done, Math.max(done, reveal))} stroke={G.ink} strokeWidth={9} strokeDasharray="2 24" /> : null}
    </g>
  );
};

// ── 收集品：網眼色票 ─────────────────────────────────────────
export const GEMS = [
  { name: "NEGRO", col: G.ink, q: 6 },
  { name: "ROJO", col: G.pin, q: 3 },
  { name: "PIEL", col: G.skin, q: 3 },
];

export const Gem: React.FC<{ x: number; y: number; col: string; s?: number; id: string; shine?: number }> = ({ x, y, col, s = 1, id, shine = 0 }) => {
  const d = 34;
  const line = col === G.ink ? "#5a5a5a" : G.ink;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <clipPath id={`gc-${id}`}>
        <path d={`M0,${-d} L${d},0 L0,${d} L${-d},0Z`} />
      </clipPath>
      <path d={`M0,${-d - 8} L${d + 8},0 L0,${d + 8} L${-d - 8},0Z`} fill="#fff" stroke={G.ink} strokeWidth={4} />
      <path d={`M0,${-d} L${d},0 L0,${d} L${-d},0Z`} fill={col} />
      <g clipPath={`url(#gc-${id})`} stroke={line} strokeWidth={2} opacity={0.6}>
        {Array.from({ length: 12 }, (_, k) => (
          <g key={k}>
            <line x1={-d + (k - 6) * 12} y1={-d} x2={d + (k - 6) * 12} y2={d} />
            <line x1={-d + (k - 6) * 12} y1={d} x2={d + (k - 6) * 12} y2={-d} />
          </g>
        ))}
      </g>
      {shine > 0 ? <Glint x={14} y={-18} size={16} scale={shine} /> : null}
    </g>
  );
};

export const MapGems: React.FC<{ f: number }> = ({ f }) => (
  <>
    {GEMS.map((g, i) => {
      if (f < 60 || f >= PICK_F[i]) return null;
      const [x, y] = along(GEM_D[i]);
      const bob = Math.sin((f + i * 9) / 5) * 5;
      return <Gem key={g.name} x={x} y={y - 46 + bob} col={g.col} s={0.85 * pop(f, 61 + i * 2, 7, 1.4)} id={`m${i}`} shine={1 + 0.15 * Math.sin(f / 3 + i)} />;
    })}
  </>
);

// ── 目標圖釘：彈簧落下（k260／d15）、壓扁、漣漪；到站再壓一次 ──
const PIN_DROP = 15;
const PIN_LAND = landFrame(PIN_DROP);
export const Pin: React.FC<{ f: number }> = ({ f }) => {
  if (f < PIN_DROP) return null;
  const y = -620 * (1 - drop(f, PIN_DROP));
  const sq = (t: number) => interpolate(f, [t, t + 2, t + 5, t + 9], [1, 0.76, 1.08, 1], clamp);
  const squash = Math.min(sq(PIN_LAND), sq(ARRIVE_F));
  const ripple = (t: number) =>
    f >= t && f < t + 22 ? (
      <g key={t}>
        {[0, 6].map((d) => (
          <ellipse
            key={d}
            cx={0}
            cy={0}
            rx={interpolate(f - t - d, [0, 16], [20, 120], clamp)}
            ry={interpolate(f - t - d, [0, 16], [7, 42], clamp)}
            fill="none"
            stroke={G.pin}
            strokeWidth={5}
            opacity={f - t - d < 0 ? 0 : interpolate(f - t - d, [0, 16], [0.8, 0], clamp)}
          />
        ))}
      </g>
    ) : null;
  return (
    <g transform={`translate(${PIN_AT[0]} ${PIN_AT[1]})`}>
      {ripple(PIN_LAND)}
      {ripple(ARRIVE_F)}
      <g transform={`translate(0 ${y}) scale(${1 / Math.sqrt(squash)} ${squash})`}>
        <path d="M0,0 C-10,-26 -34,-40 -34,-66 A34,34 0 1 1 34,-66 C34,-40 10,-26 0,0Z" fill={G.pin} stroke={G.ink} strokeWidth={5} />
        <circle cx={0} cy={-66} r={12} fill="#fff" stroke={G.ink} strokeWidth={3} />
      </g>
    </g>
  );
};

// ── 海豚 ─────────────────────────────────────────────────────
export const Walker: React.FC<{ f: number }> = ({ f }) => {
  if (f < 45) return null;
  const w = walker(f);
  const born = interpolate(f, [45, 48, 53], [0, 1.25, 1], { ...clamp, easing: EXPO_OUT });
  // 到站揮手三下
  const wave = f >= ARRIVE_F + 2 ? 60 + 35 * Math.sin(((f - ARRIVE_F - 2) / 8) * Math.PI * 2) * tween(f, 205, 215, 1, 0.3) : 0;
  const ready = f >= 62 && f < 75 ? 0.9 : 1; // ¡VAMOS! 時預備下蹲
  return (
    <g>
      {f < 56 ? (
        <circle cx={w.x} cy={w.y - 50} r={interpolate(f, [45, 56], [20, 110], clamp)} fill="none" stroke="#fff" strokeWidth={10} opacity={interpolate(f, [45, 56], [0.9, 0], clamp)} />
      ) : null}
      <Dolphin x={f >= ARRIVE_F ? TARGET[0] - 46 : w.x} y={w.y + 6} s={1.15 * born} hop={w.hop} squash={w.squash * ready} wave={wave} opacity={tween(f, 270, 276, 1, 0)} />
    </g>
  );
};

// ── 紙箱：從天而降（同一組彈簧），落地塵土，蓋子彈開噴光 ────────
export const BOX_DROP = 195;
export const BOX_LAND = landFrame(BOX_DROP);
export const Box: React.FC<{ f: number }> = ({ f }) => {
  if (f < BOX_DROP) return null;
  const y = -900 * (1 - drop(f, BOX_DROP));
  const open = drop(f, 210);
  const squash = interpolate(f, [BOX_LAND, BOX_LAND + 2, BOX_LAND + 5, BOX_LAND + 9], [1, 0.8, 1.06, 1], clamp);
  const lid = (side: number) =>
    `M${60 * side},-70 L${(60 + 50 * open) * side},${-70 - 40 * open} L${(10 + 20 * open) * side},${-100 - 30 * open} L0,-70Z`;
  return (
    <g transform={`translate(${BOX_AT[0]} ${BOX_AT[1]})`}>
      {f >= 210 ? (
        <g opacity={tween(f, 210, 216, 0, 0.9)} transform={`translate(0 -80) rotate(${(f - 210) * 0.6})`}>
          {Array.from({ length: 7 }, (_, k) => {
            const a = ((-160 + k * 23) * Math.PI) / 180;
            const L = 150 + 140 * tween(f, 210, 222, 0, 1);
            return <line key={k} x1={0} y1={0} x2={Math.cos(a) * L} y2={Math.sin(a) * L} stroke={G.gold} strokeWidth={12} strokeLinecap="round" />;
          })}
        </g>
      ) : null}
      {[-1, 1].map((side) =>
        f >= BOX_LAND ? (
          <g key={side}>
            {[0, 1].map((k) => {
              const t = f - BOX_LAND - k * 2;
              return t >= 0 && t < 16 ? (
                <circle key={k} cx={side * (90 + t * 3 + k * 20)} cy={4 - t * 0.6} r={14 - k * 4} fill="#fff" stroke={G.ink} strokeWidth={3} opacity={interpolate(t, [0, 16], [1, 0], clamp)} />
              ) : null;
            })}
          </g>
        ) : null,
      )}
      <g transform={`translate(0 ${y}) scale(${1 / Math.sqrt(squash)} ${squash})`}>
        <ellipse cx={0} cy={6} rx={80} ry={16} fill={G.ink} opacity={0.2} />
        <path d="M-60,-70 L60,-70 L60,0 L-60,0Z" fill={G.kraft} stroke={G.ink} strokeWidth={4} />
        <path d="M60,-70 L82,-84 L82,-14 L60,0Z" fill="#a97f4c" stroke={G.ink} strokeWidth={4} />
        <rect x={-48} y={-52} width={96} height={30} fill={G.red} />
        <text x={0} y={-30} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={17} fill="#fff" letterSpacing={1}>
          100 DOC.
        </text>
        <path d={lid(-1)} fill="#b8884f" stroke={G.ink} strokeWidth={4} />
        <path d={lid(1)} fill="#b8884f" stroke={G.ink} strokeWidth={4} />
      </g>
      {f >= 212 ? <Glint x={0} y={-90 - tween(f, 212, 224, 0, 90)} size={60} scale={pop(f, 212, 7, 1.5)} streak={tween(f, 212, 222, 0, 160)} /> : null}
    </g>
  );
};
