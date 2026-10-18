// 《飛飛呼吸》（9:16，循環）：看起來像橫向飛行遊戲，其實在帶呼吸——吸氣 4 秒（飛飛鼓起來往上飛、穿過光圈）、
// 吐氣 5 秒（縮小慢慢滑下、一路吃金幣），三輪＝30 秒，結尾回到起點可無縫循環。大字＝藍字白粗邊框。
// 音效 public/breathe/*.wav（numpy 合成），語音 breathe/vo（Fish 台灣女生聲）。
import React from "react";
import { AbsoluteFill, Audio, Easing, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp } from "./Nochebuena";

const FPS = 30;
const sec = (s: number) => Math.round(s * FPS);
const IN = 4, OUT = 5, START = 3.0, N = 3, CYCLE = IN + OUT; // 開場 3 秒講鉤子，之後吸 4 吐 5 × 3 輪＝30 秒
const DUR_S = START + N * CYCLE;
export const BR_DUR = sec(DUR_S);
const SANS = '"PingFang TC", "Noto Sans TC", sans-serif';
const RND = "Montserrat, Arial, sans-serif";

const LOW = 1300, HIGH = 620, CX = 330, SPEED = 300; // 飛飛的高度範圍、螢幕 x、捲動速度（px/秒）
const inOut = Easing.inOut(Easing.sin);

// 呼吸狀態：phase、這個 phase 的進度 0–1、肺部充滿程度 0–1
const breath = (t: number) => {
  if (t < START) return { phase: "ready" as const, k: t / START, fill: 0, n: 0 };
  const u = t - START, n = Math.min(N - 1, Math.floor(u / CYCLE)), r = u - n * CYCLE;
  if (r < IN) return { phase: "in" as const, k: r / IN, fill: inOut(r / IN), n };
  return { phase: "out" as const, k: (r - IN) / OUT, fill: 1 - inOut((r - IN) / OUT), n };
};
const yAt = (t: number) => LOW + (HIGH - LOW) * breath(t).fill;

// 世界裡的物件：每輪最高點一個光圈、吐氣路上一排金幣（依「什麼時候經過」決定位置）
const RINGS = Array.from({ length: N }, (_, i) => START + i * CYCLE + IN);
const COINS = Array.from({ length: N }, (_, i) => Array.from({ length: 5 }, (__, j) => START + i * CYCLE + IN + 0.6 + j * 0.85)).flat();
const SCORE_AT = (t: number) => COINS.filter((c) => c <= t).length * 10 + RINGS.filter((r) => r <= t).length * 50;

// ── 飛飛：圓滾滾的小氣球＋小翅膀 ──
const Feifei: React.FC<{ fill: number; phase: string; f: number }> = ({ fill, phase, f }) => {
  const s = 0.82 + 0.3 * fill; // 吸氣鼓起來
  const flap = Math.sin(f / (phase === "in" ? 2.2 : 5)) * (phase === "in" ? 26 : 12);
  const K = "#2a3550";
  const calm = phase === "out";
  return (
    <g transform={`scale(${s})`}>
      <ellipse cx={0} cy={150} rx={70} ry={12} fill="#000" opacity={0.08} />
      {[-1, 1].map((sd) => (
        <path key={sd} transform={`rotate(${sd * (-10 - flap)},${sd * 92},-10)`} d={`M${sd * 92},-10 C${sd * 160},-70 ${sd * 200},-20 ${sd * 170},20 C${sd * 150},40 ${sd * 110},30 ${sd * 92},20 Z`} fill="#ffffff" stroke={K} strokeWidth={6} strokeLinejoin="round" />
      ))}
      <defs><radialGradient id="ffBody" cx="0.38" cy="0.3" r="0.8"><stop offset="0" stopColor="#e9fbff" /><stop offset="0.6" stopColor="#8fdcf3" /><stop offset="1" stopColor="#4fb4dc" /></radialGradient></defs>
      <circle r={110} fill="url(#ffBody)" stroke={K} strokeWidth={7} />
      <ellipse cx={-42} cy={-56} rx={28} ry={16} fill="#fff" opacity={0.7} transform="rotate(-30,-42,-56)" />
      <ellipse cx={-56} cy={30} rx={20} ry={11} fill="#ff9aa6" opacity={0.6} />
      <ellipse cx={56} cy={30} rx={20} ry={11} fill="#ff9aa6" opacity={0.6} />
      {calm
        ? [-34, 34].map((x) => <path key={x} d={`M${x - 14},4 Q${x},16 ${x + 14},4`} stroke={K} strokeWidth={6} fill="none" strokeLinecap="round" />)
        : [-34, 34].map((x) => <g key={x}><ellipse cx={x} cy={2} rx={11} ry={14} fill={K} /><circle cx={x - 4} cy={-4} r={4.5} fill="#fff" /></g>)}
      {phase === "in"
        ? <ellipse cx={0} cy={40} rx={9 + 5 * fill} ry={8 + 6 * fill} fill="#2a3550" />
        : calm ? <path d="M-10,38 Q0,46 10,38" stroke={K} strokeWidth={5} fill="none" strokeLinecap="round" />
          : <path d="M-12,36 Q0,48 12,36" stroke={K} strokeWidth={5} fill="none" strokeLinecap="round" />}
      {/* 吐氣時嘴邊飄出小氣流 */}
      {calm && [0, 1, 2].map((i) => {
        const p = ((f / 20 + i / 3) % 1);
        return <circle key={i} cx={-30 - p * 140} cy={44 + p * 10} r={10 * (1 - p)} fill="#ffffff" opacity={0.8 * (1 - p)} />;
      })}
    </g>
  );
};

// 背景：天空＋視差山丘＋雲（依捲動距離位移，頭尾位移相同就能循環）
const World: React.FC<{ t: number }> = ({ t }) => {
  const scroll = t * SPEED;
  const wrap = (x: number, w: number) => ((x % w) + w) % w;
  const hills = (sp: number, y: number, h: number, color: string, w: number) => {
    const off = -wrap(scroll * sp, w);
    return [0, 1, 2].map((i) => <path key={i} d={`M${off + i * w},1920 L${off + i * w},${y} Q${off + i * w + w * 0.25},${y - h} ${off + i * w + w * 0.5},${y} Q${off + i * w + w * 0.75},${y - h * 0.6} ${off + i * w + w},${y} L${off + i * w + w},1920 Z`} fill={color} />);
  };
  return (
    <g>
      <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8fd3ff" /><stop offset="0.6" stopColor="#d6f0ff" /><stop offset="1" stopColor="#fff2d9" /></linearGradient></defs>
      <rect width={1080} height={1920} fill="url(#sky)" />
      <circle cx={860} cy={260} r={90} fill="#fff6c8" opacity={0.9} />
      {[[0, 300, 1], [500, 480, 0.8], [900, 220, 1.2], [1300, 560, 0.9]].map(([x, y, sc], i) => {
        const cx = wrap(x - scroll * 0.15, 1500) - 200;
        return <g key={i} transform={`translate(${cx},${y}) scale(${sc})`} opacity={0.9}><ellipse cx={0} cy={0} rx={90} ry={40} fill="#fff" /><ellipse cx={60} cy={-20} rx={60} ry={40} fill="#fff" /><ellipse cx={-60} cy={-10} rx={50} ry={32} fill="#fff" /></g>;
      })}
      {hills(0.2, 1500, 260, "#b9e3c6", 1400)}
      {hills(0.45, 1640, 200, "#8fd1a6", 1100)}
      {hills(0.8, 1760, 120, "#6cbf86", 900)}
      <rect y={1780} width={1080} height={140} fill="#5aa874" />
    </g>
  );
};

// 光圈與金幣（世界座標＝經過時間 × 速度）
const Items: React.FC<{ t: number; f: number }> = ({ t, f }) => {
  const sx = (when: number) => CX + (when - t) * SPEED;
  return (
    <g>
      {RINGS.map((r, i) => {
        const x = sx(r);
        if (x < -200 || x > 1300) return null;
        const passed = t >= r, glow = passed ? interpolate(t - r, [0, 0.6], [1, 0], clamp) : 0;
        return (
          <g key={"r" + i} transform={`translate(${x},${HIGH})`}>
            <ellipse rx={70} ry={150} fill="none" stroke="#ffd23f" strokeWidth={22} opacity={passed ? 0.5 : 1} />
            <ellipse rx={70} ry={150} fill="none" stroke="#fff6a0" strokeWidth={6} />
            {glow > 0 && <ellipse rx={70 + 120 * (1 - glow)} ry={150 + 120 * (1 - glow)} fill="none" stroke="#ffe066" strokeWidth={10} opacity={glow} />}
          </g>
        );
      })}
      {COINS.map((c, i) => {
        const x = sx(c), y = yAt(c);
        if (x < -100 || x > 1200) return null;
        const got = t >= c, pop = got ? interpolate(t - c, [0, 0.3], [1, 0], clamp) : 1;
        if (pop <= 0) return null;
        return (
          <g key={"c" + i} transform={`translate(${x},${y - (got ? (1 - pop) * 60 : 0)}) scale(${got ? 1 + (1 - pop) : 1},1)`} opacity={pop}>
            <ellipse rx={42 * Math.abs(Math.cos(f / 8 + i))} ry={42} fill="#ffc83a" stroke="#c98a12" strokeWidth={6} />
            <ellipse rx={20 * Math.abs(Math.cos(f / 8 + i))} ry={20} fill="#ffe27a" />
          </g>
        );
      })}
    </g>
  );
};

// 大字（藍字白粗邊框）
const BigText: React.FC<{ text: string; size: number; top: number; k: number }> = ({ text, size, top, k }) => (
  <div style={{ position: "absolute", left: 0, right: 0, top, textAlign: "center", fontFamily: SANS, fontWeight: 900, fontSize: size, color: "#1f6fe0", WebkitTextStroke: "18px #ffffff", paintOrder: "stroke fill", transform: `scale(${0.85 + 0.15 * k})`, textShadow: "0 8px 0 rgba(31,60,120,.18)" }}>{text}</div>
);

export const Breathe: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / FPS;
  const b = breath(t);
  const y = yAt(t);
  const tilt = b.phase === "in" ? -10 : b.phase === "out" ? 6 : 0;
  const score = SCORE_AT(t);
  const remain = b.phase === "in" ? Math.ceil(IN - b.k * IN - 0.001) : b.phase === "out" ? Math.ceil(OUT - b.k * OUT - 0.001) : 0;
  const pulse = spring({ frame: f % sec(1), fps, config: { damping: 12 } });
  const label = b.phase === "in" ? "吸" : b.phase === "out" ? "吐" : "";
  const endMsg = interpolate(t, [DUR_S - 3.2, DUR_S - 2.6, DUR_S - 0.4, DUR_S], [0, 1, 1, 0], clamp);
  const hook = interpolate(t, [0, 0.2, START - 0.2, START + 0.2], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ background: "#8fd3ff", overflow: "hidden" }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: "absolute" }}>
        <World t={t} />
        <Items t={t} f={f} />
        <g transform={`translate(${CX},${y}) rotate(${tilt}) scale(1.3)`}><Feifei fill={b.fill} phase={b.phase} f={f} /></g>
      </svg>
      {/* HUD：分數、關卡、呼吸量表 */}
      <div style={{ position: "absolute", top: 210, left: 40, right: 150, display: "flex", justifyContent: "space-between", fontFamily: RND, fontWeight: 900, fontSize: 40, color: "#fff", WebkitTextStroke: "8px #2a3550", paintOrder: "stroke fill" }}>
        <span>LV.1 平靜之空</span><span>★ {String(score).padStart(4, "0")}</span>
      </div>
      <div style={{ position: "absolute", left: 50, top: 520, width: 54, height: 700, borderRadius: 27, background: "rgba(255,255,255,.55)", border: "6px solid #2a3550", overflow: "hidden" }}>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${b.fill * 100}%`, background: "linear-gradient(0deg,#1f6fe0,#8fdcf3)" }} />
      </div>
      <div style={{ position: "absolute", left: 32, top: 1240, width: 90, textAlign: "center", fontFamily: SANS, fontWeight: 900, fontSize: 30, color: "#2a3550" }}>呼吸</div>
      {/* 吸／吐＋倒數 */}
      {label && <BigText text={`${label} ${remain}`} size={190} top={330} k={pulse} />}
      {/* 開場鉤子 */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 640, textAlign: "center", opacity: hook, fontFamily: SANS, fontWeight: 900, fontSize: 64, lineHeight: 1.3, color: "#fff", WebkitTextStroke: "12px #1f6fe0", paintOrder: "stroke fill" }}>這一關<br />只有呼吸對了才過得去</div>
      {/* 結尾小字 */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 700, textAlign: "center", opacity: endMsg, fontFamily: SANS, fontWeight: 900, fontSize: 56, lineHeight: 1.35, color: "#1f6fe0", WebkitTextStroke: "12px #ffffff", paintOrder: "stroke fill" }}>你剛剛完成了<br />3 次放鬆呼吸 🌿</div>
      <div style={{ position: "absolute", top: 268, left: 40, fontFamily: RND, fontWeight: 800, fontSize: 24, color: "rgba(42,53,80,.6)", letterSpacing: 2 }}>ASATEX · @asatex.chile</div>
      {/* 聲音：墊音全程；每輪吸／吐引導音；第一輪語音提示；金幣、光圈 */}
      <Audio src={staticFile("breathe/pad.wav")} volume={0.5} />
      <Sequence from={0}><Audio src={staticFile("breathe/vo/hook.wav")} volume={0.9} /></Sequence>
      {Array.from({ length: N }, (_, i) => (
        <React.Fragment key={i}>
          <Sequence from={sec(START + i * CYCLE)}><Audio src={staticFile("breathe/inhale.wav")} volume={0.45} /></Sequence>
          <Sequence from={sec(START + i * CYCLE + IN)}><Audio src={staticFile("breathe/exhale.wav")} volume={0.45} /></Sequence>
        </React.Fragment>
      ))}
      <Sequence from={sec(START + 0.1)}><Audio src={staticFile("breathe/vo/in.wav")} volume={0.9} /></Sequence>
      <Sequence from={sec(START + IN + 0.2)}><Audio src={staticFile("breathe/vo/out.wav")} volume={0.9} /></Sequence>
      {RINGS.map((r, i) => <Sequence key={"rs" + i} from={sec(r)}><Audio src={staticFile("breathe/ring.wav")} volume={0.5} /></Sequence>)}
      {COINS.map((c, i) => <Sequence key={"cs" + i} from={sec(c)}><Audio src={staticFile("breathe/coin.wav")} volume={0.25} /></Sequence>)}
    </AbsoluteFill>
  );
};
