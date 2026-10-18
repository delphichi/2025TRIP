// FeelFul 粉紅小章魚 v2（精緻版，照 public/feelful/brand.jpg）：
// 圓頂大頭＋斑點＋高光、透明護目鏡（白框＋側邊扣帶＋玻璃反光）、星空大眼＋睫毛、短捲觸手＋吸盤。
// props 跟 FeelFul.tsx 的 Octo 相同（fill 0..1 吸飽程度、phase in/out/ready、f 影格），可直接替換。
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

const INK = "#3b2466";

// 觸手：沿著中心線積分，寬度由粗到細，末端往外捲
const tentacle = (bx: number, side: number, a0: number, curl: number, len: number, wig: number) => {
  const n = 36, ds = len / n;
  const pts: { x: number; y: number; a: number; w: number }[] = [];
  let x = bx, y = 150;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const a = side * (a0 + curl * Math.pow(s, 2.3)) + wig * s;
    const w = 52 * (1 - s) + 14;
    pts.push({ x, y, a, w });
    x += Math.sin((a * Math.PI) / 180) * ds;
    y += Math.cos((a * Math.PI) / 180) * ds;
  }
  const off = (p: (typeof pts)[number], k: number) => {
    const r = (p.a * Math.PI) / 180;
    return [p.x + Math.cos(r) * k, p.y - Math.sin(r) * k] as const;
  };
  const L = pts.map((p) => off(p, p.w / 2)), R = pts.map((p) => off(p, -p.w / 2));
  const tip = pts[n];
  const d = `M${L.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" L")} A${tip.w / 2},${tip.w / 2} 0 0 1 ${R[n][0].toFixed(1)},${R[n][1].toFixed(1)} L${R.slice().reverse().map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" L")} Z`;
  // 吸盤在捲曲的內側（side 正 → +normal）
  const suckers = pts.filter((_, i) => i > n * 0.38 && i % 4 === 0).map((p) => {
    const [sx, sy] = off(p, side * p.w * 0.2);
    return { x: sx, y: sy, r: p.w * 0.2, a: p.a };
  });
  const hi = pts.slice(2, Math.round(n * 0.7)).map((p) => off(p, -side * p.w * 0.22));
  return { d, suckers, hi };
};

export const OctoV2: React.FC<{ fill: number; phase: string; f: number }> = ({ fill, phase, f }) => {
  const calm = phase === "out";
  const spread = 0.4 + 0.6 * fill;
  const legs = [
    { bx: -150, side: -1, k: 2 }, { bx: -92, side: -1, k: 1 }, { bx: -32, side: -1, k: 0 },
    { bx: 32, side: 1, k: 0 }, { bx: 92, side: 1, k: 1 }, { bx: 150, side: 1, k: 2 },
  ];
  return (
    <g>
      <defs>
        <radialGradient id="o2Head" cx="0.36" cy="0.22" r="0.95">
          <stop offset="0" stopColor="#ffeef7" /><stop offset="0.35" stopColor="#fbc4df" />
          <stop offset="0.75" stopColor="#ef9fca" /><stop offset="1" stopColor="#cf78b0" />
        </radialGradient>
        <linearGradient id="o2Leg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6b3d6" /><stop offset="1" stopColor="#e48fc0" />
        </linearGradient>
        <radialGradient id="o2Eye" cx="0.5" cy="0.38" r="0.75">
          <stop offset="0" stopColor="#8d7cf0" /><stop offset="0.45" stopColor="#4c3aa8" />
          <stop offset="0.85" stopColor="#241a63" /><stop offset="1" stopColor="#150f40" />
        </radialGradient>
        <linearGradient id="o2EyeLow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c7a8ff" stopOpacity="0" /><stop offset="1" stopColor="#e3b8ff" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="o2Glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.38" /><stop offset="0.5" stopColor="#f3e8ff" stopOpacity="0.12" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id="o2Rim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#e6dcf5" />
        </linearGradient>
        <clipPath id="o2HeadClip"><path d="M-235,40 C-268,-110 -205,-298 0,-298 C205,-298 268,-110 235,40 C228,170 130,212 0,212 C-130,212 -228,170 -235,40 Z" /></clipPath>
      </defs>

      {/* 觸手（先畫，頭蓋在上面）*/}
      {legs.map(({ bx, side, k }, i) => {
        const a0 = (4 + k * 16) * spread;
        const curl = 170 + k * 30;
        const len = (250 + (2 - k) * 16) * 0.8; // 比原設計短 20%
        const wig = Math.sin(f / 10 + i * 1.3) * (calm ? 9 : 5);
        const t = tentacle(bx, side, a0, curl, len, wig);
        return (
          <g key={i}>
            <path d={t.d} fill="url(#o2Leg)" stroke={INK} strokeWidth={7} strokeLinejoin="round" />
            <polyline points={t.hi.map(([a, b]) => `${a},${b}`).join(" ")} fill="none" stroke="#fff" strokeWidth={5} strokeLinecap="round" opacity={0.45} />
            {t.suckers.map((s, j) => (
              <g key={j} transform={`translate(${s.x},${s.y}) rotate(${-s.a})`}>
                <ellipse rx={s.r * 1.15} ry={s.r} fill="#fde3f0" stroke="#c76aa3" strokeWidth={2.5} />
                <ellipse rx={s.r * 0.45} ry={s.r * 0.4} fill="#e9a3c9" />
              </g>
            ))}
          </g>
        );
      })}

      {/* 頭 */}
      <path d="M-235,40 C-268,-110 -205,-298 0,-298 C205,-298 268,-110 235,40 C228,170 130,212 0,212 C-130,212 -228,170 -235,40 Z" fill="url(#o2Head)" />
      <g clipPath="url(#o2HeadClip)">
        {/* 右上斑點 */}
        {[[160, -170, 24], [196, -118, 16], [180, -222, 12], [212, -70, 10], [126, -230, 9]].map(([x, y, r], i) => (
          <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 1.15} fill="#d9789f" opacity={0.42} />
        ))}
        {/* 底部陰影＋邊緣反光 */}
        <ellipse cx={0} cy={236} rx={270} ry={80} fill="#b9629d" opacity={0.22} />
        <path d="M200,-120 C232,-60 238,0 226,40" stroke="#fff" strokeWidth={8} fill="none" opacity={0.35} strokeLinecap="round" />
      </g>
      <path d="M-235,40 C-268,-110 -205,-298 0,-298 C205,-298 268,-110 235,40 C228,170 130,212 0,212 C-130,212 -228,170 -235,40 Z" fill="none" stroke={INK} strokeWidth={9} />
      {/* 頭頂高光 */}
      <ellipse cx={-96} cy={-196} rx={66} ry={28} fill="#fff" opacity={0.75} transform="rotate(-28,-96,-196)" />
      <ellipse cx={-6} cy={-252} rx={18} ry={10} fill="#fff" opacity={0.7} transform="rotate(-8,-6,-252)" />
      <circle cx={-172} cy={-120} r={9} fill="#fff" opacity={0.6} />

      {/* 眼睛（在護目鏡後面）*/}
      {[-98, 98].map((x) => {
        const o = x > 0 ? 1 : -1;
        return calm ? (
          <g key={x}>
            <path d={`M${x - 50},10 Q${x},52 ${x + 50},10`} stroke={INK} strokeWidth={9} fill="none" strokeLinecap="round" />
            {[0, 1, 2].map((j) => <path key={j} d={`M${x + o * (34 + j * 8)},${18 - j * 6} l${o * (14 + j * 2)},${-6 - j * 4}`} stroke={INK} strokeWidth={5} strokeLinecap="round" />)}
          </g>
        ) : (
          <g key={x}>
            <ellipse cx={x} cy={10} rx={68} ry={74} fill="url(#o2Eye)" />
            <ellipse cx={x} cy={10} rx={68} ry={74} fill="url(#o2EyeLow)" />
            {/* 星點 */}
            {[[-24, 8, 2.8], [20, 22, 2.2], [-6, 40, 2], [30, -6, 1.7], [-34, 30, 1.5], [8, 56, 1.8], [38, 36, 1.5], [-18, 58, 1.4]].map(([sx, sy, r], i) => (
              <circle key={i} cx={x + sx * o} cy={sy} r={r} fill="#fff" opacity={0.9} />
            ))}
            <path d={`M${x + 24 * o},${-22} l4,13 l13,4 l-13,4 l-4,13 l-4,-13 l-13,-4 l13,-4 Z`} fill="#fff" />
            <ellipse cx={x - 22 * o} cy={-24} rx={22} ry={19} fill="#fff" />
            <circle cx={x + 20 * o} cy={46} r={8} fill="#fff" opacity={0.85} />
            <ellipse cx={x} cy={10} rx={68} ry={74} fill="none" stroke={INK} strokeWidth={6} />
            {/* 上眼線＋睫毛 */}
            <path d={`M${x - 70},-4 Q${x},-80 ${x + 70},-4`} stroke={INK} strokeWidth={10} fill="none" strokeLinecap="round" />
            {[0, 1, 2].map((j) => (
              <path key={j} d={`M${x + o * (50 + j * 10)},${-40 + j * 15} q${o * 16},-4 ${o * 24},${-16 + j * 3}`} stroke={INK} strokeWidth={6} fill="none" strokeLinecap="round" />
            ))}
          </g>
        );
      })}

      {/* 護目鏡：側扣帶 → 玻璃 → 白框 → 反光 */}
      {[-1, 1].map((o) => (
        <g key={o}>
          <rect x={o > 0 ? 220 : -260} y={-34} width={40} height={96} rx={14} fill="url(#o2Rim)" stroke={INK} strokeWidth={6} />
          <rect x={o > 0 ? 231 : -249} y={-16} width={18} height={60} rx={6} fill="#d9cdee" />
        </g>
      ))}
      <path id="o2Lens" d="M-214,-20 Q-218,-80 -150,-84 Q0,-96 150,-84 Q218,-80 214,-20 L210,52 Q206,104 150,106 L60,106 Q30,106 16,86 Q0,68 -16,86 Q-30,106 -60,106 L-150,106 Q-206,104 -210,52 Z"
        fill="url(#o2Glass)" />
      <path d="M-214,-20 Q-218,-80 -150,-84 Q0,-96 150,-84 Q218,-80 214,-20 L210,52 Q206,104 150,106 L60,106 Q30,106 16,86 Q0,68 -16,86 Q-30,106 -60,106 L-150,106 Q-206,104 -210,52 Z"
        fill="none" stroke={INK} strokeWidth={30} strokeLinejoin="round" />
      <path d="M-214,-20 Q-218,-80 -150,-84 Q0,-96 150,-84 Q218,-80 214,-20 L210,52 Q206,104 150,106 L60,106 Q30,106 16,86 Q0,68 -16,86 Q-30,106 -60,106 L-150,106 Q-206,104 -210,52 Z"
        fill="none" stroke="url(#o2Rim)" strokeWidth={19} strokeLinejoin="round" />
      <path d="M-170,-66 Q0,-78 170,-66" stroke="#fff" strokeWidth={4} fill="none" opacity={0.9} strokeLinecap="round" />
      {/* 玻璃斜反光 */}
      <path d="M-150,-70 L-108,-72 L-168,92 L-196,88 Z" fill="#fff" opacity={0.26} />
      <path d="M-90,-74 L-74,-74 L-134,94 L-148,94 Z" fill="#fff" opacity={0.2} />
      <path d="M154,-70 L176,-66 L136,50 L118,50 Z" fill="#fff" opacity={0.16} />

      {/* 腮紅＋嘴 */}
      <ellipse cx={-130} cy={140} rx={30} ry={13} fill="#ff86b6" opacity={0.45} />
      <ellipse cx={130} cy={140} rx={30} ry={13} fill="#ff86b6" opacity={0.45} />
      {phase === "in"
        ? <ellipse cx={0} cy={152} rx={10 + 6 * fill} ry={9 + 7 * fill} fill={INK} />
        : <path d="M-24,144 Q0,166 24,144" stroke={INK} strokeWidth={7} fill="none" strokeLinecap="round" />}
    </g>
  );
};

// 角色設定圖：睜眼（吸氣）＋閉眼（吐氣）並排
export const OctoSheet: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "linear-gradient(160deg,#f7e6f4 0%,#e3d3f7 55%,#cbb8f0 100%)" }}>
      <svg width={1600} height={900} viewBox="0 0 1600 900">
        {[[420, "ready", 0.6], [1180, "out", 0.2]].map(([x, ph, fl]) => (
          <g key={x as number} transform={`translate(${x},470) scale(1.0)`}>
            <ellipse cx={0} cy={380} rx={220} ry={26} fill="#6a3fd8" opacity={0.12} />
            <OctoV2 fill={fl as number} phase={ph as string} f={f} />
          </g>
        ))}
      </svg>
    </AbsoluteFill>
  );
};
