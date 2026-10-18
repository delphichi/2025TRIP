// 健身 Shorts 樣張（2D，靜態 1080×1920）：深灰軀幹肌肉圖、目標肌群紅色標示（上腹／下腹／側腹／整片／深層核心）＋側面捲腹動作示意。
// 參考常見「3 分鐘腹肌」縮圖格式，圖形全部自己畫。
import React from "react";
import { AbsoluteFill, staticFile } from "remotion";
import { loadFont } from "@remotion/fonts";

loadFont({ family: "Montserrat", url: staticFile("showroom/Montserrat.ttf"), weight: "100 900" });
const SANS = "Montserrat, Helvetica Neue, Arial, sans-serif";
const BASE = "#3b3f46", SEG = "#4d525b", LINE = "#c9ccd2", RED = "#e3262d", ORANGE = "#ef7a1d";
type Hi = "upper" | "lower" | "oblique" | "full" | "deep";

// 一個軀幹（寬 ~200、高 ~260，原點在頸部下方中央）
const Torso: React.FC<{ x: number; y: number; hi: Hi; s?: number }> = ({ x, y, hi, s = 1 }) => {
  const row = (i: number) => (hi === "full" || (hi === "upper" && i < 2) || (hi === "lower" && i >= 2) ? RED : SEG);
  const side = hi === "oblique" ? RED : SEG;
  const deep = hi === "deep";
  const rows = [[98, 128], [132, 162], [166, 198], [202, 246]];
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <defs>
        <clipPath id={`cl${hi}`}><path d="M-104,6 Q-60,-6 0,-4 Q60,-6 104,6 Q112,60 92,110 Q74,170 70,250 Q0,262 -70,250 Q-74,170 -92,110 Q-112,60 -104,6 Z" /></clipPath>
        <linearGradient id={`sh${hi}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#000" stopOpacity="0.35" /><stop offset="0.5" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.35" /></linearGradient>
      </defs>
      {/* 軀幹外形 */}
      <path d="M-104,6 Q-60,-6 0,-4 Q60,-6 104,6 Q112,60 92,110 Q74,170 70,250 Q0,262 -70,250 Q-74,170 -92,110 Q-112,60 -104,6 Z" fill={BASE} stroke="#1a1c20" strokeWidth={4} />
      {/* 胸肌 */}
      <path d="M-4,10 Q-60,6 -96,24 Q-92,74 -56,88 Q-20,92 -4,80 Z" fill={SEG} stroke={LINE} strokeWidth={2} />
      <path d="M4,10 Q60,6 96,24 Q92,74 56,88 Q20,92 4,80 Z" fill={SEG} stroke={LINE} strokeWidth={2} />
      {/* 側腹（腹斜肌＋前鋸肌）*/}
      {[-1, 1].map((sd) => (
        <g key={sd}>
          <path d={`M${sd * 46},96 L${sd * 86},104 Q${sd * 74},170 ${sd * 66},242 L${sd * 48},236 Z`} fill={deep ? ORANGE : side} stroke={LINE} strokeWidth={2} />
          {[0, 1, 2].map((k) => <path key={k} d={`M${sd * 50},${112 + k * 30} L${sd * 80},${104 + k * 30}`} stroke={LINE} strokeWidth={1.6} opacity={0.7} />)}
        </g>
      ))}
      {/* 腹直肌：左右各 4 塊 */}
      {rows.map(([a, b], i) =>
        [-1, 1].map((sd) => (
          <rect key={`${i}${sd}`} x={sd < 0 ? -42 : 3} y={a} width={39} height={b - a} rx={9} fill={deep ? ORANGE : row(i)} stroke={LINE} strokeWidth={2} />
        )),
      )}
      <rect x={-104} y={-6} width={208} height={268} fill={`url(#sh${hi})`} clipPath={`url(#cl${hi})`} />
    </g>
  );
};

// 側面捲腹（2D 動作示意）
const Crunch: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g transform={`translate(${x},${y})`}>
    <line x1={-380} y1={0} x2={380} y2={0} stroke="#6b7079" strokeWidth={6} />
    {/* 小腿、大腿（膝蓋彎）*/}
    <path d="M150,-8 L240,-170 L330,-8" stroke="#1a1c20" strokeWidth={58} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M150,-8 L240,-170 L330,-8" stroke={BASE} strokeWidth={46} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <ellipse cx={346} cy={-10} rx={40} ry={14} fill={BASE} stroke="#1a1c20" strokeWidth={5} />
    {/* 骨盆＋上身抬起 30° */}
    <path d="M160,-40 Q100,-10 40,-34 Q-60,-70 -140,-150 Q-120,-196 -84,-176 Q-10,-120 70,-92 Q140,-80 168,-90 Z" fill={BASE} stroke="#1a1c20" strokeWidth={6} />
    {/* 腹肌（紅）*/}
    <path d="M60,-92 Q0,-108 -60,-150 L-40,-174 Q10,-136 70,-118 Z" fill={RED} stroke={LINE} strokeWidth={2} />
    {[0, 1, 2].map((k) => <path key={k} d={`M${44 - k * 34},${-96 - k * 18} L${58 - k * 34},${-122 - k * 18}`} stroke={LINE} strokeWidth={2} />)}
    {/* 頭、手抱頭 */}
    <circle cx={-176} cy={-206} r={46} fill={BASE} stroke="#1a1c20" strokeWidth={6} />
    <path d="M-96,-172 L-150,-250 L-200,-240" stroke="#1a1c20" strokeWidth={30} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M-96,-172 L-150,-250 L-200,-240" stroke={BASE} strokeWidth={20} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    {/* 動作弧線 */}
    <path d="M-250,-60 Q-300,-170 -240,-270" stroke="#4fd1ff" strokeWidth={8} fill="none" strokeDasharray="18 14" />
    <path d="M-252,-290 l-4,34 l30,-14 Z" fill="#4fd1ff" />
    <text x={-330} y={-150} textAnchor="middle" fontFamily={SANS} fontWeight={800} fontSize={30} fill="#4fd1ff">EXHALA</text>
  </g>
);

const LABELS: { hi: Hi; es: string; zh: string }[] = [
  { hi: "upper", es: "SUPERIOR", zh: "上腹" }, { hi: "lower", es: "INFERIOR", zh: "下腹" }, { hi: "oblique", es: "OBLICUOS", zh: "側腹" },
  { hi: "full", es: "RECTO", zh: "整片腹直肌" }, { hi: "deep", es: "CORE PROFUNDO", zh: "深層核心" },
];

export const AbsSheet: React.FC = () => (
  <AbsoluteFill style={{ background: "linear-gradient(180deg,#2c2f35 0%,#17191d 100%)" }}>
    <svg width={1080} height={1920} viewBox="0 0 1080 1920">
      <text x={540} y={150} textAnchor="middle" fontFamily={SANS} fontWeight={900} fontSize={96} fill="#35d0ff">3 MINUTOS</text>
      <text x={540} y={260} textAnchor="middle" fontFamily={SANS} fontWeight={900} fontSize={84} fill="#fff">ABDOMINALES</text>
      <text x={540} y={350} textAnchor="middle" fontFamily={SANS} fontWeight={900} fontSize={84} fill="#fff">FÁCILES</text>
      <text x={540} y={410} textAnchor="middle" fontFamily={SANS} fontWeight={600} fontSize={34} fill="#9aa0aa">3 分鐘簡單腹肌（樣張：2D 肌肉圖）</text>
      {LABELS.map((l, i) => {
        const x = i < 3 ? 190 + i * 350 : 365 + (i - 3) * 350, y = i < 3 ? 520 : 900;
        return (
          <g key={l.hi}>
            <Torso x={x} y={y} hi={l.hi} s={1.15} />
            <text x={x} y={y + 340} textAnchor="middle" fontFamily={SANS} fontWeight={800} fontSize={30} fill="#fff">{l.es}</text>
            <text x={x} y={y + 378} textAnchor="middle" fontFamily={SANS} fontWeight={600} fontSize={26} fill="#9aa0aa">{l.zh}</text>
          </g>
        );
      })}
      <rect x={60} y={1340} width={960} height={500} rx={30} fill="#23262b" stroke="#3a3e45" strokeWidth={3} />
      <text x={100} y={1400} fontFamily={SANS} fontWeight={800} fontSize={34} fill="#fff">CRUNCH · 捲腹</text>
      <text x={980} y={1400} textAnchor="end" fontFamily={SANS} fontWeight={900} fontSize={44} fill="#35d0ff">× 15</text>
      <Crunch x={560} y={1760} />
    </svg>
  </AbsoluteFill>
);
