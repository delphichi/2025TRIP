// 水果擬人 Q 版女孩（2.5 頭身，人臉＋頭髮/衣服做成水果）：桃桃（水蜜桃髮髻＋眼罩）、莓莓（草莓紅捲髮＋葉冠）、檬檬（檸檬黃短髮＋檸檬片髮夾）。
// 都穿 Asatex 睡衣（點點＋領口小標）。臉用 Mascots.tsx 的 EyeG/MouthG/FxG（小眼睛版），可跟糰糰醫生同框。
import React from "react";
import { AbsoluteFill } from "remotion";
import { Dango, Expr, EyeG, FxG, LINE, MouthG } from "./Mascots";

const o = { stroke: LINE, strokeWidth: 6, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
const SKIN = "#ffe6d8";

type Theme = {
  hairBack: string; hairFront: string; hairColor: string; hairShade: string;
  dress: string; dot: string; extra?: React.ReactNode; top?: React.ReactNode;
};

const Girl: React.FC<{ e: Expr; th: Theme; x?: number; y?: number; s?: number }> = ({ e, th, x = 0, y = 0, s = 1 }) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <ellipse cx={0} cy={6} rx={100} ry={12} fill="#000" opacity={0.08} />
    {/* 後髮 */}
    <path d={th.hairBack} fill={th.hairColor} {...o} />
    {/* 腿＋拖鞋 */}
    {[-1, 1].map((sd) => (
      <g key={sd}>
        <path d={`M${sd * 24},-110 L${sd * 26},-30`} stroke={LINE} strokeWidth={28} strokeLinecap="round" />
        <path d={`M${sd * 24},-110 L${sd * 26},-30`} stroke={SKIN} strokeWidth={16} strokeLinecap="round" />
        <ellipse cx={sd * 30} cy={-18} rx={30} ry={16} fill={th.dot} {...o} />
      </g>
    ))}
    {/* 手 */}
    {[-1, 1].map((sd) => (
      <g key={sd}>
        <path d={`M${sd * 54},-224 Q${sd * 84},-180 ${sd * 78},-142`} stroke={LINE} strokeWidth={26} fill="none" strokeLinecap="round" />
        <path d={`M${sd * 54},-224 Q${sd * 84},-180 ${sd * 78},-142`} stroke={SKIN} strokeWidth={14} fill="none" strokeLinecap="round" />
      </g>
    ))}
    {/* Asatex 睡衣洋裝（A 字＋小圓領）*/}
    <path d="M-50,-236 Q0,-246 50,-236 Q72,-170 92,-100 Q0,-84 -92,-100 Q-72,-170 -50,-236 Z" fill={th.dress} {...o} />
    <clipPath id={`dr${th.dress}`}><path d="M-50,-236 Q0,-246 50,-236 Q72,-170 92,-100 Q0,-84 -92,-100 Q-72,-170 -50,-236 Z" /></clipPath>
    <g clipPath={`url(#dr${th.dress})`}>{Array.from({ length: 24 }, (_, i) => <circle key={i} cx={-90 + (i % 6) * 36 + (Math.floor(i / 6) % 2) * 18} cy={-226 + Math.floor(i / 6) * 34} r={5} fill={th.dot} />)}</g>
    <path d="M-34,-238 Q-18,-214 0,-232 Q18,-214 34,-238" fill="#fff" {...o} strokeWidth={5} />
    <rect x={18} y={-196} width={34} height={14} rx={3} fill="#fff" stroke={LINE} strokeWidth={3} />
    <text x={35} y={-185} textAnchor="middle" fontFamily="Montserrat, Arial" fontWeight={900} fontSize={8} fill="#c0122f">ASATEX</text>
    {th.extra}
    {/* 頭 */}
    <g transform="translate(0,-340)">
      <ellipse cx={0} cy={0} rx={96} ry={88} fill={SKIN} {...o} />
      <ellipse cx={-56} cy={30} rx={18} ry={10} fill="#ff9aa6" opacity={0.6} />
      <ellipse cx={56} cy={30} rx={18} ry={10} fill="#ff9aa6" opacity={0.6} />
      <EyeG x={-32} t={e.eye} r={9} /><EyeG x={32} t={e.eye} r={9} />
      {(e.eye === "sad" || e.eye === "tears" || e.fx?.includes("sweat")) && <path d="M-46,-22 L-20,-28 M46,-22 L20,-28" {...o} strokeWidth={4} />}
      {e.eye === "angry" && <path d="M-48,-26 L-20,-16 M48,-26 L20,-16" {...o} strokeWidth={6} />}
      <g transform="scale(0.75)"><MouthG t={e.mouth} open={e.open} y={44} /></g>
      {/* 前髮 */}
      <path d={th.hairFront} fill={th.hairColor} {...o} />
      {th.top}
      <FxG fx={e.fx ?? []} top={-150} side={96} />
    </g>
  </g>
);

// 桃桃：水蜜桃形狀的大髮髻（中間一道凹痕）＋葉子＋推到頭上的眼罩
export const THEMES: Record<string, Theme> = {
  peach: {
    hairColor: "#ffb4a2", hairShade: "#ff8f86", dress: "#e9ddff", dot: "#ffadc8",
    hairBack: "M-104,-370 Q-120,-250 -96,-200 L96,-200 Q120,-250 104,-370 Z",
    hairFront: "M-98,-10 Q-104,-96 -40,-108 Q0,-116 40,-108 Q104,-96 98,-10 Q70,-60 30,-58 Q0,-80 -24,-56 Q-70,-62 -98,-10 Z",
    top: <g>
      <path d="M0,-96 C30,-168 120,-150 110,-96 C104,-60 40,-70 0,-96 Z M0,-96 C-30,-168 -120,-150 -110,-96 C-104,-60 -40,-70 0,-96 Z" fill="#ffb4a2" {...o} />
      <path d="M0,-96 Q-6,-130 0,-150" stroke="#ff8f86" strokeWidth={5} fill="none" />
      <path d="M2,-148 C30,-186 70,-170 60,-146 C48,-132 20,-136 2,-148 Z" fill="#8ccf5a" {...o} strokeWidth={5} />
      <path d="M-80,-62 Q0,-84 80,-62 L76,-38 Q0,-56 -76,-38 Z" fill="#2e2a3a" {...o} strokeWidth={5} />
      <path d="M-40,-52 q10,7 20,0 M20,-52 q10,7 20,0" stroke="#f3c6ff" strokeWidth={3} fill="none" strokeLinecap="round" />
    </g>,
  },
  strawberry: {
    hairColor: "#ff4f5e", hairShade: "#d93a4a", dress: "#ffd6dc", dot: "#ff5f74",
    hairBack: "M-110,-380 Q-136,-260 -108,-180 Q-60,-160 -40,-200 L40,-200 Q60,-160 108,-180 Q136,-260 110,-380 Z",
    hairFront: "M-100,-6 Q-110,-104 0,-112 Q110,-104 100,-6 Q76,-52 40,-50 Q10,-74 -10,-50 Q-60,-58 -100,-6 Z",
    top: <g>
      {[[-50, -70], [-20, -86], [16, -84], [52, -68], [-70, -40], [72, -40], [-34, -56], [34, -56]].map(([a, b], i) => <ellipse key={i} cx={a} cy={b} rx={3.5} ry={5} fill="#ffe08a" />)}
      <path d="M-60,-104 L-40,-140 L-16,-108 L0,-146 L16,-108 L40,-140 L60,-104 Z" fill="#6cc04a" {...o} strokeWidth={5} />
    </g>,
  },
  lemon: {
    hairColor: "#ffe14f", hairShade: "#f0c52a", dress: "#fff5c4", dot: "#ffd23f",
    hairBack: "M-106,-372 Q-118,-280 -96,-236 L96,-236 Q118,-280 106,-372 Z",
    hairFront: "M-100,-4 Q-108,-104 0,-112 Q108,-104 100,-4 Q60,-40 20,-30 Q-10,-70 -40,-34 Q-80,-40 -100,-4 Z",
    top: <g transform="translate(64,-84) rotate(20)">
      <circle r={28} fill="#ffe14f" {...o} strokeWidth={5} />
      <circle r={20} fill="#fff8c8" />
      {Array.from({ length: 8 }, (_, i) => <line key={i} x1={0} y1={0} x2={Math.cos((i * Math.PI) / 4) * 18} y2={Math.sin((i * Math.PI) / 4) * 18} stroke="#f0c52a" strokeWidth={3} />)}
    </g>,
  },
};

export const Peachy: React.FC<{ e: Expr; x?: number; y?: number; s?: number }> = (p) => <Girl {...p} th={THEMES.peach} />;

const SHOW: { n: string; e: Expr }[] = [
  { n: "開心", e: { eye: "dot", mouth: "smile" } },
  { n: "睡不著", e: { eye: "closed", mouth: "wavy", fx: ["sweat"] } },
  { n: "想通了！", e: { eye: "star", mouth: "open", fx: ["sparkle"] } },
  { n: "醫生？！", e: { eye: "shock", mouth: "o", fx: ["shock"] } },
  { n: "五百塊？", e: { eye: "angry", mouth: "frown", fx: ["anger"] } },
];
export const FruitGirlSheet: React.FC = () => (
  <AbsoluteFill style={{ background: "#fffaf6" }}>
    <svg width={1080} height={1920} viewBox="0 0 1080 1920">
      <text x={540} y={86} textAnchor="middle" fontFamily='"PingFang TC", sans-serif' fontWeight={900} fontSize={50} fill={LINE}>水果擬人女孩（Q 版・穿 Asatex 睡衣）</text>
      {[["peach", "桃桃"], ["strawberry", "莓莓"], ["lemon", "檬檬"]].map(([k, n], i) => (
        <g key={k}>
          <Girl e={{ eye: "dot", mouth: "smile" }} th={THEMES[k]} x={190 + i * 350} y={700} s={1.1} />
          <text x={190 + i * 350} y={752} textAnchor="middle" fontFamily='"PingFang TC", sans-serif' fontWeight={900} fontSize={36} fill={LINE}>{n}</text>
        </g>
      ))}
      <text x={60} y={810} fontFamily='"PingFang TC", sans-serif' fontWeight={900} fontSize={34} fill={LINE}>桃桃的表情</text>
      {SHOW.map((x, i) => (
        <g key={x.n}>
          <Girl e={x.e} th={THEMES.peach} x={118 + i * 211} y={1220} s={0.78} />
          <text x={118 + i * 211} y={1268} textAnchor="middle" fontFamily='"PingFang TC", sans-serif' fontWeight={700} fontSize={26} fill="#8a6a5e">{x.n}</text>
        </g>
      ))}
      <text x={60} y={1360} fontFamily='"PingFang TC", sans-serif' fontWeight={900} fontSize={34} fill={LINE}>跟糰糰醫生同框</text>
      <Dango e={{ eye: "line", mouth: "flat" }} x={360} y={1820} s={1.05} />
      <Girl e={{ eye: "closed", mouth: "wavy", fx: ["sweat"] }} th={THEMES.peach} x={720} y={1820} s={1.05} />
    </svg>
  </AbsoluteFill>
);
