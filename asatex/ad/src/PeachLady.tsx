// 水果人女病人「桃桃小姐」（2D 向量、時尚插畫的優雅性感，不暴露）：水蜜桃頭＋眼罩、長睫毛紅唇，
// 修長身材，穿 Asatex 緞面睡裙＋敞開點點睡袍、毛毛拖鞋，一手叉腰一手抱愛心枕。跟糰糰醫生同畫風（粗線、平塗＋柔和陰影）。
import React from "react";
import { AbsoluteFill } from "remotion";
import { Expr, EyeG, FxG, LINE } from "./Mascots";
import { Dango } from "./Mascots";

const o = { stroke: LINE, strokeWidth: 6, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
const SKIN = "#ffd2c2";

// 桃子頭＋臉（中心在 (0,0)，寬約 260）
export const PeachHead: React.FC<{ e: Expr; s?: number }> = ({ e, s = 1 }) => {
  const lips = e.open !== undefined && e.open > 0.08 ? "open" : e.mouth;
  return (
    <g transform={`scale(${s})`}>
      <defs><radialGradient id="ph" cx="0.35" cy="0.3" r="0.85"><stop offset="0" stopColor="#fff1ea" /><stop offset="0.55" stopColor="#ffbfae" /><stop offset="1" stopColor="#ff8a84" /></radialGradient></defs>
      <path d="M0,-118 C28,-150 132,-130 138,-10 C142,86 80,128 0,128 C-80,128 -142,86 -138,-10 C-132,-130 -28,-150 0,-118 Z" fill="url(#ph)" {...o} strokeWidth={7} />
      <path d="M0,-118 Q-16,-70 -6,-30" stroke="#e8857e" strokeWidth={5} fill="none" strokeLinecap="round" />
      <path d="M-4,-124 C-40,-156 -78,-140 -70,-112 C-58,-98 -26,-104 -4,-124 Z" fill="#8ccf5a" {...o} />
      <path d="M-4,-124 Q4,-146 18,-152" stroke="#5e9e36" strokeWidth={6} fill="none" strokeLinecap="round" />
      {/* 額頭上的眼罩 */}
      <g transform="translate(0,-74)">
        <path d="M-118,0 Q0,-26 118,0 L110,34 Q0,16 -110,34 Z" fill="#2e2a3a" {...o} />
        <path d="M-60,14 q14,9 28,0 M32,14 q14,9 28,0" stroke="#f3c6ff" strokeWidth={4} fill="none" strokeLinecap="round" />
        <path d="M-118,6 Q-150,20 -138,60 M118,6 Q150,20 138,60" stroke="#2e2a3a" strokeWidth={6} fill="none" />
      </g>
      {/* 臉 */}
      <ellipse cx={-72} cy={34} rx={24} ry={13} fill="#ff7f8f" opacity={0.55} />
      <ellipse cx={72} cy={34} rx={24} ry={13} fill="#ff7f8f" opacity={0.55} />
      <EyeG x={-44} t={e.eye} r={17} /><EyeG x={44} t={e.eye} r={17} />
      {["dot", "sad", "tears", "star", "angry", "shock"].includes(e.eye) && [-1, 1].map((sd) => (
        <path key={sd} d={`M${sd * 58},-14 l${sd * 14},-10 M${sd * 62},-4 l${sd * 16},-6 M${sd * 52},-20 l${sd * 8},-12`} {...o} strokeWidth={4} />
      ))}
      {(e.eye === "sad" || e.eye === "tears" || e.fx?.includes("sweat")) && <path d="M-66,-26 L-28,-36 M66,-26 L28,-36" {...o} strokeWidth={5} />}
      {e.eye === "angry" && <path d="M-68,-34 L-26,-20 M68,-34 L26,-20" {...o} strokeWidth={7} />}
      {/* 紅唇 */}
      {lips === "open" || lips === "o" || lips === "laugh"
        ? <ellipse cx={0} cy={58} rx={lips === "laugh" ? 22 : 12 + 8 * (e.open ?? 0.5)} ry={lips === "laugh" ? 16 : 8 + 12 * (e.open ?? 0.5)} fill="#9c1f33" stroke="#d6334f" strokeWidth={6} />
        : lips === "frown" || lips === "wavy"
          ? <path d="M-16,62 Q0,52 16,62 Q0,66 -16,62 Z" fill="#d6334f" stroke="#a51f37" strokeWidth={3} />
          : <path d="M-18,54 Q-8,48 0,53 Q8,48 18,54 Q0,70 -18,54 Z" fill="#e23a55" stroke="#a51f37" strokeWidth={3} />}
      <FxG fx={e.fx ?? []} top={-150} side={110} />
    </g>
  );
};

// 全身（腳底在 (0,0)，高約 1150）
export const PeachLady: React.FC<{ e: Expr; x?: number; y?: number; s?: number }> = ({ e, x = 0, y = 0, s = 1 }) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <defs>
      <linearGradient id="satin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#efe6ff" /><stop offset="0.45" stopColor="#c9b4ff" /><stop offset="0.7" stopColor="#e3d8ff" /><stop offset="1" stopColor="#a993ec" /></linearGradient>
      <linearGradient id="robe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff4fa" /><stop offset="1" stopColor="#ffd9ea" /></linearGradient>
      <linearGradient id="leg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#f2b9a6" /><stop offset="0.5" stopColor={SKIN} /><stop offset="1" stopColor="#f2b9a6" /></linearGradient>
    </defs>
    <ellipse cx={0} cy={6} rx={150} ry={18} fill="#000" opacity={0.08} />
    {/* 睡袍：從手肘滑落、在身後垂下（先畫在最底層）*/}
    <path d="M-150,-640 Q-210,-470 -170,-300 Q-120,-280 -96,-330 Q-120,-470 -96,-600 Z" fill="url(#robe)" {...o} />
    <path d="M150,-640 Q214,-470 176,-290 Q130,-276 104,-326 Q122,-470 100,-600 Z" fill="url(#robe)" {...o} />
    {Array.from({ length: 8 }, (_, i) => <circle key={i} cx={-150 + (i % 2) * 18 - i * 2} cy={-590 + i * 34} r={6} fill="#ff9cbf" />)}
    {Array.from({ length: 8 }, (_, i) => <circle key={"r" + i} cx={150 - (i % 2) * 18 + i * 2} cy={-590 + i * 34} r={6} fill="#ff9cbf" />)}
    <rect x={128} y={-430} width={46} height={20} rx={4} fill="#fff" stroke={LINE} strokeWidth={3} transform="rotate(8,151,-420)" />
    <text x={151} y={-415} textAnchor="middle" fontFamily="Montserrat, Arial" fontWeight={900} fontSize={11} fill="#c0122f" transform="rotate(8,151,-420)">ASATEX</text>
    {/* 腿：左腿站直承重，右腿交叉在前、膝蓋微彎、腳尖點地 */}
    <path d="M-62,-390 C-70,-300 -60,-230 -52,-190 C-46,-150 -56,-90 -50,-40 L-24,-40 C-22,-90 -14,-150 -16,-200 C-14,-260 -2,-320 0,-390 Z" fill="url(#leg)" {...o} />
    <path d="M6,-390 C12,-320 8,-260 -6,-200 C-18,-150 -30,-110 -34,-60 L-12,-54 C-4,-100 14,-150 30,-196 C48,-250 56,-320 52,-390 Z" fill="url(#leg)" {...o} />
    <path d="M-40,-46 C-64,-44 -84,-30 -80,-14 C-60,-6 -30,-10 -18,-26 Z" fill="#ff8fb4" {...o} />
    <path d="M-28,-60 C-46,-46 -50,-24 -40,-10 C-24,-8 -10,-24 -10,-46 Z" fill="#ff8fb4" {...o} />
    {/* 緞面 V 領細肩帶睡裙：沙漏身形、臀部微傾 */}
    <g transform="rotate(-3,0,-560)">
      <path d="M-66,-742 L-54,-790 M66,-742 L54,-790" stroke="#a993ec" strokeWidth={5} />
      <path d="M-70,-742 Q-96,-700 -90,-660 Q-64,-610 -60,-590 Q-80,-520 -112,-470 Q-130,-420 -118,-372 Q0,-344 124,-372 Q132,-420 112,-470 Q80,-520 60,-590 Q64,-610 90,-660 Q96,-700 70,-742 Q36,-712 0,-664 Q-36,-712 -70,-742 Z" fill="url(#satin)" {...o} />
      <path d="M-60,-590 Q0,-576 60,-590" stroke="#a993ec" strokeWidth={6} fill="none" />
      <path d="M-82,-500 Q-60,-440 -84,-390 M50,-540 Q70,-460 56,-386 M-20,-640 Q-30,-620 -24,-600" stroke="#fff" strokeWidth={8} fill="none" opacity={0.55} strokeLinecap="round" />
      <path d="M-118,-372 Q-60,-358 -10,-366 Q60,-356 124,-372" stroke="#a993ec" strokeWidth={5} fill="none" />
    </g>
    {/* 肩膀、鎖骨（V 領露出來的肌膚）*/}
    <path d="M-28,-790 Q-90,-786 -120,-756 Q-110,-730 -70,-742 Q-36,-712 0,-664 Q36,-712 70,-742 Q110,-730 120,-756 Q90,-786 28,-790 Z" fill={SKIN} {...o} />
    <path d="M-60,-752 Q-36,-742 -14,-748 M60,-752 Q36,-742 14,-748" stroke="#e8a592" strokeWidth={4} fill="none" strokeLinecap="round" />
    {/* 左手：手肘往外、叉在腰上 */}
    <path d="M-112,-752 Q-176,-680 -150,-610 Q-120,-590 -66,-598" fill="none" stroke={LINE} strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M-112,-752 Q-176,-680 -150,-610 Q-120,-590 -66,-598" fill="none" stroke={SKIN} strokeWidth={20} strokeLinecap="round" strokeLinejoin="round" />
    {/* 右手：垂下來把愛心枕抱在臀邊 */}
    <path d="M112,-752 Q150,-660 140,-560 Q132,-500 104,-470" fill="none" stroke={LINE} strokeWidth={32} strokeLinecap="round" />
    <path d="M112,-752 Q150,-660 140,-560 Q132,-500 104,-470" fill="none" stroke={SKIN} strokeWidth={20} strokeLinecap="round" />
    <g transform="translate(142,-470) rotate(14) scale(0.8)">
      <path d="M0,40 C-70,-10 -60,-80 -20,-80 C-2,-80 0,-62 0,-56 C0,-62 2,-80 20,-80 C60,-80 70,-10 0,40 Z" fill="#ff6f96" {...o} />
      <path d="M-34,-56 Q-44,-30 -26,-14" stroke="#fff" strokeWidth={7} fill="none" opacity={0.6} strokeLinecap="round" />
    </g>
    {/* 脖子＋頭 */}
    <path d="M-20,-820 L-22,-784 Q0,-776 22,-784 L20,-820 Z" fill={SKIN} {...o} />
    <g transform="translate(0,-930)"><PeachHead e={e} /></g>
  </g>
);

const SHOW: { n: string; e: Expr }[] = [
  { n: "睡不著・好累", e: { eye: "closed", mouth: "wavy", fx: ["sweat"] } },
  { n: "想通了！", e: { eye: "star", mouth: "o", fx: ["sparkle"] } },
  { n: "醫生？！", e: { eye: "shock", mouth: "o", fx: ["shock"] } },
  { n: "五百塊？", e: { eye: "angry", mouth: "frown", fx: ["anger"] } },
];
export const PeachSheet: React.FC = () => (
  <AbsoluteFill style={{ background: "#fff8f5" }}>
    <svg width={1080} height={1920} viewBox="0 0 1080 1920">
      <text x={540} y={86} textAnchor="middle" fontFamily='"PingFang TC", sans-serif' fontWeight={900} fontSize={52} fill={LINE}>桃桃小姐（水果人女病人・2D）</text>
      <PeachLady e={{ eye: "dot", mouth: "smile" }} x={330} y={1330} s={1.05} />
      <Dango e={{ eye: "line", mouth: "flat" }} x={830} y={1330} s={1.15} />
      <text x={830} y={1380} textAnchor="middle" fontFamily='"PingFang TC", sans-serif' fontWeight={700} fontSize={28} fill="#8a6a5e">（跟糰糰醫生的比例）</text>
      {SHOW.map((x, i) => (
        <g key={x.n}>
          <g transform={`translate(${140 + i * 268},1600)`}><PeachHead e={x.e} s={0.62} /></g>
          <text x={140 + i * 268} y={1730} textAnchor="middle" fontFamily='"PingFang TC", sans-serif' fontWeight={700} fontSize={26} fill="#8a6a5e">{x.n}</text>
        </g>
      ))}
    </svg>
  </AbsoluteFill>
);
