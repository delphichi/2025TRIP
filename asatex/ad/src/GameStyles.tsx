// 遊戲風格樣張（靜態 1080×1920）：我們自己的情侶（她一身黃、他藍 T 恤＋手機），全原創角色。
// Fight：街機格鬥版（血條、ROUND 1、POLOLA vs POLOLO），輸出後用 PIL 縮小→限色→最近鄰放大，做出像素感。
// Runmo：Q 彈圓滾平台遊戲版（草地方塊、木牌、尖刺、泡泡字標題、睡衣道具）。
import React from "react";
import { AbsoluteFill, staticFile } from "remotion";
import { loadFont } from "@remotion/fonts";

loadFont({ family: "PressStart", url: staticFile("fonts/PressStart2P.ttf") });
loadFont({ family: "Montserrat", url: staticFile("showroom/Montserrat.ttf"), weight: "100 900" });
const PIX = '"PressStart", monospace';
const SANS = "Montserrat, Helvetica Neue, Arial, sans-serif";
const K = "#1b1410";
const SKIN = "#f7c9a2";

// ════════ 格鬥版 ════════
const Fighter: React.FC<{ girl: boolean; x: number; y: number; flip?: boolean }> = ({ girl, x, y, flip }) => {
  const top = girl ? "#f2c230" : "#3a74d0", low = girl ? "#f2c230" : "#26407a";
  const o = { stroke: K, strokeWidth: 9, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  const limb = (d: string, c: string, w: number) => (<><path d={d} stroke={K} strokeWidth={w + 14} fill="none" strokeLinecap="round" /><path d={d} stroke={c} strokeWidth={w} fill="none" strokeLinecap="round" /></>);
  return (
    <g transform={`translate(${x},${y}) scale(${flip ? -1 : 1},1)`}>
      {/* 弓箭步 */}
      {limb("M-30,-190 L-110,-90 L-130,0", low, 40)}
      {limb("M30,-190 L80,-100 L120,0", low, 40)}
      <ellipse cx={-140} cy={4} rx={46} ry={22} fill={girl ? "#e0a92a" : "#e2463c"} {...o} />
      <ellipse cx={136} cy={4} rx={46} ry={22} fill={girl ? "#e0a92a" : "#e2463c"} {...o} />
      {/* 身體 */}
      {girl
        ? <path d="M-80,-400 Q0,-420 80,-400 L110,-170 Q0,-150 -110,-170 Z" fill={top} {...o} />
        : <><path d="M-82,-400 Q0,-416 82,-400 L84,-230 L-84,-230 Z" fill={top} {...o} /><path d="M-84,-236 L84,-236 L80,-180 L-80,-180 Z" fill={low} {...o} /></>}
      {girl && <path d="M-40,-404 L0,-330 L40,-404" fill="none" stroke="#a87808" strokeWidth={8} />}
      {/* 手：她雙拳舉起備戰；他一拳一手機 */}
      {limb("M-70,-380 Q-150,-330 -110,-270 L-30,-330", girl ? top : top, 30)}
      <circle cx={-26} cy={-334} r={30} fill={SKIN} {...o} />
      {limb("M70,-380 Q170,-340 150,-270 L80,-250", top, 30)}
      {girl
        ? <circle cx={150} cy={-420} r={30} fill={SKIN} {...o} />
        : <><circle cx={80} cy={-250} r={28} fill={SKIN} {...o} />
          <rect x={62} y={-330} width={44} height={72} rx={8} fill="#1c1c22" {...o} strokeWidth={6} /><rect x={70} y={-322} width={28} height={52} rx={4} fill="#7fc7ff" /></>}
      {girl && limb("M70,-380 Q130,-420 150,-420", top, 30)}
      {/* 頭 */}
      <g transform="translate(0,-540)">
        {girl && <path d="M-140,0 Q-150,-150 0,-156 Q150,-150 140,0 L150,110 Q100,120 90,60 L-90,60 Q-100,120 -150,110 Z" fill="#4a2a1d" {...o} />}
        <circle cx={0} cy={0} r={128} fill={SKIN} {...o} />
        {girl
          ? <path d="M-130,-20 Q-126,-140 0,-142 Q126,-140 130,-20 Q90,-70 30,-60 Q0,-96 -40,-62 Q-90,-90 -130,-20 Z" fill="#4a2a1d" {...o} />
          : <path d="M-126,-30 Q-120,-146 0,-146 Q120,-146 126,-30 Q70,-80 10,-72 Q-50,-96 -126,-30 Z" fill="#6b3f22" {...o} />}
        {/* 頭帶（格鬥感）*/}
        <path d="M-128,-40 Q0,-70 128,-40 L126,-14 Q0,-44 -126,-14 Z" fill={girl ? "#e23a5a" : "#e8e8e8"} {...o} strokeWidth={6} />
        <path d="M-120,-30 Q-190,-20 -230,20 M-120,-24 Q-180,10 -200,60" stroke={girl ? "#e23a5a" : "#e8e8e8"} strokeWidth={18} fill="none" strokeLinecap="round" />
        {/* 眼：她狠瞪，他心虛斜眼看手機 */}
        {girl ? <>
          <path d="M14,-12 L70,4 M110,-12 L54,4" stroke={K} strokeWidth={10} strokeLinecap="round" />
          <ellipse cx={40} cy={26} rx={13} ry={17} fill={K} /><ellipse cx={86} cy={26} rx={13} ry={17} fill={K} />
          <path d="M40,82 Q64,70 88,82" stroke="#c2414e" strokeWidth={8} fill="none" strokeLinecap="round" />
        </> : <>
          <ellipse cx={34} cy={20} rx={15} ry={19} fill="#fff" {...o} strokeWidth={5} /><ellipse cx={84} cy={20} rx={15} ry={19} fill="#fff" {...o} strokeWidth={5} />
          <circle cx={30} cy={30} r={8} fill={K} /><circle cx={80} cy={30} r={8} fill={K} />
          <path d="M40,84 Q60,76 82,86" stroke={K} strokeWidth={7} fill="none" strokeLinecap="round" />
          <path d="M-60,-20 q-6,16 0,26" stroke="#5fb4ff" strokeWidth={10} fill="none" strokeLinecap="round" />
        </>}
        <ellipse cx={-6} cy={60} rx={20} ry={11} fill="#f59a9a" opacity={0.55} />
      </g>
    </g>
  );
};

const Bar: React.FC<{ x: number; flip?: boolean; hp: number }> = ({ x, flip, hp }) => (
  <g transform={`translate(${x},150)`}>
    <rect x={0} y={0} width={440} height={46} fill="#c81e1e" stroke="#fff" strokeWidth={6} />
    <rect x={flip ? 440 - 440 * hp : 0} y={0} width={440 * hp} height={46} fill="#ffe14d" />
    <rect x={0} y={0} width={440} height={46} fill="none" stroke={K} strokeWidth={3} />
  </g>
);

// layer：scene＝背景＋角色（之後像素化）；hud＝只有介面（透明底，像素化後疊上去，字才清楚）
export const Fight: React.FC<{ layer?: "scene" | "hud" }> = ({ layer = "scene" }) => (
  <AbsoluteFill style={{ background: layer === "hud" ? "transparent" : "#7ec8f0" }}>
    <svg width={1080} height={1920} viewBox="0 0 1080 1920">
      {layer === "scene" && <>
      {/* 天空分色帶（像素遊戲的漸層）*/}
      {["#9fd9f7", "#8fd0f3", "#7ec8f0", "#6dbde9", "#f6d38a"].map((c, i) => <rect key={c} x={0} y={i * 150} width={1080} height={150} fill={c} />)}
      {/* 店面：Asatex 睡衣店 */}
      <rect x={60} y={380} width={960} height={900} fill="#c9a079" stroke={K} strokeWidth={8} />
      <rect x={60} y={380} width={960} height={130} fill="#2f8a4a" stroke={K} strokeWidth={8} />
      <text x={540} y={470} textAnchor="middle" fontFamily={PIX} fontSize={62} fill="#ffe14d" stroke={K} strokeWidth={4}>ASATEX</text>
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(${190 + i * 233},560)`}>
          <circle cx={0} cy={30} r={36} fill="#f3e3c6" stroke={K} strokeWidth={6} />
          <path d="M-62,80 L62,80 L56,330 L-56,330 Z" fill={["#f5a9c4", "#e3187f", "#94cdf2", "#bfc1c6"][i]} stroke={K} strokeWidth={6} />
          <path d="M-56,330 L-60,560 L-6,560 L0,380 L6,560 L60,560 L56,330 Z" fill={["#f5a9c4", "#e3187f", "#94cdf2", "#bfc1c6"][i]} stroke={K} strokeWidth={6} />
        </g>
      ))}
      {/* 紅燈籠 */}
      {[130, 950].map((lx) => <g key={lx}><line x1={lx} y1={510} x2={lx} y2={560} stroke={K} strokeWidth={4} /><ellipse cx={lx} cy={610} rx={44} ry={56} fill="#e23a3a" stroke={K} strokeWidth={6} /></g>)}
      {/* 地面 */}
      <rect x={0} y={1280} width={1080} height={640} fill="#e8c890" />
      {Array.from({ length: 30 }, (_, i) => <rect key={i} x={(i * 137) % 1080} y={1300 + ((i * 89) % 600)} width={60} height={14} fill="#d4b278" />)}
      {/* 角色 */}
      <Fighter girl x={320} y={1700} />
      <Fighter girl={false} x={780} y={1700} flip />
      </>}
      {layer === "hud" && <>
      <text x={40} y={110} fontFamily={PIX} fontSize={34} fill="#fff" stroke={K} strokeWidth={6} paintOrder="stroke">1P 58100</text>
      <text x={1040} y={110} textAnchor="end" fontFamily={PIX} fontSize={30} fill="#ffe14d" stroke={K} strokeWidth={6} paintOrder="stroke">PUSH START</text>
      <Bar x={40} hp={1} />
      <Bar x={600} flip hp={1} />
      <rect x={496} y={140} width={88} height={70} fill={K} />
      <text x={540} y={198} textAnchor="middle" fontFamily={PIX} fontSize={44} fill="#fff">99</text>
      <text x={44} y={256} fontFamily={PIX} fontSize={40} fill="#fff" stroke={K} strokeWidth={7} paintOrder="stroke">POLOLA</text>
      <text x={1036} y={256} textAnchor="end" fontFamily={PIX} fontSize={40} fill="#fff" stroke={K} strokeWidth={7} paintOrder="stroke">POLOLO</text>
      <text x={540} y={880} textAnchor="middle" fontFamily={PIX} fontSize={84} fill="#ff3b30" stroke="#fff" strokeWidth={6} paintOrder="stroke">ROUND 1</text>
      <text x={540} y={1000} textAnchor="middle" fontFamily={PIX} fontSize={110} fill="#ffe14d" stroke={K} strokeWidth={8} paintOrder="stroke">FIGHT!</text>
      </>}
    </svg>
  </AbsoluteFill>
);

// ════════ Runmo 版 ════════
const Blob: React.FC<{ girl: boolean; x: number; y: number; jump?: boolean }> = ({ girl, x, y, jump }) => {
  const c = girl ? "#ffd23f" : "#4f8df0", d = girl ? "#e8a91a" : "#2f62c0";
  const o = { stroke: K, strokeWidth: 10, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  const lim = (p: string) => (<><path d={p} stroke={K} strokeWidth={62} fill="none" strokeLinecap="round" /><path d={p} stroke={c} strokeWidth={44} fill="none" strokeLinecap="round" /></>);
  return (
    <g transform={`translate(${x},${y})`}>
      {jump ? <>{lim("M-30,-60 Q-90,-10 -150,-40")}{lim("M30,-60 Q70,20 40,80")}</> : <>{lim("M-30,-60 Q-80,0 -100,60")}{lim("M30,-60 Q110,-20 150,-60")}</>}
      {/* 豆子身體＋頭一體成形 */}
      <path d="M-120,-150 Q-140,-420 0,-440 Q140,-420 120,-150 Q110,-40 0,-40 Q-110,-40 -120,-150 Z" fill={c} {...o} />
      <path d="M70,-380 Q110,-300 96,-180" stroke="#fff" strokeWidth={16} fill="none" strokeLinecap="round" opacity={0.55} />
      <path d="M-110,-150 Q-100,-60 0,-56 Q60,-56 90,-90" stroke={d} strokeWidth={14} fill="none" opacity={0.6} />
      {/* 手 */}
      {jump ? <>{lim("M-90,-230 Q-170,-300 -150,-380")}{lim("M90,-230 Q170,-250 210,-300")}</> : <>{lim("M-90,-230 Q-160,-200 -190,-140")}{lim("M90,-230 Q150,-270 170,-330")}</>}
      {girl && <path d="M-118,-300 Q-120,-446 0,-450 Q120,-446 118,-300 Q70,-350 20,-340 Q-30,-370 -118,-300 Z" fill="#5a3322" {...o} />}
      {!girl && <><rect x={150} y={-400} width={44} height={70} rx={8} fill="#1c1c22" {...o} strokeWidth={6} /><rect x={158} y={-392} width={28} height={50} rx={4} fill="#9ad8ff" /></>}
      {/* 眼：Runmo 式大圓眼、紅虹膜 */}
      {[-1, 1].map((sd) => (
        <g key={sd}>
          <circle cx={sd * 44 + 10} cy={-280} r={36} fill="#fff" {...o} strokeWidth={7} />
          <circle cx={sd * 44 + 18} cy={-276} r={18} fill={girl ? "#d6455a" : "#2b4fae"} />
          <circle cx={sd * 44 + 18} cy={-276} r={8} fill={K} />
          <circle cx={sd * 44 + 12} cy={-286} r={6} fill="#fff" />
          {girl && <path d={`M${sd * 44 + 10 + sd * 28},-306 l${sd * 14},-12`} stroke={K} strokeWidth={6} strokeLinecap="round" />}
        </g>
      ))}
      {jump ? <path d="M-10,-210 Q20,-170 50,-210 Z" fill="#7a1f2a" {...o} strokeWidth={7} /> : <path d="M-6,-212 Q20,-196 46,-212" stroke={K} strokeWidth={7} fill="none" strokeLinecap="round" />}
    </g>
  );
};

const Plat: React.FC<{ x: number; y: number; w: number }> = ({ x, y, w }) => (
  <g>
    <rect x={x} y={y + 30} width={w} height={1920 - y} fill="#f3e08a" stroke={K} strokeWidth={8} />
    {Array.from({ length: Math.floor(w / 90) }, (_, i) => <line key={i} x1={x + 45 + i * 90} y1={y + 70} x2={x + 45 + i * 90} y2={1920} stroke="#d9c26a" strokeWidth={6} />)}
    <path d={`M${x - 16},${y + 50} Q${x - 20},${y} ${x + 30},${y} L${x + w - 30},${y} Q${x + w + 20},${y} ${x + w + 16},${y + 50} Q${x + w / 2},${y + 76} ${x - 16},${y + 50} Z`} fill="#6cc94a" stroke={K} strokeWidth={8} />
    {Array.from({ length: Math.floor(w / 70) }, (_, i) => <path key={i} d={`M${x + 20 + i * 70},${y + 54} q12,18 24,0`} stroke="#4aa632" strokeWidth={6} fill="none" />)}
  </g>
);

export const Runmo: React.FC = () => (
  <AbsoluteFill style={{ background: "#bfe8ff" }}>
    <svg width={1080} height={1920} viewBox="0 0 1080 1920">
      <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a8e0ff" /><stop offset="1" stopColor="#e8f8ff" /></linearGradient></defs>
      <rect width={1080} height={1920} fill="url(#sky)" />
      {/* 遠山 */}
      <path d="M-50,1200 Q200,820 450,1100 Q650,860 900,1080 Q1050,950 1150,1050 L1150,1500 L-50,1500 Z" fill="#9fdc8a" stroke={K} strokeWidth={6} />
      <path d="M-50,1320 Q300,1100 600,1300 Q850,1150 1150,1300 L1150,1600 L-50,1600 Z" fill="#7fcf6a" stroke={K} strokeWidth={6} />
      {/* 標題：泡泡字 */}
      <g transform="translate(540,250)">
        <text x={0} y={-40} textAnchor="middle" fontFamily={SANS} fontWeight={900} fontSize={70} fill="#ff5a8a" stroke={K} strokeWidth={10} paintOrder="stroke">ASATEX</text>
        <text x={0} y={110} textAnchor="middle" fontFamily={SANS} fontWeight={900} fontSize={170} fill="#c8f05a" stroke="#2f6a1e" strokeWidth={26} paintOrder="stroke" letterSpacing={-4}>PIJAMA</text>
        <text x={0} y={110} textAnchor="middle" fontFamily={SANS} fontWeight={900} fontSize={170} fill="none" stroke="#fff" strokeWidth={4} opacity={0.6} letterSpacing={-4}>PIJAMA</text>
        <text x={0} y={250} textAnchor="middle" fontFamily={SANS} fontWeight={900} fontSize={130} fill="#c8f05a" stroke="#2f6a1e" strokeWidth={22} paintOrder="stroke">RUN!</text>
      </g>
      {/* 尖刺鋸片（陷阱）*/}
      <g transform="translate(70,980)">
        <rect x={-40} y={-600} width={70} height={720} fill="#b8bcc4" stroke={K} strokeWidth={8} />
        {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M30,${-580 + i * 78} l60,24 l-60,24 Z`} fill="#e8eaee" stroke={K} strokeWidth={6} />)}
        <circle cx={0} cy={150} r={70} fill="#9aa0a8" stroke={K} strokeWidth={8} />
        <circle cx={0} cy={150} r={24} fill="#555" />
      </g>
      {/* 平台 */}
      <Plat x={120} y={1460} w={480} />
      <Plat x={720} y={1300} w={380} />
      {/* 木牌 */}
      <g transform="translate(520,1460)">
        <rect x={-10} y={-150} width={20} height={150} fill="#a5683a" stroke={K} strokeWidth={6} />
        <path d="M-90,-260 L90,-260 L110,-210 L90,-160 L-90,-160 Z" fill="#d79a5c" stroke={K} strokeWidth={7} />
        <text x={0} y={-198} textAnchor="middle" fontFamily={SANS} fontWeight={900} fontSize={30} fill="#7a3f12">ASATEX →</text>
      </g>
      {/* 睡衣道具 */}
      <g transform="translate(820,900)">
        <circle r={110} fill="#fff7a8" opacity={0.7} />
        <path d="M-40,-80 L-90,-52 L-116,6 L-76,26 L-66,0 L-66,86 L66,86 L66,0 L76,26 L116,6 L90,-52 L40,-80 Q0,-52 -40,-80 Z" fill="#f59cc0" stroke={K} strokeWidth={8} strokeLinejoin="round" />
        {[[-30, -10], [30, 20], [-24, 52]].map(([px, py], i) => <circle key={i} cx={px} cy={py} r={9} fill="#fff" />)}
        {[[-140, -60], [130, -90], [150, 60]].map(([sx, sy], i) => <path key={i} d={`M${sx},${sy - 22} l6,16 l16,6 l-16,6 l-6,16 l-6,-16 l-16,-6 l16,-6 Z`} fill="#fff" stroke={K} strokeWidth={4} />)}
      </g>
      {/* 角色：她跳向睡衣、他在後面邊跑邊看手機 */}
      <Blob girl x={560} y={1260} jump />
      <Blob girl={false} x={300} y={1460} />
      {/* 敵人：小刺球 */}
      <g transform="translate(930,1300)">
        <ellipse cx={0} cy={-60} rx={80} ry={62} fill="#ff6b6b" stroke={K} strokeWidth={8} />
        {[-50, -10, 30].map((sx) => <path key={sx} d={`M${sx},-118 l12,-30 l12,30`} fill="#fff" stroke={K} strokeWidth={5} />)}
        <circle cx={-26} cy={-64} r={16} fill="#fff" stroke={K} strokeWidth={5} /><circle cx={-22} cy={-62} r={7} fill={K} />
        <path d="M-60,-30 L50,-30 L40,-10 L-50,-10 Z" fill="#fff" stroke={K} strokeWidth={5} />
      </g>
      <text x={540} y={1880} textAnchor="middle" fontFamily={SANS} fontWeight={800} fontSize={28} fill="#5a6a52">樣張：Q 彈平台遊戲風（原創角色）</text>
    </svg>
  </AbsoluteFill>
);
