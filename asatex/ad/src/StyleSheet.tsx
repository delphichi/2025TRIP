// 角色風格比較圖（靜態，1080×1920）：同一對 Asatex 情侶（她一身黃、他藍 T 恤）用三種畫法各畫一次＋她的三個表情。
// A Q 版可愛　B 1930 橡皮管老卡通　C 積木玩具。全部原創造型（只取風格，不用米老鼠／樂高等既有角色）。
import React from "react";
import { AbsoluteFill } from "remotion";

const SANS = "Montserrat, Helvetica Neue, Arial, sans-serif";
type Expr = "smile" | "angry" | "laugh";
const K = "#1b1b1f";

// ───────── A：Q 版可愛（大頭、頭髮、腮紅、亮晶晶大眼）─────────
const SKIN = "#f7cba6";
const faceA = (girl: boolean, e: Expr) => (
  <g>
    {/* 眉毛 */}
    {e === "angry" ? <>
      <path d="M-62,-344 L-18,-326" stroke={K} strokeWidth={9} strokeLinecap="round" />
      <path d="M62,-344 L18,-326" stroke={K} strokeWidth={9} strokeLinecap="round" />
    </> : <>
      <path d="M-58,-338 Q-40,-350 -22,-340" stroke="#5a3624" strokeWidth={6} fill="none" strokeLinecap="round" />
      <path d="M58,-338 Q40,-350 22,-340" stroke="#5a3624" strokeWidth={6} fill="none" strokeLinecap="round" />
    </>}
    {/* 眼睛 */}
    {e === "laugh" ? <>
      <path d="M-56,-296 Q-38,-318 -20,-296" stroke={K} strokeWidth={8} fill="none" strokeLinecap="round" />
      <path d="M56,-296 Q38,-318 20,-296" stroke={K} strokeWidth={8} fill="none" strokeLinecap="round" />
    </> : [-1, 1].map((sd) => (
      <g key={sd}>
        <ellipse cx={sd * 38} cy={-298} rx={17} ry={e === "angry" ? 17 : 23} fill={K} />
        <circle cx={sd * 38 - 5} cy={-306} r={6.5} fill="#fff" />
        <circle cx={sd * 38 + 5} cy={-292} r={3} fill="#fff" />
        {girl && <path d={`M${sd * 50},-316 l${sd * 10},-8 M${sd * 54},-308 l${sd * 12},-4`} stroke={K} strokeWidth={4} strokeLinecap="round" />}
      </g>
    ))}
    <ellipse cx={-64} cy={-262} rx={17} ry={10} fill="#f59a9a" opacity={0.6} />
    <ellipse cx={64} cy={-262} rx={17} ry={10} fill="#f59a9a" opacity={0.6} />
    <ellipse cx={0} cy={-272} rx={5} ry={4} fill="#e4a07c" />
    {/* 嘴 */}
    {e === "smile" && <path d="M-20,-250 Q0,-232 20,-250" stroke={girl ? "#c2414e" : K} strokeWidth={6} fill="none" strokeLinecap="round" />}
    {e === "angry" && <>
      <rect x={-26} y={-256} width={52} height={22} rx={8} fill="#fff" stroke={K} strokeWidth={5} />
      <line x1={-26} y1={-245} x2={26} y2={-245} stroke={K} strokeWidth={3} />
      <path d="M72,-372 l14,14 M86,-372 l-14,14 M66,-365 l26,0 M79,-378 l0,26" stroke="#e23a3a" strokeWidth={6} strokeLinecap="round" />
    </>}
    {e === "laugh" && <path d="M-30,-258 Q0,-258 30,-258 Q26,-216 0,-214 Q-26,-216 -30,-258 Z" fill="#7a1f2a" stroke={K} strokeWidth={5} />}
    {e === "laugh" && <ellipse cx={0} cy={-224} rx={13} ry={7} fill="#f27c8b" />}
  </g>
);
const headA = (girl: boolean, e: Expr) => (
  <g>
    {girl && <path d="M-118,-300 Q-130,-420 0,-424 Q130,-420 118,-300 L126,-190 Q90,-170 70,-210 L-70,-210 Q-90,-170 -126,-190 Z" fill="#4a2a1d" stroke={K} strokeWidth={6} />}
    <circle cx={-104} cy={-292} r={20} fill={SKIN} stroke={K} strokeWidth={5} />
    <circle cx={104} cy={-292} r={20} fill={SKIN} stroke={K} strokeWidth={5} />
    <ellipse cx={0} cy={-300} rx={106} ry={100} fill={SKIN} stroke={K} strokeWidth={6} />
    {girl
      ? <path d="M-108,-312 Q-104,-404 0,-406 Q104,-404 108,-312 Q80,-352 40,-344 Q10,-370 -20,-344 Q-60,-362 -108,-312 Z" fill="#4a2a1d" stroke={K} strokeWidth={6} />
      : <path d="M-106,-318 Q-100,-410 0,-410 Q100,-410 106,-318 Q70,-356 20,-350 Q-30,-372 -106,-318 Z M-10,-408 Q0,-440 24,-436 Q8,-424 12,-406" fill="#6b3f22" stroke={K} strokeWidth={6} />}
    {faceA(girl, e)}
  </g>
);
const bodyA = (girl: boolean) => (
  <g>
    {[-1, 1].map((sd) => <g key={sd}>
      <path d={`M${sd * 24},-80 L${sd * 26},-18`} stroke={K} strokeWidth={30} strokeLinecap="round" />
      <path d={`M${sd * 24},-80 L${sd * 26},-18`} stroke={girl ? "#f2c230" : SKIN} strokeWidth={22} strokeLinecap="round" />
      <ellipse cx={sd * 32} cy={-6} rx={30} ry={16} fill={girl ? "#f2c230" : "#e2463c"} stroke={K} strokeWidth={5} />
      <path d={`M${sd * 58},-180 Q${sd * 82},-140 ${sd * 78},-100`} stroke={K} strokeWidth={28} strokeLinecap="round" fill="none" />
      <path d={`M${sd * 58},-180 Q${sd * 82},-140 ${sd * 78},-100`} stroke={girl ? "#f2c230" : "#3a74d0"} strokeWidth={20} strokeLinecap="round" fill="none" />
      <circle cx={sd * 79} cy={-92} r={15} fill={SKIN} stroke={K} strokeWidth={5} />
    </g>)}
    {girl
      ? <path d="M-58,-200 Q0,-212 58,-200 L76,-74 Q0,-62 -76,-74 Z" fill="#f2c230" stroke={K} strokeWidth={6} />
      : <><path d="M-60,-200 Q0,-210 60,-200 L60,-104 L-60,-104 Z" fill="#3a74d0" stroke={K} strokeWidth={6} />
        <path d="M-60,-108 L60,-108 L58,-70 L4,-70 L0,-86 L-4,-70 L-58,-70 Z" fill="#253a6b" stroke={K} strokeWidth={6} /></>}
    {girl && <><rect x={50} y={-140} width={46} height={36} rx={9} fill="#f6cf45" stroke={K} strokeWidth={5} />
      <path d="M-40,-196 Q30,-150 60,-138" stroke="#9b7608" strokeWidth={5} fill="none" /></>}
  </g>
);

// ───────── B：1930 橡皮管老卡通（派形眼、麵條手腳、白手套）─────────
const CREAM = "#f6ecd6";
const pieEye = (x: number, y: number, h: number) => (
  <g>
    <ellipse cx={x} cy={y} rx={13} ry={h} fill={K} />
    <path d={`M${x + 2},${y - h * 0.55} L${x + 11},${y - h * 0.15} L${x + 11},${y - h * 0.7} Z`} fill={CREAM} />
  </g>
);
const faceB = (girl: boolean, e: Expr) => (
  <g>
    {e === "laugh" ? <>
      <path d="M-48,-300 Q-30,-322 -12,-300" stroke={K} strokeWidth={8} fill="none" strokeLinecap="round" />
      <path d="M48,-300 Q30,-322 12,-300" stroke={K} strokeWidth={8} fill="none" strokeLinecap="round" />
    </> : <>{pieEye(-30, -304, e === "angry" ? 18 : 26)}{pieEye(30, -304, e === "angry" ? 18 : 26)}</>}
    {e === "angry" && <path d="M-52,-338 L-10,-322 M52,-338 L10,-322" stroke={K} strokeWidth={8} strokeLinecap="round" />}
    {girl && e !== "laugh" && <path d="M-40,-332 l-10,-12 M-30,-334 l-4,-14 M40,-332 l10,-12 M30,-334 l4,-14" stroke={K} strokeWidth={4} strokeLinecap="round" />}
    {!girl && <ellipse cx={0} cy={-268} rx={20} ry={14} fill={K} />}
    {e === "smile" && <path d="M-50,-256 Q0,-206 50,-256" stroke={K} strokeWidth={7} fill={girl ? "#c43a3a" : "none"} />}
    {e === "angry" && <>
      <path d="M-34,-232 Q0,-252 34,-232" stroke={K} strokeWidth={7} fill="none" />
      {[-1, 1].map((sd) => <path key={sd} d={`M${sd * 80},-390 q${sd * 10},-20 0,-34 q${sd * -12},-14 4,-30`} stroke="#9a9a9a" strokeWidth={10} fill="none" strokeLinecap="round" />)}
    </>}
    {e === "laugh" && <path d="M-54,-262 Q0,-262 54,-262 Q44,-196 0,-192 Q-44,-196 -54,-262 Z" fill="#7a1f2a" stroke={K} strokeWidth={6} />}
  </g>
);
const headB = (girl: boolean, e: Expr) => (
  <g>
    <circle cx={0} cy={-300} r={98} fill={CREAM} stroke={K} strokeWidth={7} />
    {girl
      ? <path d="M-100,-290 Q-110,-410 0,-404 Q110,-410 100,-290 Q96,-240 78,-232 Q86,-300 40,-350 Q0,-320 -40,-350 Q-86,-300 -78,-232 Q-96,-240 -100,-290 Z" fill={K} />
      : <path d="M-96,-320 Q-80,-404 0,-402 Q80,-404 96,-320 Q40,-362 0,-344 Q-40,-362 -96,-320 Z" fill={K} />}
    {girl && <path d="M60,-392 q20,-28 40,-6 q-24,6 -40,6 Z" fill="#c43a3a" stroke={K} strokeWidth={4} />}
    {faceB(girl, e)}
  </g>
);
const glove = (x: number, y: number, sd: number) => (
  <g transform={`translate(${x},${y})`}>
    <path d={`M${-sd * 6},-22 Q${sd * 30},-34 ${sd * 32},0 Q${sd * 30},26 0,24 Q${-sd * 22},16 ${-sd * 14},-6 Z`} fill="#fff" stroke={K} strokeWidth={5} />
    <path d={`M${sd * 4},-10 l0,12 M${sd * 12},-12 l0,12`} stroke={K} strokeWidth={3} />
  </g>
);
const bodyB = (girl: boolean) => (
  <g>
    {/* 麵條腿 */}
    <path d="M-20,-90 Q-46,-50 -30,-14" stroke={K} strokeWidth={12} fill="none" strokeLinecap="round" />
    <path d="M20,-90 Q46,-50 30,-14" stroke={K} strokeWidth={12} fill="none" strokeLinecap="round" />
    <ellipse cx={-46} cy={-6} rx={40} ry={18} fill={girl ? "#e0a92a" : "#6b4226"} stroke={K} strokeWidth={6} />
    <ellipse cx={46} cy={-6} rx={40} ry={18} fill={girl ? "#e0a92a" : "#6b4226"} stroke={K} strokeWidth={6} />
    {girl
      ? <path d="M-46,-206 Q0,-214 46,-206 Q70,-140 92,-84 Q0,-62 -92,-84 Q-70,-140 -46,-206 Z" fill="#e8b93a" stroke={K} strokeWidth={6} />
      : <><path d="M-48,-206 Q0,-214 48,-206 L52,-118 L-52,-118 Z" fill="#4a6fa5" stroke={K} strokeWidth={6} />
        {/* 咖啡色短褲＋吊帶（刻意不用紅短褲白鈕扣，避免像米老鼠）*/}
        <path d="M-54,-120 L54,-120 L50,-82 L-50,-82 Z" fill="#7a5230" stroke={K} strokeWidth={6} />
        {[-1, 1].map((sd) => <path key={sd} d={`M${sd * 30},-206 L${sd * 24},-120`} stroke="#7a5230" strokeWidth={9} />)}</>}
    {/* 麵條手臂（一手插腰一手揮）*/}
    <path d="M-44,-190 Q-110,-160 -96,-104" stroke={K} strokeWidth={12} fill="none" strokeLinecap="round" />
    <path d="M44,-190 Q110,-210 112,-268" stroke={K} strokeWidth={12} fill="none" strokeLinecap="round" />
    {glove(-96, -96, -1)}
    {glove(114, -280, 1)}
  </g>
);

// ───────── C：積木玩具（方頭、塑膠光澤、方塊手腳）─────────
const TOY = "#f3c99a";
const faceC = (girl: boolean, e: Expr) => (
  <g>
    {e === "laugh" ? <>
      <path d="M-46,-298 Q-32,-314 -18,-298 M46,-298 Q32,-314 18,-298" stroke={K} strokeWidth={7} fill="none" strokeLinecap="round" />
    </> : <>
      <circle cx={-32} cy={-300} r={e === "angry" ? 9 : 11} fill={K} /><circle cx={32} cy={-300} r={e === "angry" ? 9 : 11} fill={K} />
      <circle cx={-35} cy={-304} r={3.5} fill="#fff" /><circle cx={29} cy={-304} r={3.5} fill="#fff" />
    </>}
    {e === "angry" && <path d="M-50,-330 L-16,-318 M50,-330 L16,-318" stroke={K} strokeWidth={7} strokeLinecap="round" />}
    {girl && e !== "laugh" && <path d="M-44,-310 l-8,-6 M44,-310 l8,-6" stroke={K} strokeWidth={4} strokeLinecap="round" />}
    {e === "smile" && <path d="M-24,-262 Q0,-246 24,-262" stroke={girl ? "#c2414e" : K} strokeWidth={6} fill="none" strokeLinecap="round" />}
    {e === "angry" && <path d="M-22,-252 Q0,-266 22,-252" stroke={K} strokeWidth={6} fill="none" strokeLinecap="round" />}
    {e === "laugh" && <path d="M-30,-268 L30,-268 Q26,-236 0,-234 Q-26,-236 -30,-268 Z" fill="#7a1f2a" stroke={K} strokeWidth={5} />}
    <ellipse cx={-56} cy={-270} rx={12} ry={7} fill="#f59a9a" opacity={0.55} /><ellipse cx={56} cy={-270} rx={12} ry={7} fill="#f59a9a" opacity={0.55} />
  </g>
);
const headC = (girl: boolean, e: Expr) => (
  <g>
    <rect x={-22} y={-230} width={44} height={26} fill={TOY} stroke={K} strokeWidth={5} />
    {girl && <path d="M-96,-370 Q-96,-392 -60,-392 L60,-392 Q96,-392 96,-370 L100,-200 L66,-200 L66,-330 L-66,-330 L-66,-200 L-100,-200 Z" fill="#4a2a1d" stroke={K} strokeWidth={6} />}
    <rect x={-86} y={-370} width={172} height={146} rx={34} fill={TOY} stroke={K} strokeWidth={6} />
    <rect x={-70} y={-362} width={30} height={60} rx={14} fill="#fff" opacity={0.35} />
    {girl
      ? <path d="M-92,-322 Q-92,-394 0,-396 Q92,-394 92,-322 L60,-336 L0,-330 L-60,-336 Z" fill="#4a2a1d" stroke={K} strokeWidth={6} />
      : <path d="M-90,-326 Q-90,-394 0,-396 Q90,-394 90,-326 Q40,-350 -10,-340 Q-50,-352 -90,-326 Z" fill="#6b3f22" stroke={K} strokeWidth={6} />}
    {faceC(girl, e)}
  </g>
);
const bodyC = (girl: boolean) => {
  const top = girl ? "#f2c230" : "#3a74d0", low = girl ? "#e6b21e" : "#253a6b";
  return (
    <g>
      <rect x={-56} y={-84} width={52} height={70} rx={6} fill={low} stroke={K} strokeWidth={6} />
      <rect x={4} y={-84} width={52} height={70} rx={6} fill={low} stroke={K} strokeWidth={6} />
      <rect x={-62} y={-18} width={62} height={20} rx={6} fill={girl ? "#e6b21e" : "#e2463c"} stroke={K} strokeWidth={5} />
      <rect x={0} y={-18} width={62} height={20} rx={6} fill={girl ? "#e6b21e" : "#e2463c"} stroke={K} strokeWidth={5} />
      <rect x={-60} y={-104} width={120} height={26} rx={6} fill={low} stroke={K} strokeWidth={6} />
      <path d="M-50,-208 L50,-208 L64,-104 L-64,-104 Z" fill={top} stroke={K} strokeWidth={6} strokeLinejoin="round" />
      <rect x={-40} y={-200} width={16} height={86} rx={8} fill="#fff" opacity={0.3} />
      {[-1, 1].map((sd) => (
        <g key={sd} transform={`rotate(${sd * -14},${sd * 56},-198)`}>
          <rect x={sd > 0 ? 44 : -72} y={-204} width={28} height={88} rx={12} fill={top} stroke={K} strokeWidth={6} />
          <rect x={sd > 0 ? 42 : -74} y={-120} width={32} height={30} rx={10} fill={TOY} stroke={K} strokeWidth={6} />
        </g>
      ))}
      {girl && <rect x={58} y={-150} width={44} height={34} rx={6} fill="#f6cf45" stroke={K} strokeWidth={5} />}
    </g>
  );
};

const Person: React.FC<{ s: "A" | "B" | "C"; girl: boolean; x: number; y: number; sc?: number; e?: Expr }> = ({ s, girl, x, y, sc = 1, e = "smile" }) => (
  <g transform={`translate(${x},${y}) scale(${sc})`}>
    {s === "A" && <>{bodyA(girl)}{headA(girl, e)}</>}
    {s === "B" && <>{bodyB(girl)}{headB(girl, e)}</>}
    {s === "C" && <>{bodyC(girl)}{headC(girl, e)}</>}
  </g>
);
const Head: React.FC<{ s: "A" | "B" | "C"; x: number; y: number; e: Expr }> = ({ s, x, y, e }) => (
  <g transform={`translate(${x},${y}) scale(0.62) translate(0,300)`}>
    {s === "A" && headA(true, e)}{s === "B" && headB(true, e)}{s === "C" && headC(true, e)}
  </g>
);

const ROWS: { s: "A" | "B" | "C"; title: string; sub: string; bg: string }[] = [
  { s: "A", title: "A　Q 版可愛", sub: "大頭、頭髮、腮紅、亮晶晶大眼 —— 最親切，表情最豐富", bg: "#fdf3e7" },
  { s: "B", title: "B　1930 橡皮管老卡通", sub: "派形眼、麵條手腳、白手套 —— 復古、少見、辨識度高", bg: "#efe2c4" },
  { s: "C", title: "C　積木玩具", sub: "方頭、塑膠光澤、方塊手腳 —— 可愛、像玩具廣告", bg: "#e7f0fa" },
];

export const StyleSheet: React.FC = () => (
  <AbsoluteFill style={{ background: "#faf8f4" }}>
    <svg width={1080} height={1920} viewBox="0 0 1080 1920">
      <text x={540} y={86} textAnchor="middle" fontFamily={SANS} fontWeight={900} fontSize={52} fill={K}>Asatex 角色風格比較</text>
      <text x={540} y={130} textAnchor="middle" fontFamily={SANS} fontWeight={500} fontSize={26} fill="#666">同一對情侶 × 三種畫法　｜　右側：她的 微笑 / 生氣 / 大笑</text>
      {ROWS.map((r, i) => {
        const y0 = 160 + i * 586;
        return (
          <g key={r.s}>
            <rect x={24} y={y0} width={1032} height={566} rx={28} fill={r.bg} stroke={r.s === "B" ? "#3a2e1e" : "#ddd"} strokeWidth={r.s === "B" ? 6 : 3} />
            <text x={50} y={y0 + 52} fontFamily={SANS} fontWeight={900} fontSize={38} fill={K}>{r.title}</text>
            <text x={50} y={y0 + 90} fontFamily={SANS} fontWeight={500} fontSize={22} fill="#555">{r.sub}</text>
            <Person s={r.s} girl x={175} y={y0 + 540} sc={0.98} />
            <Person s={r.s} girl={false} x={425} y={y0 + 540} sc={0.98} />
            <line x1={600} y1={y0 + 120} x2={600} y2={y0 + 540} stroke="#ccc" strokeWidth={3} strokeDasharray="8 8" />
            {(["smile", "angry", "laugh"] as Expr[]).map((e, k) => (
              <g key={e}>
                <Head s={r.s} x={700 + (k % 2) * 220} y={y0 + 150 + Math.floor(k / 2) * 200} e={e} />
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  </AbsoluteFill>
);
