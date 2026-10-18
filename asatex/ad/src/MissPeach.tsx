// 桃子小姐（向量重畫，照 DelphiChi 用 Gemini 生的設定表）：水蜜桃形捲髮髮髻＋葉子髮飾＋黑眼罩、杏仁眼長睫毛紅唇，
// 淡紫緞面細肩帶睡裙＋粉紅點點睡袍（有袖）＋毛毛拖鞋，一手叉腰。做成可動的骨架：頭 tilt、表情 eye/brow/mouth、對嘴 open、呼吸 breathe。
import React from "react";
import { AbsoluteFill } from "remotion";
import { Dango, Fx, FxG, LINE } from "./Mascots";

const o = { stroke: LINE, strokeWidth: 5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
const SKIN = "#fbd3bd", SKIN_D = "#eeb497", HAIR = "#ff9d84", HAIR_D = "#e97762", HAIR_L = "#ffc2ad";

export type LEye = "open" | "tired" | "star" | "shock" | "annoyed" | "happy" | "closed";
export type LMouth = "smile" | "open" | "o" | "pout" | "laugh" | "flat";
export type LExpr = { eye: LEye; mouth: LMouth; brow?: "normal" | "up" | "angry" | "sad"; open?: number; fx?: Fx[]; look?: number };

// 一隻眼睛（side = -1 左 / 1 右）
const Eye: React.FC<{ side: number; t: LEye; look: number }> = ({ side, t, look }) => {
  const cx = side * 34, cy = 0;
  const lash = (
    <path d={`M${cx - 20},${cy - 6} Q${cx},${cy - 20} ${cx + 20},${cy - 6} M${cx + side * 18},${cy - 8} l${side * 10},-8 M${cx + side * 13},${cy - 13} l${side * 6},-10`} fill="none" {...o} strokeWidth={4.5} />
  );
  if (t === "happy" || t === "closed") return <path d={`M${cx - 18},${cy} Q${cx},${cy + (t === "happy" ? -14 : 8)} ${cx + 18},${cy} M${cx + side * 16},${cy - 2} l${side * 8},-6`} fill="none" {...o} strokeWidth={4.5} />;
  const lid = t === "tired" ? 0.55 : t === "annoyed" ? 0.45 : 0;
  const big = t === "shock" ? 1.25 : 1;
  return (
    <g>
      <clipPath id={`eye${side}${t}`}><path d={`M${cx - 20},${cy} Q${cx},${cy - 16 * big} ${cx + 20},${cy} Q${cx},${cy + 13 * big} ${cx - 20},${cy} Z`} /></clipPath>
      <path d={`M${cx - 20},${cy} Q${cx},${cy - 16 * big} ${cx + 20},${cy} Q${cx},${cy + 13 * big} ${cx - 20},${cy} Z`} fill="#fff" />
      <g clipPath={`url(#eye${side}${t})`}>
        {t === "star"
          ? <path d={`M${cx},${cy - 12} l3.5,7.5 l8,1 l-6,5.5 l1.6,8 l-7.1,-4 l-7.1,4 l1.6,-8 l-6,-5.5 l8,-1 Z`} fill="#ffc83a" stroke="#c98a12" strokeWidth={2} />
          : <>
            <circle cx={cx + look * 6} cy={cy} r={t === "shock" ? 5 : 10} fill="#7a4a2a" />
            <circle cx={cx + look * 6} cy={cy} r={t === "shock" ? 2.5 : 5} fill="#2a160c" />
            <circle cx={cx + look * 6 - 3} cy={cy - 4} r={2.6} fill="#fff" />
          </>}
        {lid > 0 && <rect x={cx - 22} y={cy - 20} width={44} height={20 * lid + 6} fill={SKIN} />}
      </g>
      {lid > 0 && <path d={`M${cx - 20},${cy - 20 + 20 * lid + 4} L${cx + 20},${cy - 20 + 20 * lid + 4}`} {...o} strokeWidth={4} />}
      {lash}
      {t === "tired" && <path d={`M${cx - 16},${cy + 14} Q${cx},${cy + 22} ${cx + 16},${cy + 14}`} stroke="#b9859f" strokeWidth={4} fill="none" opacity={0.8} />}
    </g>
  );
};

const Brow: React.FC<{ side: number; t: LExpr["brow"] }> = ({ side, t = "normal" }) => {
  const cx = side * 34;
  const inner = t === "angry" ? 6 : t === "sad" ? -8 : 0, lift = t === "up" ? -8 : 0;
  return <path d={`M${cx - side * 16},${-26 + lift + inner} Q${cx},${-36 + lift} ${cx + side * 18},${-28 + lift}`} stroke="#8a4a3a" strokeWidth={4.5} fill="none" strokeLinecap="round" />;
};

const Lips: React.FC<{ t: LMouth; open?: number }> = ({ t, open }) => {
  const y = 58;
  if (open !== undefined && open > 0.08) return <g><ellipse cx={0} cy={y + 2} rx={10 + 5 * open} ry={4 + 11 * open} fill="#8a1f30" stroke="#d63a52" strokeWidth={4.5} /><path d={`M-8,${y - 4 * open} L8,${y - 4 * open}`} stroke="#fff" strokeWidth={3} /></g>;
  switch (t) {
    case "open": return <g><path d={`M-14,${y - 2} Q0,${y - 6} 14,${y - 2} Q12,${y + 16} 0,${y + 17} Q-12,${y + 16} -14,${y - 2} Z`} fill="#8a1f30" stroke="#d63a52" strokeWidth={4.5} /><path d={`M-10,${y} L10,${y}`} stroke="#fff" strokeWidth={3} /></g>;
    case "o": return <ellipse cx={0} cy={y + 4} rx={9} ry={12} fill="#8a1f30" stroke="#d63a52" strokeWidth={4.5} />;
    case "laugh": return <g><path d={`M-20,${y - 4} Q0,${y - 8} 20,${y - 4} Q16,${y + 22} 0,${y + 22} Q-16,${y + 22} -20,${y - 4} Z`} fill="#8a1f30" stroke="#d63a52" strokeWidth={4.5} /><path d={`M-14,${y - 2} L14,${y - 2}`} stroke="#fff" strokeWidth={4} /><ellipse cx={0} cy={y + 14} rx={8} ry={4} fill="#f07a8c" /></g>;
    case "pout": return <path d={`M-10,${y + 2} Q0,${y - 6} 10,${y + 2} Q0,${y + 8} -10,${y + 2} Z`} fill="#e23a55" stroke="#a51f37" strokeWidth={3} />;
    case "flat": return <path d={`M-12,${y} Q0,${y + 3} 12,${y}`} stroke="#c23048" strokeWidth={5} fill="none" strokeLinecap="round" />;
    default: return <path d={`M-16,${y - 2} Q-6,${y - 7} 0,${y - 3} Q6,${y - 7} 16,${y - 2} Q0,${y + 12} -16,${y - 2} Z`} fill="#e23a55" stroke="#a51f37" strokeWidth={3} />;
  }
};

// 頭（中心在臉中央，含頭髮、眼罩、葉子）
export const PeachHead2: React.FC<{ e: LExpr; tilt?: number }> = ({ e, tilt = 0 }) => {
  const curl = (x: number, y: number, r: number) => <circle cx={x} cy={y} r={r} fill={HAIR} {...o} />;
  return (
    <g transform={`rotate(${tilt},0,90)`}>
      {/* 後髮：兩側捲髮垂到下巴 */}
      {[-1, 1].map((sd) => <g key={sd}>{curl(sd * 82, 10, 30)}{curl(sd * 90, 52, 26)}{curl(sd * 78, 88, 22)}</g>)}
      {/* 蓬鬆的水蜜桃形捲髮：外圈一顆顆捲＋上方桃形（中間凹痕）*/}
      <path d="M0,-118 C40,-190 150,-180 130,-80 C150,-60 120,-30 100,-40 C80,-100 -80,-100 -100,-40 C-120,-30 -150,-60 -130,-80 C-150,-180 -40,-190 0,-118 Z" fill={HAIR} {...o} strokeWidth={6} />
      {[[-110, -80, 26], [-92, -130, 28], [-56, -160, 26], [56, -160, 26], [92, -130, 28], [110, -80, 26]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill={HAIR} {...o} />)}
      <path d="M0,-118 C40,-190 150,-180 130,-80 C120,-90 80,-110 0,-104 C-80,-110 -120,-90 -130,-80 C-150,-180 -40,-190 0,-118 Z" fill={HAIR} />
      <path d="M0,-150 Q-8,-128 0,-108" stroke={HAIR_D} strokeWidth={5} fill="none" />
      <path d="M-74,-150 Q-46,-172 -24,-150 M36,-160 Q70,-166 88,-136 M-104,-100 Q-96,-120 -80,-118" stroke={HAIR_L} strokeWidth={7} fill="none" strokeLinecap="round" />
      {/* 脖子＋臉 */}
      <path d="M-18,80 L-20,128 Q0,136 20,128 L18,80 Z" fill={SKIN} {...o} />
      <path d="M-74,-34 Q-80,52 -42,90 Q0,118 42,90 Q80,52 74,-34 Q66,-96 0,-100 Q-66,-96 -74,-34 Z" fill={SKIN} {...o} strokeWidth={5.5} />
      {[-1, 1].map((sd) => <ellipse key={sd} cx={sd * 76} cy={8} rx={10} ry={16} fill={SKIN} {...o} strokeWidth={4} />)}
      {/* 瀏海：一排捲 */}
      <path d="M-82,-26 Q-90,-96 -20,-104 Q60,-110 86,-40 Q70,-60 50,-50 Q40,-76 14,-64 Q-4,-86 -26,-62 Q-50,-78 -58,-50 Q-74,-56 -82,-26 Z" fill={HAIR} {...o} />
      {/* 眼罩＋葉子 */}
      <path d="M-92,-92 Q0,-122 92,-92 L88,-62 Q0,-88 -88,-62 Z" fill="#26232e" {...o} />
      <path d="M-64,-86 Q0,-104 64,-86" stroke="#4a4656" strokeWidth={4} fill="none" />
      <path d="M-96,-120 C-142,-142 -152,-104 -124,-90 C-110,-84 -96,-100 -96,-120 Z" fill="#7cc24a" {...o} />
      <path d="M-96,-120 C-112,-164 -76,-174 -66,-152 C-60,-138 -76,-124 -96,-120 Z" fill="#8ed15c" {...o} />
      {/* 五官 */}
      <ellipse cx={-48} cy={36} rx={18} ry={9} fill="#ff8f96" opacity={0.45} />
      <ellipse cx={48} cy={36} rx={18} ry={9} fill="#ff8f96" opacity={0.45} />
      <g transform="translate(0,6)">
        <Brow side={-1} t={e.brow} /><Brow side={1} t={e.brow} />
        <Eye side={-1} t={e.eye} look={e.look ?? 0} /><Eye side={1} t={e.eye} look={e.look ?? 0} />
      </g>
      <path d="M2,26 Q6,38 -2,42" stroke={SKIN_D} strokeWidth={4} fill="none" strokeLinecap="round" />
      <Lips t={e.mouth} open={e.open} />
      <FxG fx={e.fx ?? []} top={-200} side={120} />
    </g>
  );
};

// 全身（腳底在 (0,0)，高約 1100）
export const MissPeach: React.FC<{ e: LExpr; x?: number; y?: number; s?: number; tilt?: number; breathe?: number }> = ({ e, x = 0, y = 0, s = 1, tilt = 0, breathe = 0 }) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <defs>
      <linearGradient id="mpSatin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f0e6ff" /><stop offset="0.4" stopColor="#c7b1f6" /><stop offset="0.65" stopColor="#e2d6ff" /><stop offset="1" stopColor="#a68ee6" /></linearGradient>
      <linearGradient id="mpRobe" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe6f0" /><stop offset="1" stopColor="#ffc6dc" /></linearGradient>
      <linearGradient id="mpLeg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={SKIN_D} /><stop offset="0.5" stopColor={SKIN} /><stop offset="1" stopColor={SKIN_D} /></linearGradient>
    </defs>
    <ellipse cx={0} cy={6} rx={160} ry={18} fill="#000" opacity={0.08} />
    {/* 腿＋毛毛拖鞋 */}
    <path d="M-66,-400 C-74,-300 -66,-230 -58,-190 C-52,-150 -60,-90 -54,-40 L-26,-40 C-24,-90 -16,-150 -18,-200 C-16,-260 -4,-330 -2,-400 Z" fill="url(#mpLeg)" {...o} />
    <path d="M8,-400 C14,-330 18,-260 22,-200 C26,-150 36,-90 40,-40 L68,-40 C66,-90 60,-150 58,-200 C58,-270 60,-330 62,-400 Z" fill="url(#mpLeg)" {...o} />
    {[[-42, -22], [54, -22]].map(([fx, fy], i) => (
      <g key={i}><ellipse cx={fx} cy={fy} rx={48} ry={22} fill="#ff9cc0" {...o} /><path d={`M${fx - 38},${fy - 12} q9,-14 19,0 q9,-14 19,0 q9,-14 19,0 q9,-14 19,0`} fill="#ffd9e8" stroke="#ff9cc0" strokeWidth={5} /></g>
    ))}
    {/* 睡袍後片 */}
    <path d="M-120,-760 Q-196,-560 -176,-360 Q-120,-340 -60,-380 L60,-380 Q120,-340 176,-360 Q196,-560 120,-760 Z" fill="url(#mpRobe)" {...o} />
    {/* 緞面睡裙（沙漏、V 領細肩帶）*/}
    <g transform={`translate(0,${-breathe * 4})`}>
      <path d="M-62,-760 L-52,-800 M62,-760 L52,-800" stroke="#a68ee6" strokeWidth={5} />
      <path d="M-68,-760 Q-94,-716 -88,-670 Q-62,-620 -60,-600 Q-82,-530 -112,-480 Q-128,-430 -118,-380 Q0,-352 120,-380 Q130,-430 110,-480 Q80,-530 60,-600 Q62,-620 88,-670 Q94,-716 68,-760 Q34,-730 0,-680 Q-34,-730 -68,-760 Z" fill="url(#mpSatin)" {...o} />
      <path d="M-58,-600 Q0,-586 58,-600" stroke="#a68ee6" strokeWidth={5} fill="none" />
      <path d="M-80,-510 Q-58,-450 -82,-398 M48,-546 Q68,-466 54,-394" stroke="#fff" strokeWidth={8} fill="none" opacity={0.55} strokeLinecap="round" />
      {/* 肩頸鎖骨 */}
      <path d="M-26,-806 Q-80,-800 -104,-770 Q-96,-748 -66,-758 Q-34,-730 0,-680 Q34,-730 66,-758 Q96,-748 104,-770 Q80,-800 26,-806 Z" fill={SKIN} {...o} />
      <path d="M-56,-766 Q-34,-756 -14,-762 M56,-766 Q34,-756 14,-762" stroke={SKIN_D} strokeWidth={4} fill="none" strokeLinecap="round" />
    </g>
    {/* 睡袍前片＋袖子：左手叉腰、右手自然垂下 */}
    {[-1, 1].map((sd) => (
      <path key={sd} d={`M${sd * 92},-790 Q${sd * 140},-560 ${sd * 150},-372 Q${sd * 128},-360 ${sd * 108},-372 Q${sd * 112},-560 ${sd * 72},-760 Z`} fill="url(#mpRobe)" {...o} />
    ))}
    {/* 手臂＝袖子（睡袍粉）＋手：左手手肘往外叉腰，右手自然垂到大腿旁 */}
    {[
      { d: "M-98,-772 Q-150,-720 -172,-650 Q-150,-610 -96,-596", hand: [-86, -594] },
      { d: "M98,-772 Q138,-700 146,-620 Q146,-540 136,-480", hand: [134, -462] },
    ].map((a, i) => (
      <g key={i}>
        <path d={a.d} stroke={LINE} strokeWidth={50} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d={a.d} stroke="#ffd2e2" strokeWidth={40} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {[0.25, 0.5, 0.75].map((t) => null)}
        <circle cx={a.hand[0]} cy={a.hand[1]} r={19} fill={SKIN} {...o} />
      </g>
    ))}
    {Array.from({ length: 22 }, (_, i) => {
      const sd = i % 2 ? 1 : -1, k = Math.floor(i / 2);
      return <circle key={i} cx={sd * (112 + (k % 2) * 14 + k * 2)} cy={-740 + k * 34} r={6} fill="#ff8fb6" opacity={0.85} />;
    })}
    <rect x={118} y={-470} width={44} height={18} rx={4} fill="#fff" stroke={LINE} strokeWidth={3} />
    <text x={140} y={-456} textAnchor="middle" fontFamily="Montserrat, Arial" fontWeight={900} fontSize={10} fill="#c0122f">ASATEX</text>
    {/* 頭 */}
    <g transform="translate(0,-972) scale(1.35)"><PeachHead2 e={e} tilt={tilt} /></g>
  </g>
);

const SHOW: { n: string; e: LExpr }[] = [
  { n: "迷人微笑", e: { eye: "open", mouth: "smile" } },
  { n: "黑眼圈・好累", e: { eye: "tired", mouth: "flat", brow: "sad", fx: ["sweat"] } },
  { n: "想通了！", e: { eye: "star", mouth: "open", brow: "up", fx: ["sparkle"] } },
  { n: "醫生？！", e: { eye: "shock", mouth: "o", brow: "up", fx: ["shock"] } },
  { n: "五百塊？", e: { eye: "annoyed", mouth: "pout", brow: "angry", look: 1, fx: ["anger"] } },
  { n: "大笑", e: { eye: "happy", mouth: "laugh", brow: "up" } },
];
export const MissPeachSheet: React.FC = () => (
  <AbsoluteFill style={{ background: "#fffaf6" }}>
    <svg width={1080} height={1920} viewBox="0 0 1080 1920">
      <text x={540} y={80} textAnchor="middle" fontFamily='"PingFang TC", sans-serif' fontWeight={900} fontSize={50} fill={LINE}>桃子小姐（向量重畫・可動骨架）</text>
      <MissPeach e={{ eye: "open", mouth: "smile" }} x={300} y={1400} s={0.98} />
      <Dango e={{ eye: "line", mouth: "flat" }} x={820} y={1400} s={1.1} />
      {SHOW.map((x, i) => (
        <g key={x.n}>
          <g transform={`translate(${110 + (i % 6) * 172},1640) scale(0.6)`}><PeachHead2 e={x.e} /></g>
          <text x={110 + (i % 6) * 172} y={1800} textAnchor="middle" fontFamily='"PingFang TC", sans-serif' fontWeight={700} fontSize={22} fill="#8a6a5e">{x.n}</text>
        </g>
      ))}
    </svg>
  </AbsoluteFill>
);
