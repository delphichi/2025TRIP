// 火柴人版《Rosado》（9:16 測試）：全部用 SVG 畫，角色有骨架 —— 嘴巴照配音音量開合（src/stickEnv.ts）、眨眼、眼珠、眉毛、
// 頭轉向／歪頭、手臂（肩＋肘）、腿（髖＋膝）都能動；每個姿勢欄位都是數字，關鍵格之間自動補間。配音沿用 EP4 Rosado。
import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { loadFont } from "@remotion/fonts";
import { clamp, ease } from "./Nochebuena";
import { ENV } from "./stickEnv";
import { IG_HANDLE, Instagram } from "./Guantes";

loadFont({ family: "Montserrat", url: staticFile("showroom/Montserrat.ttf"), weight: "100 900" });
loadFont({ family: "Plex Mono", url: staticFile("showroom/PlexMono-Medium.ttf"), weight: "500" });
const SANS = "Montserrat, Helvetica Neue, Arial, sans-serif";
const MONO = '"Plex Mono", ui-monospace, monospace';

export const S_FPS = 30;
const W = 1080, H = 1920, GROUND = 1660;
const sec = (s: number) => Math.round(s * S_FPS);

// ── 劇本：誰講、哪句、鏡頭（場景座標，s＝放大倍數；s2/x2/y2＝這一鏡結束時的位置） ──
type Cam = { s: number; x: number; y: number; s2?: number; x2?: number; y2?: number };
const HIM: Cam = { s: 1.6, x: 830, y: 1150 };
const LINES: { who: "ella" | "el"; f: string; es: string; cam: Cam; pre?: number }[] = [
  { who: "ella", f: "g1", es: "Mi amor…", cam: { s: 3.0, x: 170, y: 900, s2: 1.15, x2: 540, y2: 1120 } },
  { who: "ella", f: "g2", es: "¿Qué color es mejor?", cam: { s: 1.6, x: 470, y: 1150, s2: 1.45 } },
  { who: "el", f: "b1", es: "Rosado.", cam: HIM },
  { who: "ella", f: "g3", es: "¿En serio? ¿Qué color es mejor?", cam: { s: 2.3, x: 470, y: 990, s2: 2.0 } },
  { who: "el", f: "b2", es: "Rosado.", cam: HIM },
  { who: "ella", f: "g4", es: "¿De verdad? ¿Qué color es mejor?", cam: { s: 3.2, x: 470, y: 950, s2: 2.8 } },
  { who: "el", f: "b3", es: "Rosado.", cam: HIM },
  { who: "ella", f: "g5", es: "¿Y cuál es mi color favorito?", cam: { s: 1.45, x: 490, y: 950, y2: 1360 } },
  { who: "el", f: "b4", es: "…¿Rosado?", cam: { s: 2.4, x: 830, y: 1000 }, pre: 0.9 },
  { who: "ella", f: "g6", es: "¡Eres más tonto que un poroto! ¡Me llevo las cuatro de regalo!", cam: { s: 1.8, x: 490, y: 1080, s2: 1.15, x2: 650, y2: 1150 } },
];
const DUR: Record<string, number> = { b1: 0.94, b2: 0.94, b3: 0.94, b4: 1.62, g1: 0.72, g2: 1.06, g3: 1.81, g4: 1.95, g5: 1.53, g6: 4.25, n1: 3.34 };
const T = (() => {
  let t = 1.0;
  return LINES.map((l) => {
    const start = t, at = t + 0.1 + (l.pre ?? 0), len = DUR[l.f];
    t = at + len + 0.25;
    return { ...l, start, at, len, end: t };
  });
})();
const AT = Object.fromEntries(T.map((l) => [l.f, l]));
const END = T[T.length - 1].end;
const END_LEN = 3.9;
export const S_DUR = sec(END + END_LEN);

// ── 姿勢：全部是數字，關鍵格之間補間 ──
// 角度：0＝往下垂，正＝往畫面右轉；arm/leg＝[肩或髖, 肘或膝（相對前一段）]
type Pose = {
  x: number; turn: number; tilt: number; lookX: number; lookY: number; brow: number; squint: number; smile: number;
  aL: number; eL: number; aR: number; eR: number; hL: number; kL: number; hR: number; kR: number;
  lean: number; bob: number; bounce: number; tap: number;
};
type Key = [number, Partial<Pose>];
const at = (f: string, d = 0) => AT[f].at + d;
const st = (f: string, d = 0) => AT[f].start + d;
const en = (f: string, d = 0) => AT[f].at + AT[f].len + d;

const POINT = { aL: -112, eL: -8 }; // 左手指向櫥窗
const HIPS = { aL: -38, eL: 112, aR: 38, eR: -112 }; // 雙手叉腰
const GIRL0: Pose = { x: 470, turn: -0.5, tilt: -3, lookX: -0.7, lookY: -0.1, brow: 0.4, squint: 0, smile: 0.7, aL: -12, eL: 6, aR: 14, eR: -8, hL: -6, kL: 4, hR: 7, kR: -3, lean: 0, bob: 0, bounce: 0, tap: 0 };
const GIRL: Key[] = [
  [0, {}],
  [st("g2"), {}], [at("g2"), { ...POINT, turn: -0.6, lookX: -0.9 }], [en("g2", 0.2), { aL: -12, eL: 6 }],
  [st("g3"), { turn: 0.4, lookX: 0.8, smile: 0.2, brow: 0 }], [at("g3", 0.5), { ...POINT, aR: 38, eR: -112 }], [en("g3", 0.1), { aL: -12, eL: 6 }],
  [st("g4"), { ...HIPS, brow: -0.6, squint: 0.35, smile: -0.4, lean: -4, turn: 0.5, lookX: 0.9 }],
  [st("g5"), { ...HIPS, brow: 0.6, squint: 0.15, smile: 0.5, lean: 6, turn: 0.6, lookX: 0.9, tilt: 6 }],
  [st("b4"), { brow: 0.9, smile: 0.3, squint: 0 }],
  [st("g6"), { brow: -1, squint: 0.2, smile: -0.8, aL: -140, eL: -25, aR: 140, eR: 25, lean: 3, tilt: -4, bob: -10 }],
  [at("g6", 1.6), { brow: -1, smile: -0.8, aL: -140, eL: -25, aR: 140, eR: 25 }],
  [at("g6", 2.0), { brow: 0.7, squint: 0.9, smile: 1, ...POINT, aR: 30, eR: -60, turn: -0.3, lookX: -0.5, bob: 0, bounce: 1, tilt: 6, lean: -3 }],
  [en("g6", 1), { bounce: 0.6 }],
];
const PHONE = { aL: -8, eL: 118, aR: 10, eR: -122 }; // 兩手在胸前捧手機
const BOY0: Pose = { x: 830, turn: 0.15, tilt: 14, lookX: -0.2, lookY: 0.9, brow: 0.3, squint: 0.1, smile: 0.5, ...PHONE, hL: -5, kL: 3, hR: 6, kR: -2, lean: 2, bob: 0, bounce: 0, tap: 1 };
const BOY: Key[] = [
  [0, {}],
  // 第四次：先停住、抬頭、從頭到腳打量她，才說「…¿Rosado?」+ 聳肩
  [st("b4", 0.05), { tap: 0 }], [st("b4", 0.35), { tilt: 0, turn: -0.5, lookX: -0.9, lookY: -0.4, smile: 0, brow: 0.5 }],
  [st("b4", 0.75), { lookY: 0.9 }], [at("b4"), { lookY: -0.2, brow: 0.9, smile: -0.2 }],
  [at("b4", 0.25), { aL: -45, eL: -70, aR: 45, eR: 70, tilt: -8 }], [en("b4", 0.2), { aL: -45, eL: -70, aR: 45, eR: 70 }],
  [st("g6", 0.1), { lean: -7, brow: 1, squint: -0.35, smile: -0.5, ...PHONE, tilt: 0, turn: -0.5, lookX: -0.9, lookY: 0 }],
  [at("g6", 2.0), { lean: -4, brow: 0.7, smile: -0.6 }],
];

const poseAt = (keys: Key[], base: Pose, t: number): Pose => {
  // 先把每個關鍵格累積成完整姿勢，再在相鄰兩格之間補間
  const full: [number, Pose][] = [];
  let cur = base;
  for (const [kt, p] of keys) { cur = { ...cur, ...p }; full.push([kt, cur]); }
  let i = full.findIndex((k, n) => n < full.length - 1 && t >= k[0] && t < full[n + 1][0]);
  if (i < 0) i = t < full[0][0] ? 0 : full.length - 2;
  const [ta, a] = full[i], [tb, b] = full[Math.min(i + 1, full.length - 1)];
  // 維持姿勢 a，到 b 之前 0.35 秒才開始動，剛好在 tb 做完
  const k = tb === ta ? 1 : interpolate(t, [Math.max(ta, tb - 0.35), tb], [0, 1], { ...clamp, easing: ease });
  const o = {} as Pose;
  (Object.keys(a) as (keyof Pose)[]).forEach((n) => (o[n] = a[n] + (b[n] - a[n]) * k));
  return o;
};

// ── 角色 ──
const limb = (x: number, y: number, a1: number, l1: number, a2: number, l2: number) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const ex = x + Math.sin(r(a1)) * l1, ey = y + Math.cos(r(a1)) * l1;
  const hx = ex + Math.sin(r(a1 + a2)) * l2, hy = ey + Math.cos(r(a1 + a2)) * l2;
  return { ex, ey, hx, hy, d: `M${x},${y} L${ex},${ey} L${hx},${hy}` };
};
const Stroke: React.FC<{ d: string; c: string; w: number }> = ({ d, c, w }) => (
  <>
    <path d={d} stroke="#111" strokeWidth={w + 8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d={d} stroke={c} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

const Person: React.FC<{ p: Pose; kind: "ella" | "el"; open: number; blink: number; f: number }> = ({ p, kind, open, blink, f }) => {
  const girl = kind === "ella";
  const y = GROUND + p.bob + Math.abs(Math.sin(f * 0.55)) * -16 * p.bounce;
  const legC = girl ? "#f2c230" : "#2d3e66", armC = girl ? "#f2c230" : "#111";
  const legL = limb(-38, -330, p.hL, 165, p.kL, 160), legR = limb(38, -330, p.hR, 165, p.kR, 160);
  const tapR = Math.sin(f * 1.6) * 5 * p.tap;
  const armL = limb(-72, -572, p.aL, 140, p.eL, 128), armR = limb(72, -572, p.aR, 140, p.eR + tapR, 128);
  const fx = p.turn * 42;
  const eyeRy = 34 * (1 - blink) * (1 - 0.45 * Math.max(p.squint, 0)) * (1 + 0.25 * Math.max(-p.squint, 0));
  const eye = (cx: number, side: number) => {
    const innerDy = -10 * Math.min(p.brow, 0); // 生氣：眉頭往下
    const by = -772 - 12 * Math.max(p.brow, 0);
    return (
      <g key={side}>
        <ellipse cx={cx} cy={-718} rx={29} ry={Math.max(eyeRy, 2)} fill="#fff" stroke="#111" strokeWidth={5} />
        {blink < 0.6 && <circle cx={cx + p.lookX * 11} cy={-718 + p.lookY * 13} r={13} fill="#111" />}
        {girl && blink < 0.6 && [0, 1, 2].map((k) => (
          <line key={k} x1={cx + side * (12 + k * 9)} y1={-718 - eyeRy + 4} x2={cx + side * (18 + k * 12)} y2={-718 - eyeRy - 12 + k * 3} stroke="#111" strokeWidth={4} strokeLinecap="round" />
        ))}
        <line x1={cx - side * 22} y1={by + innerDy} x2={cx + side * 22} y2={by} stroke="#111" strokeWidth={7} strokeLinecap="round" />
      </g>
    );
  };
  const mouth = open > 0.06 ? (
    <g>
      <ellipse cx={fx} cy={-648 + 6 * p.smile} rx={22 + 10 * open} ry={6 + 30 * open} fill="#4a1414" stroke={girl ? "#c94a55" : "#111"} strokeWidth={5} />
      <ellipse cx={fx} cy={-648 + 6 * p.smile + 18 * open} rx={10 + 6 * open} ry={4 + 6 * open} fill="#e97a86" />
    </g>
  ) : (
    <path d={`M${fx - 28},-650 Q${fx},${-650 + 24 * p.smile} ${fx + 28},-650`} stroke={girl ? "#c94a55" : "#111"} strokeWidth={girl ? 8 : 6} fill="none" strokeLinecap="round" />
  );
  return (
    <g transform={`translate(${p.x},${y}) rotate(${p.lean},0,-330)`}>
      {/* 腿 */}
      <Stroke d={legL.d} c={legC} w={girl ? 26 : 30} />
      <Stroke d={legR.d} c={legC} w={girl ? 26 : 30} />
      {[legL, legR].map((l, k) => (
        <ellipse key={k} cx={l.hx + (k ? 14 : -14)} cy={l.hy + 6} rx={girl ? 30 : 38} ry={girl ? 20 : 24} fill={girl ? "#f2c230" : "#fff"} stroke="#111" strokeWidth={6} />
      ))}
      {/* 身體＝衣服 */}
      {girl ? (
        <path d="M-78,-590 Q0,-608 78,-590 L118,-262 Q0,-246 -118,-262 Z" fill="#f2c230" stroke="#111" strokeWidth={7} strokeLinejoin="round" />
      ) : (
        <path d="M-80,-592 Q0,-606 80,-592 L86,-330 Q0,-318 -86,-330 Z" fill="#3a74d0" stroke="#111" strokeWidth={7} strokeLinejoin="round" />
      )}
      {girl && <>
        <path d="M-30,-596 L0,-520 L30,-596" fill="none" stroke="#b98d10" strokeWidth={6} />
        {[-470, -410, -350].map((by) => <circle key={by} cx={10} cy={by} r={7} fill="#b98d10" />)}
        <path d="M-60,-588 Q30,-470 92,-392" stroke="#8a6a08" strokeWidth={6} fill="none" />
        <rect x={74} y={-418} width={80} height={62} rx={14} fill="#f6cf45" stroke="#111" strokeWidth={6} />
        <rect x={104} y={-402} width={20} height={12} rx={3} fill="#b98d10" />
      </>}
      {/* 手臂 */}
      <Stroke d={armL.d} c={armC} w={girl ? 24 : 14} />
      <Stroke d={armR.d} c={armC} w={girl ? 24 : 14} />
      {!girl && [[-72, p.aL], [72, p.aR]].map(([sx, a], k) => (
        <Stroke key={k} d={limb(sx, -572, a, 52, 0, 0).d} c="#3a74d0" w={34} />
      ))}
      {!girl && (
        <g transform={`translate(${armR.hx - 16},${armR.hy - 22}) rotate(${p.aR > 30 ? 35 : -8})`}>
          <rect x={-22} y={-38} width={44} height={74} rx={9} fill="#1c1c22" stroke="#111" strokeWidth={4} />
          <rect x={-16} y={-31} width={32} height={58} rx={5} fill={p.tap > 0.5 ? "#7fc7ff" : "#3b4a5a"} />
        </g>
      )}
      <circle cx={armL.hx} cy={armL.hy} r={24} fill="#fff" stroke="#111" strokeWidth={6} />
      <circle cx={armR.hx} cy={armR.hy} r={24} fill="#fff" stroke="#111" strokeWidth={6} />
      {/* 頭：歪頭繞脖子轉 */}
      <g transform={`rotate(${p.tilt},0,-600)`}>
        <line x1={0} y1={-600} x2={0} y2={-585} stroke="#111" strokeWidth={14} />
        <circle cx={0} cy={-700} r={112} fill="#fff" stroke="#111" strokeWidth={8} />
        {eye(fx - 40, -1)}
        {eye(fx + 40, 1)}
        {girl && open < 0.06 && p.smile > 0.3 && <>
          <circle cx={fx - 66} cy={-668} r={14} fill="#f7a8b0" opacity={0.55} />
          <circle cx={fx + 66} cy={-668} r={14} fill="#f7a8b0" opacity={0.55} />
        </>}
        {girl && <circle cx={-112 + Math.max(p.turn, 0) * 30} cy={-670} r={9} fill="#f2c230" stroke="#111" strokeWidth={3} />}
        {mouth}
      </g>
    </g>
  );
};

// ── 背景：Asatex 睡衣櫥窗＋人行道 ──
const PJ = [
  { name: "ROSADO", c: "#f5a9c4", d: "#e48aab" }, { name: "FUCSIA", c: "#e3187f", d: "#b80f66" },
  { name: "CELESTE", c: "#94cdf2", d: "#6fb2df" }, { name: "GRIS", c: "#bfc1c6", d: "#9fa2a8" },
];
const Shop: React.FC = () => (
  <g>
    <rect x={0} y={0} width={W} height={H} fill="#f3e6d2" />
    <rect x={0} y={0} width={W} height={260} fill="#5b3a64" />
    <text x={330} y={180} textAnchor="middle" fontFamily={SANS} fontWeight={900} fontSize={110} fill="#ffd84d" stroke="#111" strokeWidth={6}>ASATEX</text>
    <rect x={30} y={300} width={640} height={1180} rx={10} fill="#fff4e8" stroke="#111" strokeWidth={10} />
    <rect x={30} y={1480} width={640} height={60} fill="#7a5a44" stroke="#111" strokeWidth={8} />
    {PJ.map((p, i) => {
      const cx = 115 + i * 150;
      return (
        <g key={p.name}>
          <line x1={cx} y1={300} x2={cx} y2={380} stroke="#111" strokeWidth={4} />
          <rect x={cx - 64} y={380} width={128} height={52} rx={10} fill="#fff" stroke="#111" strokeWidth={5} />
          <text x={cx} y={417} textAnchor="middle" fontFamily={SANS} fontWeight={800} fontSize={i === 2 ? 25 : 28} fill="#333">{p.name}</text>
          <circle cx={cx} cy={540} r={44} fill="#fff" stroke="#111" strokeWidth={6} />
          <path d={`M${cx - 70},610 Q${cx},590 ${cx + 70},610 L${cx + 62},900 L${cx - 62},900 Z`} fill={p.c} stroke="#111" strokeWidth={6} />
          <path d={`M${cx - 62},900 L${cx - 66},1340 L${cx - 8},1340 L${cx},960 L${cx + 8},1340 L${cx + 66},1340 L${cx + 62},900 Z`} fill={p.c} stroke="#111" strokeWidth={6} />
          {[0, 1, 2, 3, 4, 5].map((k) => <circle key={k} cx={cx - 34 + (k % 3) * 34} cy={680 + Math.floor(k / 3) * 120 + (k % 2) * 30} r={9} fill={p.d} />)}
          <line x1={cx} y1={1340} x2={cx} y2={1440} stroke="#111" strokeWidth={8} />
          <ellipse cx={cx} cy={1450} rx={60} ry={14} fill="#999" stroke="#111" strokeWidth={5} />
        </g>
      );
    })}
    <rect x={700} y={260} width={380} height={1300} fill="#d9c8b0" />
    <rect x={760} y={420} width={260} height={360} rx={8} fill="#fff8ec" stroke="#111" strokeWidth={8} />
    <line x1={890} y1={420} x2={890} y2={780} stroke="#111" strokeWidth={6} />
    <rect x={0} y={1540} width={W} height={H - 1540} fill="#c9c3bb" />
    {[0, 1, 2, 3, 4].map((k) => <line key={k} x1={k * 270} y1={1540} x2={k * 270 - 120} y2={H} stroke="#a8a29a" strokeWidth={6} />)}
  </g>
);

const Sub: React.FC<{ text: string; len: number }> = ({ text, len }) => {
  const f = useCurrentFrame();
  const op = interpolate(f, [0, 5, len - 6, len], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 230, opacity: op }}>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 52, lineHeight: 1.3, textAlign: "center", maxWidth: 900, color: "#fff", background: "rgba(20,20,28,.72)", padding: "14px 30px", borderRadius: 18 }}>{text}</div>
    </AbsoluteFill>
  );
};

const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const r = (a: number) => interpolate(f, [a, a + 12], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ background: "#ffd84d", opacity: r(0), alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "grid", justifyItems: "center", gap: 36, textAlign: "center" }}>
        <Img src={staticFile("showroom/logo.png")} style={{ width: 520, opacity: r(4), transform: `scale(${0.9 + 0.1 * r(4)})` }} />
        <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 76, lineHeight: 1.2, color: "#1c1c22", opacity: r(12) }}>Les daba más.<br />Los hace felices.</div>
        <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 32, letterSpacing: "0.3em", color: "#5b3a64", opacity: r(20) }}>ZOFRI · IQUIQUE · CHILE</div>
        <div style={{ fontFamily: MONO, fontSize: 50, color: "#1c1c22", border: "3px solid #1c1c22", borderRadius: 999, padding: "12px 34px", opacity: r(26) }}>WhatsApp +56 9 5362 4274</div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontFamily: MONO, fontSize: 50, color: "#1c1c22", border: "3px solid #1c1c22", borderRadius: 999, padding: "12px 34px", opacity: r(32) }}><Instagram />{IG_HANDLE}</div>
      </div>
    </AbsoluteFill>
  );
};

const blinkAt = (f: number, seed: number) => {
  const p = (f + seed) % 92; // 約 3 秒眨一次，眨 4 格
  return p < 4 ? Math.sin((p / 4) * Math.PI) : 0;
};
const mouthAt = (who: "ella" | "el", t: number) => {
  const l = T.find((x) => x.who === who && t >= x.at && t < x.at + x.len);
  if (!l) return 0;
  const env = ENV[l.f] ?? [];
  return env[Math.floor((t - l.at) * S_FPS)] ?? 0;
};

export const Stick: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / S_FPS;
  const sh = t < T[0].end ? T[0] : T.find((l) => t >= l.start && t < l.end) ?? T[T.length - 1];
  const k = interpolate(t, [sh === T[0] ? 0 : sh.start, sh.end], [0, 1], { ...clamp, easing: ease }); // 第一鏡從片頭就開始慢慢拉遠
  const c = sh.cam;
  const s = c.s + ((c.s2 ?? c.s * 1.04) - c.s) * k;
  const hw = W / (2 * s), hh = H / (2 * s);
  const x = Math.min(Math.max(c.x + ((c.x2 ?? c.x) - c.x) * k, hw), W - hw);
  const y = Math.min(Math.max(c.y + ((c.y2 ?? c.y) - c.y) * k, hh), H - hh);
  const ella = poseAt(GIRL, GIRL0, t), el = poseAt(BOY, BOY0, t);
  const laugh = t > at("g6", 2.0) && t < en("g6", 0.6) ? 0.35 + 0.35 * Math.abs(Math.sin(f * 0.55)) : 0;
  return (
    <AbsoluteFill style={{ background: "#f3e6d2" }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <g transform={`translate(${W / 2 - s * x},${H / 2 - s * y}) scale(${s})`}>
          <Shop />
          <Person p={el} kind="el" open={mouthAt("el", t)} blink={blinkAt(f, 40)} f={f} />
          <Person p={ella} kind="ella" open={Math.max(mouthAt("ella", t), laugh)} blink={blinkAt(f, 0)} f={f} />
        </g>
      </svg>
      {T.map((l) => (
        <Sequence key={l.f} from={sec(l.at) - 3} durationInFrames={sec(l.len) + 10}><Sub text={l.es} len={sec(l.len) + 10} /></Sequence>
      ))}
      {T.map((l) => (
        <Sequence key={"a" + l.f} from={sec(l.at)}><Audio src={staticFile(`rosado/vo_fast/${l.f}.wav`)} /></Sequence>
      ))}
      <Audio src={staticFile("sfx/pluck.wav")} volume={(fr) => 0.16 * interpolate(fr, [0, 8, S_DUR - 12, S_DUR], [0, 1, 1, 0], clamp)} />
      <Audio src={staticFile("sfx/mall.wav")} volume={(fr) => 0.08 * interpolate(fr, [0, 8, sec(END) - 10, sec(END)], [0, 1, 1, 0], clamp)} />
      <Sequence from={sec(0.2)}><Audio src={staticFile("sfx/sparkle.wav")} volume={0.35} /></Sequence>
      <Sequence from={sec(at("g6", 2.6))}><Audio src={staticFile("sfx/cash.wav")} volume={0.45} /></Sequence>
      <Sequence from={sec(END)}><EndCard /></Sequence>
      <Sequence from={sec(END + 0.3)}><Audio src={staticFile("rosado/vo_fast/n1.wav")} /></Sequence>
    </AbsoluteFill>
  );
};
