// 細長版角色（參考番茄女孩／黃瓜男生：物品＝頭＋真正的身體、手腳、衣服；站起來佔 9:16 畫面大半）：
// 糰糰醫生（飯糰頭＋圓眼鏡，白袍、聽診器、白手套、深色長褲皮鞋）、薯寶（馬鈴薯頭＋芽＋雀斑，Asatex 點點睡衣洋裝、粉紅拖鞋）。
// 腳底在 (0,0)，全高約 1150。pose：手臂角度、歪頭、對嘴、彈跳、昏倒（faint 0–1 往後倒）。
import React from "react";
import { Expr, EyeG, FxG, LINE, MouthG } from "./Mascots";

const o = { stroke: LINE, strokeWidth: 7, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
export type Pose = { armL?: number; armR?: number; tilt?: number; bob?: number; faint?: number; lean?: number };

// 一隻手臂：肩膀 (sx,sy)，往下長 len，angle 0＝自然下垂、正＝往外舉；手肘略彎
const Arm: React.FC<{ sx: number; sy: number; side: number; angle: number; len: number; sleeve: string; hand: string; sleeveLen: number }> = ({ sx, sy, side, angle, len, sleeve, hand, sleeveLen }) => {
  const a = ((angle * side) * Math.PI) / 180;
  const ex = sx + Math.sin(a) * len * 0.5 + side * 10, ey = sy + Math.cos(a) * len * 0.5;
  const a2 = a + side * 0.25;
  const hx = ex + Math.sin(a2) * len * 0.5, hy = ey + Math.cos(a2) * len * 0.5;
  const d = `M${sx},${sy} Q${ex},${ey} ${hx},${hy}`;
  const k = sleeveLen; // 袖子蓋住手臂的比例
  const mx = sx + (hx - sx) * k, my = sy + (hy - sy) * k;
  return (
    <g>
      <path d={d} stroke={LINE} strokeWidth={42} fill="none" strokeLinecap="round" />
      <path d={d} stroke={hand} strokeWidth={28} fill="none" strokeLinecap="round" />
      <path d={`M${sx},${sy} Q${sx + (ex - sx) * k},${sy + (ey - sy) * k} ${mx},${my}`} stroke={LINE} strokeWidth={62} fill="none" strokeLinecap="round" />
      <path d={`M${sx},${sy} Q${sx + (ex - sx) * k},${sy + (ey - sy) * k} ${mx},${my}`} stroke={sleeve} strokeWidth={48} fill="none" strokeLinecap="round" />
      <circle cx={hx} cy={hy} r={26} fill={hand} {...o} />
    </g>
  );
};
const Legs: React.FC<{ color: string; shoe: string; gap?: number; top?: number }> = ({ color, shoe, gap = 50, top = -430 }) => (
  <g>
    {[-1, 1].map((sd) => (
      <g key={sd}>
        <path d={`M${sd * gap},${top} L${sd * (gap + 4)},-40`} stroke={LINE} strokeWidth={60} strokeLinecap="round" />
        <path d={`M${sd * gap},${top} L${sd * (gap + 4)},-40`} stroke={color} strokeWidth={46} strokeLinecap="round" />
        <ellipse cx={sd * (gap + 4) + sd * 14} cy={-24} rx={50} ry={26} fill={shoe} {...o} />
        <ellipse cx={sd * (gap + 4) + sd * 2} cy={-34} rx={22} ry={9} fill="#fff" opacity={0.35} />
      </g>
    ))}
  </g>
);
const Face: React.FC<{ e: Expr; r: number; dx: number; mouthY: number; glasses?: boolean }> = ({ e, r, dx, mouthY, glasses }) => (
  <g>
    <ellipse cx={-dx - 40} cy={30} rx={26} ry={14} fill="#ff9aa2" opacity={0.6} />
    <ellipse cx={dx + 40} cy={30} rx={26} ry={14} fill="#ff9aa2" opacity={0.6} />
    <EyeG x={-dx} t={e.eye} r={r} /><EyeG x={dx} t={e.eye} r={r} />
    {glasses && <>{[-dx, dx].map((gx) => <circle key={gx} cx={gx} cy={0} r={r + 20} fill="none" stroke={LINE} strokeWidth={6} />)}<path d={`M${-dx + r + 20},-2 Q0,-10 ${dx - r - 20},-2`} stroke={LINE} strokeWidth={6} fill="none" /></>}
    {e.eye === "angry" && <path d={`M${-dx - 26},-44 L${-dx + 16},-28 M${dx + 26},-44 L${dx - 16},-28`} {...o} strokeWidth={8} />}
    {(e.eye === "sad" || e.eye === "tears" || e.fx?.includes("sweat")) && <path d={`M${-dx - 24},-36 L${-dx + 14},-46 M${dx + 24},-36 L${dx - 14},-46`} {...o} strokeWidth={6} />}
    <g transform="scale(1.35)"><MouthG t={e.mouth} open={e.open} y={mouthY / 1.35} /></g>
    <FxG fx={e.fx ?? []} top={-190} side={150} />
  </g>
);

// ── 糰糰醫生（高版）──
export const DangoTall: React.FC<{ e: Expr; p?: Pose; x?: number; y?: number; s?: number }> = ({ e, p = {}, x = 0, y = 0, s = 1 }) => {
  const flush = e.fx?.includes("flush") || e.eye === "angry";
  return (
    <g transform={`translate(${x},${y + (p.bob ?? 0)}) scale(${s}) rotate(${-(p.faint ?? 0) * 82 + (p.lean ?? 0)},0,0)`}>
      <defs>
        <radialGradient id="riceT" cx="0.4" cy="0.3" r="0.8"><stop offset="0" stopColor="#fffdfb" /><stop offset="0.75" stopColor="#fbefe9" /><stop offset="1" stopColor="#efd9cf" /></radialGradient>
        <radialGradient id="flushT" cx="0.5" cy="0.45" r="0.55"><stop offset="0" stopColor="#ff6a6a" stopOpacity="0.5" /><stop offset="1" stopColor="#ff6a6a" stopOpacity="0" /></radialGradient>
      </defs>
      <Legs color="#2f3442" shoe="#3a2c26" gap={44} top={-450} />
      {/* 白袍（長到膝蓋上方，前面敞開露出淺藍上衣）*/}
      <path d="M-150,-830 Q-170,-640 -180,-360 Q-120,-340 -40,-350 L-30,-760 Z" fill="#ffffff" {...o} />
      <path d="M150,-830 Q170,-640 180,-360 Q120,-340 40,-350 L30,-760 Z" fill="#ffffff" {...o} />
      <path d="M-40,-800 L40,-800 L44,-440 L-44,-440 Z" fill="#cfe4f7" {...o} />
      <path d="M-30,-800 L0,-740 L30,-800" fill="none" {...o} strokeWidth={6} />
      {[-560, -620].map((yy) => <path key={yy} d={`M-150,${yy + 20} L-90,${yy + 20}`} stroke="#c9ced6" strokeWidth={5} strokeLinecap="round" />)}
      <rect x={-142} y={-560} width={56} height={44} rx={6} fill="none" stroke={LINE} strokeWidth={5} />
      <path d="M-120,-560 L-118,-600 M-104,-560 L-106,-596" stroke="#3a6fd8" strokeWidth={5} />
      {/* 聽診器 */}
      <path d="M-74,-820 Q-80,-700 -40,-660 M74,-820 Q80,-700 40,-660" stroke="#2c3f6b" strokeWidth={9} fill="none" strokeLinecap="round" />
      <circle cx={-40} cy={-650} r={18} fill="#d7dbe1" stroke="#5b6270" strokeWidth={5} />
      <circle cx={40} cy={-650} r={18} fill="#d7dbe1" stroke="#5b6270" strokeWidth={5} />
      {/* 手臂（白袖＋白手套）*/}
      <Arm sx={-142} sy={-800} side={-1} angle={p.armL ?? 8} len={380} sleeve="#ffffff" hand="#ffffff" sleeveLen={0.82} />
      <Arm sx={142} sy={-800} side={1} angle={p.armR ?? 8} len={380} sleeve="#ffffff" hand="#ffffff" sleeveLen={0.82} />
      {/* 飯糰頭 */}
      <g transform={`translate(0,-1000) rotate(${p.tilt ?? 0},0,170)`}>
        <path d="M0,-170 C70,-170 200,40 186,120 C178,170 120,182 0,182 C-120,182 -178,170 -186,120 C-200,40 -70,-170 0,-170 Z" fill="url(#riceT)" {...o} />
        {flush && <path d="M0,-170 C70,-170 200,40 186,120 C178,170 120,182 0,182 C-120,182 -178,170 -186,120 C-200,40 -70,-170 0,-170 Z" fill="url(#flushT)" />}
        {[[-50, -100], [60, -80], [-110, 40], [120, 60], [-20, -40]].map(([gx, gy], i) => <path key={i} d={`M${gx},${gy} q8,-5 14,1`} stroke="#e8d3c8" strokeWidth={4} fill="none" />)}
        <rect x={-70} y={120} width={140} height={62} rx={8} fill="#2f4836" {...o} />
        <g transform="translate(0,40)"><Face e={e} r={14} dx={52} mouthY={56} glasses /></g>
      </g>
    </g>
  );
};

// ── 薯寶（高版）──
export const PotatoTall: React.FC<{ e: Expr; p?: Pose; x?: number; y?: number; s?: number }> = ({ e, p = {}, x = 0, y = 0, s = 1 }) => {
  const flush = e.fx?.includes("flush") || e.eye === "angry";
  return (
    <g transform={`translate(${x},${y + (p.bob ?? 0)}) scale(${s}) rotate(${-(p.faint ?? 0) * 82 + (p.lean ?? 0)},0,0)`}>
      <defs>
        <radialGradient id="potT" cx="0.38" cy="0.3" r="0.8"><stop offset="0" stopColor="#ffe48a" /><stop offset="0.7" stopColor="#f6c84a" /><stop offset="1" stopColor="#e3a92e" /></radialGradient>
        <radialGradient id="flushP2" cx="0.5" cy="0.45" r="0.55"><stop offset="0" stopColor="#ff5a4a" stopOpacity="0.5" /><stop offset="1" stopColor="#ff5a4a" stopOpacity="0" /></radialGradient>
        <clipPath id="dressClip"><path d="M-80,-800 Q-140,-560 -200,-380 Q0,-340 200,-380 Q140,-560 80,-800 Q0,-820 -80,-800 Z" /></clipPath>
      </defs>
      <Legs color="#f6c84a" shoe="#ff8fb4" gap={40} top={-420} />
      {/* Asatex 點點睡衣洋裝 */}
      <path d="M-80,-800 Q-140,-560 -200,-380 Q0,-340 200,-380 Q140,-560 80,-800 Q0,-820 -80,-800 Z" fill="#ffd0e0" {...o} />
      <g clipPath="url(#dressClip)">{Array.from({ length: 48 }, (_, i) => <circle key={i} cx={-200 + (i % 8) * 54 + (Math.floor(i / 8) % 2) * 27} cy={-790 + Math.floor(i / 8) * 76} r={9} fill="#ff9cbf" />)}</g>
      <path d="M-56,-804 Q-28,-760 0,-790 Q28,-760 56,-804" fill="#fff" {...o} strokeWidth={6} />
      <path d="M-196,-392 Q-150,-370 -100,-386 Q-50,-366 0,-382 Q50,-366 100,-386 Q150,-370 196,-392" stroke="#fff" strokeWidth={10} fill="none" />
      <rect x={30} y={-740} width={56} height={22} rx={5} fill="#fff" stroke={LINE} strokeWidth={4} />
      <text x={58} y={-724} textAnchor="middle" fontFamily="Montserrat, Arial" fontWeight={900} fontSize={13} fill="#c0122f">ASATEX</text>
      <Arm sx={-84} sy={-776} side={-1} angle={p.armL ?? 10} len={340} sleeve="#ffd0e0" hand="#f6c84a" sleeveLen={0.3} />
      <Arm sx={84} sy={-776} side={1} angle={p.armR ?? 10} len={340} sleeve="#ffd0e0" hand="#f6c84a" sleeveLen={0.3} />
      {/* 馬鈴薯頭 */}
      <g transform={`translate(0,-1000) rotate(${p.tilt ?? 0},0,190)`}>
        <path d="M0,-200 C110,-200 180,-110 178,0 C176,110 110,192 0,192 C-110,192 -176,110 -178,0 C-180,-110 -110,-200 0,-200 Z" fill="url(#potT)" {...o} />
        {flush && <path d="M0,-200 C110,-200 180,-110 178,0 C176,110 110,192 0,192 C-110,192 -176,110 -178,0 C-180,-110 -110,-200 0,-200 Z" fill="url(#flushP2)" />}
        {[[-90, -110], [-66, -136], [96, -120], [116, -90], [-120, -60], [80, 120]].map(([fx, fy], i) => <circle key={i} cx={fx} cy={fy} r={6} fill="#c98f2c" opacity={0.8} />)}
        <path d="M0,-200 Q-3,-226 3,-240" stroke="#5e9e36" strokeWidth={9} fill="none" strokeLinecap="round" />
        <path d="M3,-236 C-40,-280 -88,-254 -72,-226 C-56,-206 -18,-212 3,-236 Z" fill="#8ccf5a" {...o} />
        <path d="M3,-236 C44,-282 96,-260 80,-228 C62,-206 22,-212 3,-236 Z" fill="#8ccf5a" {...o} />
        <g transform="translate(0,10)"><Face e={e} r={20} dx={56} mouthY={62} /></g>
      </g>
    </g>
  );
};
