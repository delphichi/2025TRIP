// 原創 IP 角色（向量重畫，參考 DelphiChi 用 Gemini 生的設定表）：
// 糰糰醫生——粉白飯糰、圓眼鏡、聽診器、前面一片海苔、短手短腳；薯寶——黃馬鈴薯、頭上兩片芽、雀斑、裹淺藍小被子。
// 表情＝零件組合（眼睛 eye、嘴 mouth、眉 brow、特效 fx），之後動畫直接用 <Dango expr .../> <Potato expr .../>。
import React from "react";
import { AbsoluteFill } from "remotion";

export const LINE = "#4a2b23";
const o = { stroke: LINE, strokeWidth: 7, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

export type Eye = "dot" | "happy" | "sad" | "star" | "shock" | "dizzy" | "closed" | "angry" | "tears" | "line";
export type Mouth = "smile" | "frown" | "o" | "open" | "laugh" | "wavy" | "flat";
export type Fx = "sweat" | "anger" | "sparkle" | "spin" | "flush" | "zzz" | "shock";
export type Expr = { eye: Eye; mouth: Mouth; fx?: Fx[]; open?: number }; // open：對嘴 0–1，會蓋過 mouth

// ── 共用：眼睛、嘴、特效（臉的中心在 (0,0)，兩眼距 ±dx）──
export const EyeG: React.FC<{ x: number; t: Eye; r?: number }> = ({ x, t, r = 15 }) => {
  switch (t) {
    case "happy": return <path d={`M${x - 14},4 Q${x},-14 ${x + 14},4`} fill="none" {...o} strokeWidth={6} />;
    case "closed": return <path d={`M${x - 14},0 Q${x},8 ${x + 14},0`} fill="none" {...o} strokeWidth={6} />;
    case "line": return <path d={`M${x - 13},0 L${x + 13},0`} {...o} strokeWidth={6} />;
    case "dizzy": return <path d={`M${x},0 m-4,0 a4,4 0 1,1 8,0 a8,8 0 1,1 -16,0 a12,12 0 1,1 24,0 a16,16 0 1,1 -32,0`} fill="none" {...o} strokeWidth={4} />;
    case "shock": return <g><circle cx={x} cy={0} r={r + 5} fill="#fff" {...o} strokeWidth={5} /><circle cx={x} cy={0} r={4} fill={LINE} /></g>;
    case "star": return <g><circle cx={x} cy={0} r={r} fill="#2a1a14" /><path d={`M${x},-11 l3.5,7 l7.5,1 l-5.5,5 l1.5,7.5 l-7,-3.5 l-7,3.5 l1.5,-7.5 l-5.5,-5 l7.5,-1 Z`} fill="#ffd23f" /></g>;
    case "angry": return <g><ellipse cx={x} cy={3} rx={r - 3} ry={r - 5} fill="#2a1a14" /><circle cx={x - 4} cy={-1} r={3.5} fill="#fff" /></g>;
    case "sad": case "tears": return (
      <g>
        <ellipse cx={x} cy={2} rx={r - 1} ry={r + 1} fill="#2a1a14" />
        <circle cx={x - 5} cy={-5} r={5.5} fill="#fff" /><circle cx={x + 5} cy={6} r={2.5} fill="#fff" />
        {t === "tears" && <path d={`M${x - 10},${r - 2} Q${x - 18},${r + 26} ${x - 6},${r + 30} Q${x + 2},${r + 22} ${x - 4},${r - 2} Z`} fill="#8fd3ff" stroke="#5aa9d6" strokeWidth={3} />}
      </g>
    );
    default: return <g><ellipse cx={x} cy={0} rx={r} ry={r + 3} fill="#2a1a14" /><circle cx={x - 5} cy={-7} r={6} fill="#fff" /><circle cx={x + 6} cy={6} r={2.8} fill="#fff" /></g>;
  }
};
export const MouthG: React.FC<{ t: Mouth; open?: number; y: number }> = ({ t, open, y }) => {
  if (open !== undefined && open > 0.08) return <ellipse cx={0} cy={y + 2} rx={9 + 7 * open} ry={4 + 13 * open} fill="#c2454f" {...o} strokeWidth={5} />;
  switch (t) {
    case "frown": return <path d={`M-12,${y + 5} Q0,${y - 5} 12,${y + 5}`} fill="none" {...o} strokeWidth={5} />;
    case "o": return <ellipse cx={0} cy={y + 2} rx={8} ry={10} fill="#c2454f" {...o} strokeWidth={5} />;
    case "open": return <path d={`M-14,${y - 4} Q0,${y - 7} 14,${y - 4} Q12,${y + 16} 0,${y + 17} Q-12,${y + 16} -14,${y - 4} Z`} fill="#c2454f" {...o} strokeWidth={5} />;
    case "laugh": return <g><path d={`M-20,${y - 6} Q0,${y - 9} 20,${y - 6} Q17,${y + 22} 0,${y + 23} Q-17,${y + 22} -20,${y - 6} Z`} fill="#c2454f" {...o} strokeWidth={5} /><ellipse cx={0} cy={y + 13} rx={9} ry={5} fill="#f28a96" /></g>;
    case "wavy": return <path d={`M-16,${y} q4,-6 8,0 q4,6 8,0 q4,-6 8,0 q4,6 8,0`} fill="none" {...o} strokeWidth={4.5} />;
    case "flat": return <path d={`M-10,${y} L10,${y}`} {...o} strokeWidth={5} />;
    default: return <path d={`M-12,${y - 2} Q0,${y + 10} 12,${y - 2}`} fill="none" {...o} strokeWidth={5} />;
  }
};
export const FxG: React.FC<{ fx: Fx[]; top: number; side: number }> = ({ fx, top, side }) => (
  <>
    {fx.includes("sweat") && <path d={`M${side},${top + 30} Q${side - 14},${top + 58} ${side},${top + 64} Q${side + 14},${top + 58} ${side},${top + 30} Z`} fill="#8fd3ff" stroke="#4f9fd1" strokeWidth={3} />}
    {fx.includes("anger") && <path d={`M${side - 6},${top + 6} l10,10 M${side + 12},${top + 2} l-6,14 M${side - 8},${top + 24} l14,-4 M${side + 16},${top + 22} l-12,-6`} stroke="#e23a3a" strokeWidth={6} strokeLinecap="round" />}
    {fx.includes("sparkle") && [[-side, top + 20, 14], [side, top + 10, 18], [side + 18, top + 40, 10]].map(([x, y, s], i) => (
      <path key={i} d={`M${x},${y - s} Q${x + s * 0.15},${y - s * 0.15} ${x + s},${y} Q${x + s * 0.15},${y + s * 0.15} ${x},${y + s} Q${x - s * 0.15},${y + s * 0.15} ${x - s},${y} Q${x - s * 0.15},${y - s * 0.15} ${x},${y - s} Z`} fill="#ffcf3a" />
    ))}
    {fx.includes("spin") && <g fill="none" stroke={LINE} strokeWidth={4}><ellipse cx={0} cy={top - 10} rx={42} ry={10} /><ellipse cx={0} cy={top - 18} rx={30} ry={7} /></g>}
    {fx.includes("zzz") && <text x={side} y={top + 20} fontFamily="Montserrat, Arial" fontWeight={900} fontSize={36} fill="#3a6fd8">Zz</text>}
    {fx.includes("shock") && [0, 1, 2].map((k) => <line key={k} x1={side - 4 + k * 12} y1={top + 12 - k * 4} x2={side + 4 + k * 16} y2={top - 10 - k * 6} stroke="#f2a20c" strokeWidth={6} strokeLinecap="round" />)}
  </>
);

// 飯糰外形（三段三次貝茲）取樣後加上小波浪 → 一顆顆米粒的凹凸邊
const RICE = (() => {
  type P = [number, number];
  const segs: [P, P, P, P][] = [
    [[0, -300], [60, -300], [140, -130], [130, -70]],
    [[130, -70], [124, -28], [80, -16], [0, -16]],
    [[0, -16], [-80, -16], [-124, -28], [-130, -70]],
    [[-130, -70], [-140, -130], [-60, -300], [0, -300]],
  ];
  const bz = (q: [P, P, P, P], t: number): P => {
    const u = 1 - t;
    return [0, 1].map((k) => u * u * u * q[0][k] + 3 * u * u * t * q[1][k] + 3 * u * t * t * q[2][k] + t * t * t * q[3][k]) as P;
  };
  const pts: P[] = [];
  segs.forEach((q, si) => { for (let i = 0; i < 40; i++) pts.push(bz(q, i / 40)); void si; });
  const n = pts.length, cx = 0, cy = -150;
  const out = pts.map(([x, y], i) => {
    const bottom = y > -40; // 底部平順一點
    const a = Math.atan2(y - cy, x - cx), amp = bottom ? 1.5 : 4.5;
    const b = Math.abs(Math.sin((i / n) * Math.PI * 46)) * amp;
    return [x + Math.cos(a) * b, y + Math.sin(a) * b] as P;
  });
  return "M" + out.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L") + " Z";
})();

// ── 糰糰醫生（腳底在 (0,0)，高約 300）──
export const Dango: React.FC<{ e: Expr; x?: number; y?: number; s?: number; tilt?: number }> = ({ e, x = 0, y = 0, s = 1, tilt = 0 }) => {
  const flush = e.fx?.includes("flush") || e.eye === "angry";
  return (
    <g transform={`translate(${x},${y}) scale(${s}) rotate(${tilt},0,-120)`}>
      <defs>
        <radialGradient id="rice" cx="0.4" cy="0.3" r="0.8"><stop offset="0" stopColor="#fffdfb" /><stop offset="0.75" stopColor="#fbefe9" /><stop offset="1" stopColor="#efd9cf" /></radialGradient>
        <radialGradient id="flushG" cx="0.5" cy="0.35" r="0.55"><stop offset="0" stopColor="#ff6a6a" stopOpacity="0.55" /><stop offset="1" stopColor="#ff6a6a" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx={0} cy={4} rx={100} ry={12} fill="#000" opacity={0.08} />
      {/* 腳（深色）、手 */}
      <ellipse cx={-38} cy={-10} rx={26} ry={16} fill="#3b3536" {...o} />
      <ellipse cx={38} cy={-10} rx={26} ry={16} fill="#3b3536" {...o} />
      <ellipse cx={-128} cy={-74} rx={20} ry={26} fill="#fbefe9" {...o} transform="rotate(24,-128,-74)" />
      <ellipse cx={128} cy={-74} rx={20} ry={26} fill="#fbefe9" {...o} transform="rotate(-24,128,-74)" />
      {/* 飯糰身體：一顆顆米粒的凹凸輪廓 */}
      <path d={RICE} fill="url(#rice)" {...o} strokeWidth={6} />
      {flush && <path d={RICE} fill="url(#flushG)" />}
      {[[-40, -250], [52, -228], [-78, -170], [86, -150], [-20, -214], [30, -270]].map(([gx, gy], i) => <path key={i} d={`M${gx},${gy} q6,-4 10,1`} stroke="#e8d3c8" strokeWidth={3} fill="none" />)}
      {/* 海苔（醫生袍敞開處看得到）*/}
      <rect x={-58} y={-122} width={116} height={110} rx={10} fill="#2f4836" {...o} />
      {Array.from({ length: 14 }, (_, i) => <circle key={i} cx={-46 + (i % 5) * 23} cy={-108 + Math.floor(i / 5) * 32} r={3} fill="#3e5c47" />)}
      {/* 白色醫生袍：左右兩片從肩膀披下、前面敞開，短袖 */}
      {[-1, 1].map((sd) => (
        <g key={sd}>
          <path d={`M${sd * 58},-128 Q${sd * 100},-138 ${sd * 128},-120 Q${sd * 140},-70 ${sd * 128},-22 Q${sd * 100},-10 ${sd * 58},-12 Z`} fill="#ffffff" {...o} strokeWidth={6} />
          <path d={`M${sd * 58},-128 L${sd * 76},-96 L${sd * 58},-82`} fill="#f1f3f6" stroke={LINE} strokeWidth={4} strokeLinejoin="round" />
          <path d={`M${sd * 118},-126 Q${sd * 150},-112 ${sd * 148},-86 Q${sd * 130},-80 ${sd * 120},-92 Z`} fill="#ffffff" {...o} strokeWidth={5} />
          <path d={`M${sd * 92},-40 L${sd * 116},-40`} stroke="#c9ced6" strokeWidth={4} strokeLinecap="round" />
        </g>
      ))}
      {/* 深藍聽診器：繞過脖子，兩端垂在胸前，銀色聽頭 */}
      <path d="M-84,-130 Q0,-112 84,-130" stroke="#2c3f6b" strokeWidth={7} fill="none" strokeLinecap="round" />
      {[-1, 1].map((sd) => (
        <g key={sd}>
          <path d={`M${sd * 84},-130 Q${sd * 92},-100 ${sd * 78},-78`} stroke="#2c3f6b" strokeWidth={7} fill="none" strokeLinecap="round" />
          <circle cx={sd * 76} cy={-66} r={15} fill="#d7dbe1" stroke="#5b6270" strokeWidth={4} />
          <circle cx={sd * 76} cy={-66} r={7} fill="#f4f6f8" stroke="#8a919c" strokeWidth={2} />
        </g>
      ))}
      {/* 臉（在醫生袍上方）*/}
      <g transform="translate(0,-196)">
        <ellipse cx={-66} cy={34} rx={20} ry={11} fill="#ff9aa2" opacity={0.6} />
        <ellipse cx={66} cy={34} rx={20} ry={11} fill="#ff9aa2" opacity={0.6} />
        <EyeG x={-36} t={e.eye} r={13} /><EyeG x={36} t={e.eye} r={13} />
        {/* 圓眼鏡 */}
        {[-36, 36].map((gx) => <circle key={gx} cx={gx} cy={0} r={26} fill="none" stroke={LINE} strokeWidth={5} />)}
        <path d="M-10,-2 Q0,-8 10,-2" stroke={LINE} strokeWidth={5} fill="none" />
        {e.eye === "angry" && <path d="M-58,-34 L-20,-22 M58,-34 L20,-22" {...o} strokeWidth={7} />}
        {(e.eye === "sad" || e.eye === "tears" || e.fx?.includes("sweat")) && <path d="M-56,-30 L-22,-38 M56,-30 L22,-38" {...o} strokeWidth={5} />}
        <MouthG t={e.mouth} open={e.open} y={40} />
        <FxG fx={e.fx ?? []} top={-130} side={88} />
      </g>
    </g>
  );
};

// ── 薯寶（坐著／站著，腳底在 (0,0)，高約 290；lying＝躺著）──
export const Potato: React.FC<{ e: Expr; x?: number; y?: number; s?: number; tilt?: number; lying?: boolean }> = ({ e, x = 0, y = 0, s = 1, tilt = 0, lying }) => {
  const flush = e.fx?.includes("flush") || e.eye === "angry";
  return (
    <g transform={`translate(${x},${y}) scale(${s}) rotate(${(lying ? -78 : 0) + tilt},0,-130)`}>
      <defs>
        <radialGradient id="pot" cx="0.38" cy="0.3" r="0.8"><stop offset="0" stopColor="#ffe48a" /><stop offset="0.7" stopColor="#f6c84a" /><stop offset="1" stopColor="#e3a92e" /></radialGradient>
        <linearGradient id="blk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d6efff" /><stop offset="1" stopColor="#a9d6f3" /></linearGradient>
        <radialGradient id="flushP" cx="0.5" cy="0.4" r="0.55"><stop offset="0" stopColor="#ff5a4a" stopOpacity="0.55" /><stop offset="1" stopColor="#ff5a4a" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx={0} cy={4} rx={110} ry={12} fill="#000" opacity={0.08} />
      <ellipse cx={-40} cy={-8} rx={22} ry={14} fill="#f6c84a" {...o} />
      <ellipse cx={40} cy={-8} rx={22} ry={14} fill="#f6c84a" {...o} />
      {/* 馬鈴薯頭身 */}
      <path d="M0,-290 C78,-290 126,-220 124,-140 C122,-70 80,-30 0,-30 C-80,-30 -122,-70 -124,-140 C-126,-220 -78,-290 0,-290 Z" fill="url(#pot)" {...o} />
      {flush && <path d="M0,-290 C78,-290 126,-220 124,-140 C122,-70 80,-30 0,-30 C-80,-30 -122,-70 -124,-140 C-126,-220 -78,-290 0,-290 Z" fill="url(#flushP)" />}
      {[[-62, -228], [-46, -246], [70, -236], [84, -214], [-80, -196]].map(([fx, fy], i) => <circle key={i} cx={fx} cy={fy} r={4} fill="#c98f2c" opacity={0.8} />)}
      {/* 芽 */}
      <path d="M0,-290 Q-2,-312 2,-322" stroke="#5e9e36" strokeWidth={7} fill="none" strokeLinecap="round" />
      <path d="M2,-318 C-30,-350 -64,-330 -52,-310 C-40,-296 -12,-300 2,-318 Z" fill="#8ccf5a" {...o} strokeWidth={6} />
      <path d="M2,-318 C30,-352 68,-336 56,-312 C44,-296 14,-300 2,-318 Z" fill="#8ccf5a" {...o} strokeWidth={6} />
      {/* 被子 */}
      <path d="M-126,-120 C-90,-150 90,-150 126,-118 C134,-70 110,-6 0,-4 C-110,-6 -134,-70 -126,-120 Z" fill="url(#blk)" {...o} />
      <path d="M-120,-112 C-40,-90 40,-140 118,-84" stroke="#86bfe6" strokeWidth={6} fill="none" strokeLinecap="round" />
      <path d="M-110,-60 C-50,-40 30,-70 100,-34" stroke="#86bfe6" strokeWidth={5} fill="none" strokeLinecap="round" />
      {/* 兩隻小手從被子邊緣探出來抓著被子 */}
      <path d="M-58,-128 q-4,-20 14,-22 q18,0 16,20 Z" fill="#f6c84a" {...o} strokeWidth={6} />
      <path d="M30,-132 q-2,-20 16,-21 q18,2 14,22 Z" fill="#f6c84a" {...o} strokeWidth={6} />
      {/* 臉 */}
      <g transform="translate(0,-198)">
        <ellipse cx={-64} cy={30} rx={20} ry={12} fill="#ff8f86" opacity={0.65} />
        <ellipse cx={64} cy={30} rx={20} ry={12} fill="#ff8f86" opacity={0.65} />
        <EyeG x={-38} t={e.eye} r={15} /><EyeG x={38} t={e.eye} r={15} />
        {e.eye === "angry" && <path d="M-60,-30 L-22,-16 M60,-30 L22,-16" {...o} strokeWidth={7} />}
        {(e.eye === "sad" || e.eye === "tears" || e.fx?.includes("sweat")) && <path d="M-58,-24 L-24,-34 M58,-24 L24,-34" {...o} strokeWidth={5} />}
        <MouthG t={e.mouth} open={e.open} y={36} />
        <FxG fx={e.fx ?? []} top={-120} side={92} />
      </g>
    </g>
  );
};

// ── 設定表 ──
const EXPRS: { n: string; e: Expr }[] = [
  { n: "開心", e: { eye: "dot", mouth: "smile" } },
  { n: "擔心", e: { eye: "sad", mouth: "frown", fx: ["sweat"] } },
  { n: "哭哭", e: { eye: "tears", mouth: "open" } },
  { n: "期待", e: { eye: "star", mouth: "open", fx: ["sparkle"] } },
  { n: "驚嚇", e: { eye: "shock", mouth: "o", fx: ["shock"] } },
  { n: "昏倒", e: { eye: "dizzy", mouth: "wavy", fx: ["spin"] } },
  { n: "大笑", e: { eye: "happy", mouth: "laugh" } },
  { n: "睏", e: { eye: "closed", mouth: "o", fx: ["zzz"] } },
  { n: "生氣", e: { eye: "angry", mouth: "frown", fx: ["anger"] } },
  { n: "一本正經", e: { eye: "line", mouth: "flat" } },
];
export const MascotSheet: React.FC = () => (
  <AbsoluteFill style={{ background: "#fffaf6" }}>
    <svg width={1080} height={1920} viewBox="0 0 1080 1920">
      <text x={540} y={80} textAnchor="middle" fontFamily='"PingFang TC", sans-serif' fontWeight={900} fontSize={52} fill={LINE}>糰糰醫生 × 薯寶（向量重畫）</text>
      <Dango e={{ eye: "dot", mouth: "smile" }} x={290} y={460} s={1.05} />
      <Potato e={{ eye: "dot", mouth: "smile" }} x={790} y={460} s={1.05} />
      {EXPRS.map((x, i) => {
        const col = i % 5, row = Math.floor(i / 5);
        return (
          <g key={x.n}>
            <Dango e={x.e} x={118 + col * 211} y={790 + row * 300} s={0.6} />
            <Potato e={x.e} x={118 + col * 211} y={1410 + row * 300} s={0.6} />
            <text x={118 + col * 211} y={830 + row * 300} textAnchor="middle" fontFamily='"PingFang TC", sans-serif' fontWeight={700} fontSize={26} fill="#8a6a5e">{x.n}</text>
            <text x={118 + col * 211} y={1450 + row * 300} textAnchor="middle" fontFamily='"PingFang TC", sans-serif' fontWeight={700} fontSize={26} fill="#8a6a5e">{x.n}</text>
          </g>
        );
      })}
    </svg>
  </AbsoluteFill>
);
