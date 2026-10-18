// 女病人三個候選（向量，跟糰糰醫生同畫風）：薯寶女生版／桃桃（水蜜桃＋眼罩睡帽）／珍奶寶（珍珠奶茶）。
// 都穿 Asatex 睡衣（粉色點點、領口小標）；臉的零件沿用 Mascots.tsx 的 EyeG / MouthG / FxG。
import React from "react";
import { AbsoluteFill } from "remotion";
import { Expr, EyeG, FxG, LINE, MouthG } from "./Mascots";

const o = { stroke: LINE, strokeWidth: 7, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
const Lashes: React.FC<{ x: number }> = ({ x }) => (
  <path d={`M${x + (x > 0 ? 12 : -12)},-14 l${x > 0 ? 10 : -10},-8 M${x + (x > 0 ? 16 : -16)},-6 l${x > 0 ? 12 : -12},-4`} {...o} strokeWidth={4} />
);
const Face: React.FC<{ e: Expr; y: number; blush?: string; dx?: number }> = ({ e, y, blush = "#ff8fa3", dx = 38 }) => (
  <g transform={`translate(0,${y})`}>
    <ellipse cx={-dx - 26} cy={30} rx={20} ry={12} fill={blush} opacity={0.65} />
    <ellipse cx={dx + 26} cy={30} rx={20} ry={12} fill={blush} opacity={0.65} />
    <EyeG x={-dx} t={e.eye} r={16} /><EyeG x={dx} t={e.eye} r={16} />
    {["dot", "sad", "tears", "star", "angry"].includes(e.eye) && <><Lashes x={-dx} /><Lashes x={dx} /></>}
    {e.eye === "angry" && <path d={`M${-dx - 22},-30 L${-dx + 14},-16 M${dx + 22},-30 L${dx - 14},-16`} {...o} strokeWidth={7} />}
    {(e.eye === "sad" || e.eye === "tears" || e.fx?.includes("sweat")) && <path d={`M${-dx - 20},-24 L${-dx + 14},-34 M${dx + 20},-24 L${dx - 14},-34`} {...o} strokeWidth={5} />}
    <MouthG t={e.mouth} open={e.open} y={36} />
    <FxG fx={e.fx ?? []} top={-130} side={96} />
  </g>
);
// Asatex 睡衣（上衣＋領口；身體下半部的衣服形狀由各角色傳入 path）
const Pajama: React.FC<{ d: string; c?: string; dot?: string }> = ({ d, c = "#ffd0e0", dot = "#ff9cbf" }) => (
  <g>
    <path d={d} fill={c} {...o} />
    <clipPath id={`pj${c}`}><path d={d} /></clipPath>
    <g clipPath={`url(#pj${c})`}>{Array.from({ length: 30 }, (_, i) => <circle key={i} cx={-130 + (i % 6) * 52 + (Math.floor(i / 6) % 2) * 26} cy={-150 + Math.floor(i / 6) * 34} r={6} fill={dot} />)}</g>
    <path d="M-34,-140 L0,-112 L34,-140" fill="none" {...o} strokeWidth={6} />
    <rect x={14} y={-124} width={34} height={16} rx={4} fill="#fff" stroke={LINE} strokeWidth={3} />
    <text x={31} y={-112} textAnchor="middle" fontFamily="Montserrat, Arial" fontWeight={900} fontSize={9} fill="#c0122f">ASATEX</text>
  </g>
);

// 1. 薯寶・女生版
export const PotatoGirl: React.FC<{ e: Expr; x?: number; y?: number; s?: number }> = ({ e, x = 0, y = 0, s = 1 }) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <defs><radialGradient id="potg" cx="0.38" cy="0.3" r="0.8"><stop offset="0" stopColor="#ffe9a0" /><stop offset="0.7" stopColor="#f8cf5a" /><stop offset="1" stopColor="#e8b03a" /></radialGradient></defs>
    <ellipse cx={0} cy={4} rx={105} ry={12} fill="#000" opacity={0.08} />
    <ellipse cx={-38} cy={-8} rx={22} ry={14} fill="#f8cf5a" {...o} /><ellipse cx={38} cy={-8} rx={22} ry={14} fill="#f8cf5a" {...o} />
    <path d="M0,-290 C78,-290 126,-220 124,-140 C122,-70 80,-30 0,-30 C-80,-30 -122,-70 -124,-140 C-126,-220 -78,-290 0,-290 Z" fill="url(#potg)" {...o} />
    {[[-64, -228], [70, -236], [84, -214]].map(([a, b], i) => <circle key={i} cx={a} cy={b} r={4} fill="#d39a36" opacity={0.7} />)}
    <Pajama d="M-122,-150 C-80,-170 80,-170 122,-150 C130,-80 104,-32 0,-30 C-104,-32 -130,-80 -122,-150 Z" />
    {/* 芽＋粉紅蝴蝶結 */}
    <path d="M0,-290 Q-2,-310 2,-320" stroke="#5e9e36" strokeWidth={7} fill="none" strokeLinecap="round" />
    <path d="M2,-316 C-28,-346 -60,-328 -48,-308 C-36,-296 -12,-300 2,-316 Z" fill="#8ccf5a" {...o} strokeWidth={6} />
    <path d="M2,-316 C30,-348 64,-332 52,-310 C40,-296 14,-300 2,-316 Z" fill="#8ccf5a" {...o} strokeWidth={6} />
    <g transform="translate(70,-262) rotate(18)">
      <path d="M0,0 L-30,-18 Q-38,0 -30,18 Z M0,0 L30,-18 Q38,0 30,18 Z" fill="#ff7aa8" {...o} strokeWidth={5} />
      <circle r={9} fill="#ff4f8b" {...o} strokeWidth={4} />
    </g>
    <Face e={e} y={-200} />
  </g>
);

// 2. 桃桃（水蜜桃女孩＋頭上眼罩＋歪睡帽）
export const Peach: React.FC<{ e: Expr; x?: number; y?: number; s?: number }> = ({ e, x = 0, y = 0, s = 1 }) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <defs><radialGradient id="peachg" cx="0.35" cy="0.3" r="0.85"><stop offset="0" stopColor="#fff1ea" /><stop offset="0.55" stopColor="#ffc2b4" /><stop offset="1" stopColor="#ff8f8a" /></radialGradient></defs>
    <ellipse cx={0} cy={4} rx={108} ry={12} fill="#000" opacity={0.08} />
    <ellipse cx={-38} cy={-8} rx={22} ry={14} fill="#ffc2b4" {...o} /><ellipse cx={38} cy={-8} rx={22} ry={14} fill="#ffc2b4" {...o} />
    {/* 桃子：上面有一道凹痕 */}
    <path d="M0,-268 C30,-300 120,-280 128,-170 C134,-80 90,-30 0,-30 C-90,-30 -134,-80 -128,-170 C-120,-280 -30,-300 0,-268 Z" fill="url(#peachg)" {...o} />
    <path d="M0,-268 Q-14,-220 -6,-180" stroke="#e8857e" strokeWidth={5} fill="none" strokeLinecap="round" />
    <Pajama d="M-126,-148 C-84,-168 84,-168 126,-148 C132,-80 104,-32 0,-30 C-104,-32 -132,-80 -126,-148 Z" c="#e6dcff" dot="#b9a6ff" />
    {/* 葉子＋歪睡帽 */}
    <path d="M-6,-276 C-40,-300 -70,-286 -62,-262 C-50,-250 -24,-256 -6,-276 Z" fill="#8ccf5a" {...o} strokeWidth={6} />
    <g transform="translate(46,-272) rotate(24)">
      <path d="M-40,10 Q-10,-70 60,-40 Q20,-20 40,10 Z" fill="#9db4ff" {...o} strokeWidth={6} />
      <circle cx={62} cy={-42} r={13} fill="#fff" {...o} strokeWidth={5} />
      <path d="M-44,10 Q0,22 44,10" stroke="#fff" strokeWidth={14} fill="none" strokeLinecap="round" />
    </g>
    {/* 推到額頭上的眼罩（上面畫著閉著的眼睛）*/}
    <g transform="translate(0,-246)">
      <path d="M-90,0 Q0,-20 90,0 L84,30 Q0,14 -84,30 Z" fill="#ffd3e3" {...o} strokeWidth={6} />
      <path d="M-44,12 q12,8 24,0 M20,12 q12,8 24,0" stroke={LINE} strokeWidth={4} fill="none" strokeLinecap="round" />
    </g>
    <Face e={e} y={-176} blush="#ff7f8f" />
  </g>
);

// 3. 珍奶寶（珍珠奶茶杯女孩，吸管當呆毛）
export const Boba: React.FC<{ e: Expr; x?: number; y?: number; s?: number }> = ({ e, x = 0, y = 0, s = 1 }) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <defs><linearGradient id="tea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f4dcc0" /><stop offset="1" stopColor="#d7a97a" /></linearGradient></defs>
    <ellipse cx={0} cy={4} rx={100} ry={12} fill="#000" opacity={0.08} />
    <ellipse cx={-36} cy={-8} rx={22} ry={14} fill="#f4dcc0" {...o} /><ellipse cx={36} cy={-8} rx={22} ry={14} fill="#f4dcc0" {...o} />
    {/* 吸管（斜插、像呆毛）*/}
    <path d="M24,-270 L70,-350" stroke={LINE} strokeWidth={30} strokeLinecap="round" />
    <path d="M24,-270 L70,-350" stroke="#ff8fb8" strokeWidth={20} strokeLinecap="round" />
    {/* 杯身 */}
    <path d="M-112,-280 L112,-280 L96,-40 Q0,-24 -96,-40 Z" fill="url(#tea)" {...o} />
    <path d="M-120,-292 Q0,-306 120,-292 L118,-272 Q0,-258 -118,-272 Z" fill="#ffffff" {...o} strokeWidth={6} />
    <Pajama d="M-104,-150 L104,-150 L96,-40 Q0,-24 -96,-40 Z" c="#cdeeff" dot="#8fd0f5" />
    {/* 杯底珍珠 */}
    {[[-60, -64], [-24, -56], [12, -60], [48, -66], [-42, -86], [30, -84]].map(([a, b], i) => <circle key={i} cx={a} cy={b} r={12} fill="#3a2418" opacity={0.85} />)}
    <path d="M-80,-250 Q-86,-180 -78,-120" stroke="#fff" strokeWidth={12} fill="none" strokeLinecap="round" opacity={0.6} />
    <Face e={e} y={-212} blush="#ff9a8a" />
  </g>
);

const SHOW: { n: string; e: Expr }[] = [
  { n: "開心", e: { eye: "dot", mouth: "smile" } },
  { n: "黑眼圈・好累", e: { eye: "closed", mouth: "wavy", fx: ["sweat"] } },
  { n: "想通了！", e: { eye: "star", mouth: "open", fx: ["sparkle"] } },
  { n: "驚嚇", e: { eye: "shock", mouth: "o", fx: ["shock"] } },
];
export const HeroineSheet: React.FC = () => (
  <AbsoluteFill style={{ background: "#fffaf6" }}>
    <svg width={1080} height={1920} viewBox="0 0 1080 1920">
      <text x={540} y={80} textAnchor="middle" fontFamily='"PingFang TC", sans-serif' fontWeight={900} fontSize={50} fill={LINE}>女病人候選（都穿 Asatex 睡衣）</text>
      {[
        { n: "① 薯寶・女生版", C: PotatoGirl },
        { n: "② 桃桃（眼罩＋睡帽）", C: Peach },
        { n: "③ 珍奶寶", C: Boba },
      ].map((r, i) => (
        <g key={r.n}>
          <text x={40} y={170 + i * 590} fontFamily='"PingFang TC", sans-serif' fontWeight={900} fontSize={38} fill={LINE}>{r.n}</text>
          <r.C e={{ eye: "dot", mouth: "smile" }} x={170} y={560 + i * 590} s={1.05} />
          {SHOW.map((x, k) => (
            <g key={x.n}>
              <r.C e={x.e} x={430 + (k % 2) * 300} y={390 + Math.floor(k / 2) * 250 + i * 590} s={0.55} />
              <text x={430 + (k % 2) * 300} y={424 + Math.floor(k / 2) * 250 + i * 590} textAnchor="middle" fontFamily='"PingFang TC", sans-serif' fontWeight={700} fontSize={24} fill="#8a6a5e">{x.n}</text>
            </g>
          ))}
        </g>
      ))}
    </svg>
  </AbsoluteFill>
);
