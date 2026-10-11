// 道具：房子、火車、剪刀、天際線、時鐘、電池、指南針、紙團、樹。
import React from "react";
import { C, Cut, circleD, leafD, skylineD, stemD } from "./paper";

/** 紙房子。rise 0–1：以底邊為鉸鏈立起（立體書）；lit：已亮的窗數。 */
export const House: React.FC<{ x: number; y: number; w: number; h: number; roof: string; rise?: number; lit?: number; cols?: number; rows?: number; depth?: number }> = ({
  x,
  y,
  w,
  h,
  roof,
  rise = 1,
  lit = 99,
  cols = 2,
  rows = 3,
  depth = 2,
}) => {
  if (rise <= 0.01) return null;
  const wins: React.ReactNode[] = [];
  let k = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const wx = x + (w * (i + 1)) / (cols + 1) - 12;
      const wy = y - h + 30 + j * 46;
      wins.push(<rect key={`${i}-${j}`} x={wx} y={wy} width={24} height={30} rx={3} fill={k < lit ? C.light : "#3a3a44"} opacity={k < lit ? 1 : 0.35} />);
      k++;
    }
  }
  return (
    <g transform={`translate(0 ${y}) scale(1 ${rise}) translate(0 ${-y})`}>
      <Cut d={`M${x},${y} V${y - h} H${x + w} V${y}Z`} fill={C.paper} depth={depth} />
      <Cut d={`M${x - 10},${y - h + 4} L${x + w / 2},${y - h - w * 0.45} L${x + w + 10},${y - h + 4}Z`} fill={roof} depth={depth} />
      {wins}
    </g>
  );
};

export const Skyline: React.FC<{ y: number; seed: number; color: string; depth?: number }> = ({ y, seed, color, depth = 1 }) => (
  <Cut d={skylineD(y, seed)} fill={color} depth={depth} />
);

/** 三節小火車。wheel：車輪轉角；smoke：卡住冒煙（0–1）。 */
export const Train: React.FC<{ x: number; y: number; s?: number; smoke?: number; tilt?: number }> = ({ x, y, s = 1, smoke = 0, tilt = 0 }) => (
  <g transform={`translate(${x} ${y}) scale(${s}) rotate(${tilt})`}>
    {[C.terra, C.gold, C.green].map((c, k) => {
      const bx = -k * 130;
      return (
        <g key={c}>
          <Cut d={`M${bx - 56},0 V-66 H${bx + 56} V0Z`} fill={c} depth={3} />
          <rect x={bx - 36} y={-52} width={28} height={22} rx={3} fill={C.light} />
          <rect x={bx + 6} y={-52} width={28} height={22} rx={3} fill={C.light} />
          <Cut d={`${circleD(bx - 16, 4, 14)} ${circleD(bx + 16, 4, 14)}`} fill={C.ink} depth={2} />
        </g>
      );
    })}
    <Cut d="M56,-66 L80,-66 L80,-96 L56,-96Z" fill={C.terra} depth={3} />
    {smoke > 0
      ? [0, 1, 2].map((k) => {
          const t = Math.max(0, Math.min(1, smoke * 3 - k));
          return t > 0 ? <Cut key={k} d={circleD(68 + k * 24, -120 - k * 42, (16 + k * 7) * t)} fill="#6a6a6a" depth={2} opacity={0.9} /> : null;
        })
      : null}
  </g>
);

/** 剪刀：open 為刀刃張開角度。 */
export const Scissors: React.FC<{ x: number; y: number; s?: number; ang?: number; open?: number }> = ({ x, y, s = 1, ang = 0, open = 18 }) => (
  <g transform={`translate(${x} ${y}) scale(${s}) rotate(${ang})`}>
    <g transform={`rotate(${-open / 2})`}>
      <Cut d="M0,0 L250,-14 L262,0 L250,8Z" fill="#C9CDD2" depth={3} />
      <Cut d="M0,0 L-60,26 A34,30 0 1 1 -110,8 L-50,-6Z" fill={C.terra} depth={3} />
    </g>
    <g transform={`rotate(${open / 2})`}>
      <Cut d="M0,0 L250,14 L262,0 L250,-8Z" fill="#B8BDC3" depth={3} />
      <Cut d="M0,0 L-60,-26 A34,30 0 1 0 -110,-8 L-50,6Z" fill={C.terra} depth={3} />
    </g>
    <circle r={9} fill={C.brad} stroke={C.ink} strokeWidth={2} />
  </g>
);

export const Clock: React.FC<{ x: number; y: number; t: number; blur?: boolean }> = ({ x, y, t, blur }) => (
  <g transform={`translate(${x} ${y})`}>
    <Cut d={circleD(0, 0, 70)} fill="#fbf7f0" depth={2} />
    <g transform={`rotate(${t * 3})`}>
      <path d="M0,0 L0,-52" stroke={C.ink} strokeWidth={6} strokeLinecap="round" />
    </g>
    <g transform={`rotate(${t * 0.25})`}>
      <path d="M0,0 L0,-34" stroke={C.ink} strokeWidth={8} strokeLinecap="round" />
    </g>
    {blur ? <path d="M-86,-34 A92,92 0 0 1 -34,-86" fill="none" stroke="#fff" strokeWidth={6} opacity={0.6} strokeLinecap="round" /> : null}
    <circle r={6} fill={C.terra} />
  </g>
);

/** 揉皺的紙團（不規則多邊形＋摺痕）。 */
export const Crumple: React.FC<{ x: number; y: number; s?: number; seed?: number }> = ({ x, y, s = 1, seed = 0 }) => {
  const pts = Array.from({ length: 9 }, (_, k) => {
    const a = (k / 9) * Math.PI * 2;
    const r = 60 + ((Math.sin(seed * 7.1 + k * 2.3) + 1) / 2) * 26;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  const d = `M${pts.map((p) => p.map((n) => n.toFixed(0)).join(",")).join(" L")}Z`;
  return (
    <g transform={`translate(${x} ${y}) scale(${s}) rotate(${seed * 37})`}>
      <Cut d={d} fill="#fbf7f0" depth={3} />
      <path d={`M${pts[1]} L0,0 L${pts[5]} M0,0 L${pts[7]} M${pts[3]} L10,-6`} stroke={C.ink} strokeOpacity={0.2} strokeWidth={3} fill="none" />
    </g>
  );
};

export const Sun: React.FC<{ x: number; y: number; r: number; spin?: number }> = ({ x, y, r, spin = 0 }) => {
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6 + spin;
    const p = (rr: number, da: number) => `${(x + rr * Math.cos(a + da)).toFixed(0)},${(y + rr * Math.sin(a + da)).toFixed(0)}`;
    return `M${p(r + 14, 0)} L${p(r + 46, 0.08)} L${p(r + 46, -0.08)}Z`;
  }).join(" ");
  return (
    <>
      <Cut d={rays} fill={C.gold} depth={1} />
      <Cut d={circleD(x, y, r)} fill={C.gold} depth={2} />
    </>
  );
};

export const Moon: React.FC<{ x: number; y: number; r: number }> = ({ x, y, r }) => <Cut d={circleD(x, y, r)} fill="#F4E4B0" depth={1} />;

/** 小樹：grow 0–1 莖長高、葉子依序翻開。 */
export const Sapling: React.FC<{ x: number; y: number; grow: number; h?: number }> = ({ x, y, grow, h = 420 }) => {
  if (grow <= 0) return null;
  const hh = h * Math.min(1, grow * 1.3);
  const leaves = [
    [0.3, 150, 58, -150],
    [0.42, 160, 60, -30],
    [0.58, 140, 52, -140],
    [0.7, 130, 48, -40],
    [0.86, 100, 40, -120],
    [1.0, 80, 32, -90],
  ];
  return (
    <>
      <Cut d={stemD(x, y, x + 4, y - hh, 34, 12, 6)} fill={C.deep} depth={3} />
      {leaves.map(([t, L, W, a], k) => {
        const g = Math.max(0, Math.min(1, (grow - 0.25 - k * 0.11) * 5));
        if (g <= 0) return null;
        return <Cut key={k} d={leafD(x + 2, y - hh * t, L * g, W * g, a)} fill={k % 2 ? "#5E9474" : C.green} depth={3} />;
      })}
    </>
  );
};
