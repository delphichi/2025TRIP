// 風格樣張「手繪遊戲插畫風」（靜態 1080×1920）：粗墨線＋漸層上色＋高光＋米色格子背景＋星芒道具光效。
// 女主角（一身黃）跳起來舉著發光的 Asatex 粉紅睡衣 —— 借 90 年代遊戲官方插畫的「感覺」，角色與道具全原創。
import React from "react";
import { AbsoluteFill } from "remotion";

const INK = "#231815";
const SANS = "Montserrat, Helvetica Neue, Arial, sans-serif";
const ink = { stroke: INK, strokeWidth: 11, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

const Burst: React.FC<{ cx: number; cy: number; r: number }> = ({ cx, cy, r }) => {
  const pts = Array.from({ length: 22 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.72 : r * (i % 4 ? 1.0 : 1.12);
    return `${cx + Math.cos(a) * rr},${cy + Math.sin(a) * rr}`;
  }).join(" ");
  return <polygon points={pts} fill="#ffb21c" />;
};
const Sparkle: React.FC<{ x: number; y: number; s: number }> = ({ x, y, s }) => (
  <path d={`M${x},${y - s} Q${x + s * 0.14},${y - s * 0.14} ${x + s},${y} Q${x + s * 0.14},${y + s * 0.14} ${x},${y + s} Q${x - s * 0.14},${y + s * 0.14} ${x - s},${y} Q${x - s * 0.14},${y - s * 0.14} ${x},${y - s} Z`} fill="#fffbea" />
);

export const PowerUp: React.FC = () => (
  <AbsoluteFill style={{ background: "#f6f1d6" }}>
    <svg width={1080} height={1920} viewBox="0 0 1080 1920">
      <defs>
        <radialGradient id="skin" cx="0.4" cy="0.35" r="0.75"><stop offset="0" stopColor="#ffe3cc" /><stop offset="0.7" stopColor="#f8c49d" /><stop offset="1" stopColor="#e9a27a" /></radialGradient>
        <linearGradient id="coat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe36b" /><stop offset="0.55" stopColor="#f4c02a" /><stop offset="1" stopColor="#d99a12" /></linearGradient>
        <linearGradient id="hair" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stopColor="#7a4a33" /><stop offset="1" stopColor="#3a2117" /></linearGradient>
        <radialGradient id="iris" cx="0.5" cy="0.35" r="0.7"><stop offset="0" stopColor="#c98a4a" /><stop offset="1" stopColor="#5a3218" /></radialGradient>
        <linearGradient id="pj" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffd0e2" /><stop offset="0.6" stopColor="#f59cc0" /><stop offset="1" stopColor="#d86a98" /></linearGradient>
        <linearGradient id="boot" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffdc5a" /><stop offset="1" stopColor="#c98a0c" /></linearGradient>
      </defs>
      {/* 米色格子 */}
      {Array.from({ length: 12 * 22 }, (_, i) => {
        const cx = i % 12, cy = Math.floor(i / 12);
        return (cx + cy) % 2 ? <rect key={i} x={cx * 90} y={cy * 90} width={90} height={90} fill="#efe9c9" /> : null;
      })}
      {/* 道具：發光的粉紅睡衣 */}
      <Burst cx={640} cy={560} r={250} />
      <Sparkle x={470} y={440} s={34} /><Sparkle x={820} y={430} s={44} /><Sparkle x={850} y={700} s={30} /><Sparkle x={455} y={690} s={26} />
      <g transform="translate(640,560) rotate(-8)">
        <path d="M-60,-120 L-130,-80 L-170,10 L-110,40 L-96,0 L-96,130 L96,130 L96,0 L110,40 L170,10 L130,-80 L60,-120 Q0,-80 -60,-120 Z" fill="url(#pj)" {...ink} />
        <path d="M-60,-120 Q0,-60 60,-120" fill="none" {...ink} strokeWidth={8} />
        <path d="M0,-84 L0,128" stroke={INK} strokeWidth={6} />
        {[[-50, -20], [50, 10], [-40, 70], [45, 90], [-120, -10], [120, -10]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={11} fill="#fff" opacity={0.85} />)}
        {[-40, 10, 60].map((y) => <circle key={y} cx={14} cy={y} r={7} fill="#fff" stroke={INK} strokeWidth={3} />)}
        <path d="M-80,-70 Q-70,-100 -40,-104" stroke="#fff" strokeWidth={12} fill="none" strokeLinecap="round" opacity={0.8} />
        <rect x={-58} y={92} width={116} height={30} rx={8} fill="#fff" stroke={INK} strokeWidth={5} />
        <text x={0} y={115} textAnchor="middle" fontFamily={SANS} fontWeight={900} fontSize={22} fill="#c0122f">ASATEX</text>
      </g>

      {/* 女主角：跳起來，右手托著睡衣、左拳往前 */}
      <g transform="translate(560,1250)">
        {/* 後腿（往後踢）*/}
        <path d="M30,170 Q120,230 190,300" fill="none" stroke={INK} strokeWidth={66} strokeLinecap="round" />
        <path d="M30,170 Q120,230 190,300" fill="none" stroke="url(#coat)" strokeWidth={46} strokeLinecap="round" />
        <path d="M168,262 Q250,250 268,310 Q280,360 220,368 Q170,370 162,330 Z" fill="url(#boot)" {...ink} />
        {/* 前腿（往前跨）*/}
        <path d="M-40,170 Q-110,250 -170,270" fill="none" stroke={INK} strokeWidth={66} strokeLinecap="round" />
        <path d="M-40,170 Q-110,250 -170,270" fill="none" stroke="url(#coat)" strokeWidth={46} strokeLinecap="round" />
        <path d="M-150,232 Q-250,214 -278,262 Q-292,310 -230,318 Q-160,322 -146,284 Z" fill="url(#boot)" {...ink} />
        {/* 大衣 */}
        <path d="M-120,-150 Q0,-185 120,-150 Q150,20 175,190 Q0,230 -175,190 Q-150,20 -120,-150 Z" fill="url(#coat)" {...ink} />
        <path d="M118,-120 Q150,40 165,170 L120,180 Q110,40 90,-120 Z" fill="#c98a0c" opacity={0.45} />
        <path d="M-40,-170 L0,-60 L40,-170" fill="none" stroke="#a87808" strokeWidth={9} strokeLinejoin="round" />
        {[-10, 60, 130].map((y) => <circle key={y} cx={10} cy={y} r={14} fill="#a87808" stroke={INK} strokeWidth={4} />)}
        <path d="M-95,-120 Q-110,0 -100,120" stroke="#fff6c0" strokeWidth={14} fill="none" strokeLinecap="round" opacity={0.6} />
        {/* 左拳往前 */}
        <path d="M-110,-110 Q-220,-60 -290,-40" fill="none" stroke={INK} strokeWidth={62} strokeLinecap="round" />
        <path d="M-110,-110 Q-220,-60 -290,-40" fill="none" stroke="url(#coat)" strokeWidth={42} strokeLinecap="round" />
        <path d="M-300,-90 Q-380,-90 -386,-34 Q-388,20 -330,20 Q-280,20 -276,-30 Q-276,-84 -300,-90 Z" fill="url(#skin)" {...ink} />
        <path d="M-370,-50 Q-340,-56 -320,-46 M-372,-20 Q-342,-26 -322,-16" stroke={INK} strokeWidth={6} fill="none" strokeLinecap="round" />
        {/* 頭（往上看道具）*/}
        <g transform="translate(-10,-330) rotate(-10)">
          <path d="M-190,-30 Q-210,-210 0,-226 Q210,-210 190,-30 Q200,90 150,150 Q150,30 120,-40 L-120,-40 Q-150,30 -150,150 Q-200,90 -190,-30 Z" fill="url(#hair)" {...ink} />
          <ellipse cx={0} cy={0} rx={172} ry={160} fill="url(#skin)" {...ink} />
          <circle cx={-178} cy={20} r={30} fill="url(#skin)" {...ink} />
          <path d="M-176,-40 Q-170,-206 0,-208 Q170,-206 176,-40 Q130,-110 60,-96 Q20,-146 -30,-100 Q-100,-132 -176,-40 Z" fill="url(#hair)" {...ink} />
          <path d="M-110,-150 Q-60,-186 10,-178 M40,-172 Q100,-170 130,-130" stroke="#b07a58" strokeWidth={12} fill="none" strokeLinecap="round" opacity={0.7} />
          {/* 眼睛往上看 */}
          {[-1, 1].map((sd) => (
            <g key={sd}>
              <ellipse cx={sd * 62} cy={-6} rx={40} ry={52} fill="#fff" {...ink} strokeWidth={8} />
              <ellipse cx={sd * 62 + 6} cy={-24} rx={27} ry={34} fill="url(#iris)" />
              <ellipse cx={sd * 62 + 6} cy={-24} rx={13} ry={18} fill="#1c0d06" />
              <circle cx={sd * 62 - 4} cy={-40} r={10} fill="#fff" />
              <circle cx={sd * 62 + 16} cy={-10} r={5} fill="#fff" />
              <path d={`M${sd * 92},-40 l${sd * 22},-16 M${sd * 98},-22 l${sd * 26},-6`} stroke={INK} strokeWidth={7} strokeLinecap="round" />
              <path d={`M${sd * 30},-90 Q${sd * 62},-108 ${sd * 96},-86`} stroke="#4a2a1d" strokeWidth={11} fill="none" strokeLinecap="round" />
            </g>
          ))}
          <ellipse cx={-110} cy={60} rx={30} ry={17} fill="#ff8a8a" opacity={0.5} />
          <ellipse cx={110} cy={60} rx={30} ry={17} fill="#ff8a8a" opacity={0.5} />
          <path d="M-8,46 Q4,56 14,46" stroke="#c7805c" strokeWidth={6} fill="none" strokeLinecap="round" />
          {/* 開心張嘴 */}
          <path d="M-62,80 Q0,90 62,80 Q54,150 0,154 Q-54,150 -62,80 Z" fill="#7a1f2a" {...ink} strokeWidth={8} />
          <path d="M-56,84 Q0,92 56,84 L52,100 Q0,108 -52,100 Z" fill="#fff" />
          <ellipse cx={0} cy={136} rx={26} ry={13} fill="#f27c8b" />
          <circle cx={-200} cy={60} r={13} fill="#ffd84d" stroke={INK} strokeWidth={4} />
        </g>
        {/* 右手從頭旁邊往上托著睡衣（畫在頭後面＝前景，才不會被頭髮蓋住）*/}
        <path d="M110,-120 Q310,-330 225,-500" fill="none" stroke={INK} strokeWidth={62} strokeLinecap="round" />
        <path d="M110,-120 Q310,-330 225,-500" fill="none" stroke="url(#coat)" strokeWidth={42} strokeLinecap="round" />
        <path d="M168,-528 Q186,-590 248,-582 Q304,-574 298,-524 Q292,-488 236,-492 Q184,-494 168,-528 Z" fill="url(#skin)" {...ink} />
      </g>
      <text x={540} y={1860} textAnchor="middle" fontFamily={SANS} fontWeight={800} fontSize={30} fill="#9a8f6a">樣張：手繪遊戲插畫風（原創角色＋Asatex 睡衣道具）</text>
    </svg>
  </AbsoluteFill>
);
