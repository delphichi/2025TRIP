// FeelFul《CalmQuest》呼吸遊戲（9:16，60 秒內，YT Shorts／IG Reels／FB Reels 通用）：
// 粉紅小章魚（護目鏡、星空大眼）在粉紫星空裡游——吸 4 秒鼓起上浮、觸手張開、一路收進黃色星星、穿過星星光圈；吐 6 秒慢慢沉、吹出白色泡泡。
// 開場 3 秒鉤子＋5 輪呼吸＝53 秒，結尾回到最低點可循環。文字全部避開安全區（上 210、下 440、右 120）。
import React from "react";
import { AbsoluteFill, Audio, Easing, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/fonts";
import { clamp } from "./Nochebuena";
import { OctoV2 } from "./OctoV2";

loadFont({ family: "Montserrat", url: staticFile("showroom/Montserrat.ttf"), weight: "100 900" });
const FPS = 30;
const sec = (s: number) => Math.round(s * FPS);
const IN = 4, OUT = 6, START = 3.0, N = 5, CYCLE = IN + OUT;
const DUR_S = START + N * CYCLE;
export const FF_DUR = sec(DUR_S);
const SANS = '"PingFang TC", "Noto Sans TC", sans-serif';
const RND = "Montserrat, Arial, sans-serif";

const LOW = 1340, HIGH = 830, CX = 360, SPEED = 260;
const inOut = Easing.inOut(Easing.sin);
const breath = (t: number) => {
  if (t < START) return { phase: "ready" as const, k: t / START, fill: 0, n: 0 };
  const u = t - START, n = Math.min(N - 1, Math.floor(u / CYCLE)), r = u - n * CYCLE;
  if (r < IN) return { phase: "in" as const, k: r / IN, fill: inOut(r / IN), n };
  return { phase: "out" as const, k: (r - IN) / OUT, fill: 1 - inOut((r - IN) / OUT), n };
};
const yAt = (t: number) => LOW + (HIGH - LOW) * breath(t).fill;
const RINGS = Array.from({ length: N }, (_, i) => START + i * CYCLE + IN);
const STARS = Array.from({ length: N }, (_, i) => Array.from({ length: 6 }, (__, j) => START + i * CYCLE + 0.45 + j * 0.6)).flat();
// 英文版配音（scripts/feelful_en_vo.sh 產生；dur 是實測秒數，用來控制字幕顯示多久）
const EN_VO: { id: string; at: number; dur: number; text: string; sub: boolean }[] = [
  { id: "hook", at: 0.05, dur: 2.97, text: "This level only opens when you breathe right.", sub: false },
  ...[["Breathe in through your nose.", 1.49], ["Breathe in. Collect the stars.", 2.37], ["Gently in.", 1.02], ["Fill up softly.", 1.3], ["One last breath in.", 1.53]].map(([text, dur], i) =>
    ({ id: `in${i + 1}`, at: START + i * CYCLE + 0.15, dur: dur as number, text: text as string, sub: true })),
  ...[["And slowly breathe out. Blow the bubbles.", 3.39], ["Breathe out. Let your shoulders drop.", 2.65], ["And out. Nice and slow.", 2.69], ["Let it all go.", 1.11], ["And all the way out.", 1.3]].map(([text, dur], i) =>
    ({ id: `out${i + 1}`, at: START + i * CYCLE + IN + 0.15, dur: dur as number, text: text as string, sub: true })),
  { id: "end", at: DUR_S - 3.6, dur: 2.69, text: "Five calm breaths. Well done.", sub: false },
];
const scoreAt = (t: number) => STARS.filter((c) => c <= t).length * 10 + RINGS.filter((r) => r <= t).length * 50;

// ── 粉紅小章魚（精緻版 OctoV2，照 brand.jpg）──
const OCTO_K = 0.6; // OctoV2 原尺寸約 520 寬，縮到跟舊版差不多大
const Octo: React.FC<{ fill: number; phase: string; f: number }> = ({ fill, phase, f }) => {
  const s = (0.86 + 0.26 * fill) * OCTO_K;
  const calm = phase === "out";
  return (
    <g transform={`scale(${s})`}>
      <OctoV2 fill={fill} phase={phase} f={f} />
      {/* 吐氣：從嘴巴吹出白色泡泡，往前方飄上去 */}
      {calm && Array.from({ length: 7 }, (_, i) => {
        const p = (f / 40 + i / 7) % 1;
        const r = 16 + 44 * Math.min(1, p * 2.2);
        const bx = 40 + p * 600, by = 160 - p * 280 + Math.sin(f / 11 + i * 2) * 26;
        const o = interpolate(p, [0, 0.1, 0.8, 1], [0, 0.95, 0.85, 0], clamp);
        return (
          <g key={i} opacity={o}>
            <circle cx={bx} cy={by} r={r} fill="#ffffff" fillOpacity={0.28} stroke="#ffffff" strokeWidth={8} />
            <circle cx={bx - r * 0.35} cy={by - r * 0.35} r={r * 0.22} fill="#ffffff" />
          </g>
        );
      })}
    </g>
  );
};

// ── 粉紫星空（視差捲動）──
const Space: React.FC<{ t: number; f: number }> = ({ t, f }) => {
  const sc = t * SPEED;
  const wrap = (x: number, w: number) => ((x % w) + w) % w;
  const stars = Array.from({ length: 70 }, (_, i) => [(i * 157) % 1400, (i * 263) % 1920, 1.5 + (i % 4), (i % 3) * 0.12 + 0.08] as const);
  return (
    <g>
      <defs>
        <linearGradient id="spaceBg" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stopColor="#3a2878" /><stop offset="0.45" stopColor="#7b5bc4" /><stop offset="0.8" stopColor="#d9a6e0" /><stop offset="1" stopColor="#f6cfe6" /></linearGradient>
        <radialGradient id="neb1"><stop offset="0" stopColor="#ff9fd2" stopOpacity="0.55" /><stop offset="1" stopColor="#ff9fd2" stopOpacity="0" /></radialGradient>
        <radialGradient id="neb2"><stop offset="0" stopColor="#8fb3ff" stopOpacity="0.45" /><stop offset="1" stopColor="#8fb3ff" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width={1080} height={1920} fill="url(#spaceBg)" />
      <ellipse cx={wrap(300 - sc * 0.05, 1600) - 200} cy={700} rx={520} ry={360} fill="url(#neb1)" />
      <ellipse cx={wrap(1100 - sc * 0.05, 1600) - 200} cy={1050} rx={480} ry={320} fill="url(#neb2)" />
      {stars.map(([x, y, r, sp], i) => <circle key={i} cx={wrap(x - sc * sp, 1400) - 160} cy={y} r={r} fill="#fff" opacity={0.5 + 0.5 * Math.abs(Math.sin(f / 15 + i))} />)}
      {/* 行星 */}
      {[[200, 360, 70, "#c86bb0", 0.12], [900, 520, 54, "#6f6fd6", 0.18], [600, 1500, 90, "#9a70d8", 0.08]].map(([x, y, r, c, sp], i) => {
        const cx = wrap((x as number) - sc * (sp as number), 1500) - 200;
        return (
          <g key={i} transform={`translate(${cx},${y})`}>
            <circle r={r as number} fill={c as string} />
            <circle r={r as number} fill="url(#neb1)" opacity={0.6} />
            <ellipse rx={(r as number) * 1.7} ry={(r as number) * 0.4} fill="none" stroke="#ffd6f0" strokeWidth={6} opacity={0.8} transform="rotate(-15)" />
          </g>
        );
      })}
      {/* 底部粉色雲海 */}
      {[0, 1, 2].map((i) => {
        const off = -wrap(sc * 0.5, 900) + i * 900;
        return <path key={i} d={`M${off},1920 L${off},1640 Q${off + 120},1560 ${off + 240},1620 Q${off + 380},1540 ${off + 520},1610 Q${off + 680},1550 ${off + 900},1630 L${off + 900},1920 Z`} fill="#fbe1f0" opacity={0.92} />;
      })}
    </g>
  );
};

const Items: React.FC<{ t: number; f: number }> = ({ t, f }) => {
  const sx = (when: number) => CX + (when - t) * SPEED;
  const star = (r: number) => `M0,${-r} L${r * 0.28},${-r * 0.28} L${r},0 L${r * 0.28},${r * 0.28} L0,${r} L${-r * 0.28},${r * 0.28} L${-r},0 L${-r * 0.28},${-r * 0.28} Z`;
  return (
    <g>
      {RINGS.map((r, i) => {
        const x = sx(r);
        if (x < -220 || x > 1300) return null;
        const passed = t >= r, glow = passed ? interpolate(t - r, [0, 0.7], [1, 0], clamp) : 0;
        return (
          <g key={"r" + i} transform={`translate(${x},${HIGH})`}>
            <ellipse rx={80} ry={170} fill="none" stroke="#ffe6a8" strokeWidth={22} opacity={passed ? 0.45 : 1} />
            <ellipse rx={80} ry={170} fill="none" stroke="#fff" strokeWidth={6} />
            {[0, 1, 2, 3, 4, 5].map((k) => <path key={k} d={star(14)} fill="#fff6c8" transform={`translate(${Math.sin((k / 6) * Math.PI * 2 + f / 20) * 80},${Math.cos((k / 6) * Math.PI * 2 + f / 20) * 170})`} />)}
            {glow > 0 && <ellipse rx={80 + 140 * (1 - glow)} ry={170 + 140 * (1 - glow)} fill="none" stroke="#ffd6f0" strokeWidth={10} opacity={glow} />}
          </g>
        );
      })}
      {STARS.map((c, i) => {
        const x = sx(c), y = yAt(c);
        if (x < -100 || x > 1200) return null;
        const got = t >= c, pop = got ? interpolate(t - c, [0, 0.35], [1, 0], clamp) : 1;
        if (pop <= 0) return null;
        return (
          <g key={"s" + i} transform={`translate(${x},${y - (got ? (1 - pop) * 70 : 0)}) rotate(${f * 2 + i * 30}) scale(${got ? 1 + (1 - pop) * 0.8 : 1})`} opacity={pop}>
            <path d={star(44)} fill="#ffe27a" stroke="#c98a12" strokeWidth={4} />
            <path d={star(18)} fill="#fff8d8" />
          </g>
        );
      })}
    </g>
  );
};

const BigText: React.FC<{ zh: string; en: string; top: number; k: number }> = ({ zh, en, top, k }) => (
  <div style={{ position: "absolute", left: 0, right: 0, top, textAlign: "center", transform: `scale(${0.88 + 0.12 * k})` }}>
    <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 180, lineHeight: 1, color: "#6a3fd8", WebkitTextStroke: "18px #ffffff", paintOrder: "stroke fill", textShadow: "0 8px 0 rgba(60,30,120,.2)" }}>{zh}</div>
    <div style={{ marginTop: 10, fontFamily: RND, fontWeight: 800, fontSize: 40, letterSpacing: 6, color: "#fff", WebkitTextStroke: "8px #6a3fd8", paintOrder: "stroke fill" }}>{en}</div>
  </div>
);

export const FeelFul: React.FC<{ lang?: "zh" | "en" }> = ({ lang = "zh" }) => {
  const en = lang === "en";
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / FPS;
  const b = breath(t);
  const y = yAt(t);
  const tilt = b.phase === "in" ? -6 : b.phase === "out" ? 4 : 0;
  const remain = b.phase === "in" ? Math.ceil(IN - b.k * IN - 0.001) : b.phase === "out" ? Math.ceil(OUT - b.k * OUT - 0.001) : 0;
  const pulse = spring({ frame: f % sec(1), fps, config: { damping: 12 } });
  const hook = interpolate(t, [0, 0.2, START - 0.2, START + 0.2], [0, 1, 1, 0], clamp);
  const endMsg = interpolate(t, [DUR_S - 4, DUR_S - 3.4, DUR_S - 0.4, DUR_S], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ background: "#3a2878", overflow: "hidden" }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: "absolute" }}>
        <Space t={t} f={f} />
        <Items t={t} f={f} />
        <g transform={`translate(${CX},${y}) rotate(${tilt}) scale(1.15)`}><Octo fill={b.fill} phase={b.phase} f={f} /></g>
      </svg>
      {/* 品牌＋HUD（上方安全區 210 以下）*/}
      <div style={{ position: "absolute", top: 212, left: 44, right: 150, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: RND, fontWeight: 900, fontSize: 64, lineHeight: 1, background: "linear-gradient(180deg,#ffd6f0,#c9a2ff)", WebkitBackgroundClip: "text", color: "transparent", WebkitTextStroke: "3px #6a3fd8" }}>FeelFul</div>
          <div style={{ fontFamily: RND, fontWeight: 800, fontSize: 24, color: "#fff", letterSpacing: 2, marginTop: 4 }}>🎮 CalmQuest · LV.1</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: RND, fontWeight: 800, fontSize: 26, color: "#fff", letterSpacing: 2, WebkitTextStroke: "5px #3b2466", paintOrder: "stroke fill", marginBottom: 6 }}>Awaluz7</div>
          <div style={{ fontFamily: RND, fontWeight: 900, fontSize: 40, color: "#fff", WebkitTextStroke: "7px #3b2466", paintOrder: "stroke fill" }}>★ {String(scoreAt(t)).padStart(4, "0")}</div>
        </div>
      </div>
      {/* 呼吸量表 */}
      <div style={{ position: "absolute", left: 44, top: 560, width: 54, height: 680, borderRadius: 27, background: "rgba(255,255,255,.35)", border: "6px solid #fff", overflow: "hidden" }}>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${b.fill * 100}%`, background: "linear-gradient(0deg,#6a3fd8,#ffb6dc)" }} />
      </div>
      {b.phase !== "ready" && endMsg < 0.05 && <BigText zh={en ? `${b.phase === "in" ? "IN" : "OUT"} ${remain}` : `${b.phase === "in" ? "吸" : "吐"} ${remain}`} en={en ? (b.phase === "in" ? "BREATHE IN" : "BREATHE OUT") : b.phase === "in" ? "INHALE" : "EXHALE"} top={330} k={pulse} />}
      <div style={{ position: "absolute", left: 0, right: 0, top: 640, textAlign: "center", opacity: hook, fontFamily: en ? RND : SANS, fontWeight: 900, fontSize: en ? 60 : 64, lineHeight: 1.3, color: "#fff", WebkitTextStroke: "12px #6a3fd8", paintOrder: "stroke fill" }}>{en ? <>This level only opens<br />when you breathe right</> : <>這一關<br />只有呼吸對了才過得去</>}</div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 360, textAlign: "center", opacity: endMsg }}>
        <div style={{ fontFamily: en ? RND : SANS, fontWeight: 900, fontSize: 60, lineHeight: 1.35, color: "#6a3fd8", WebkitTextStroke: "12px #ffffff", paintOrder: "stroke fill" }}>{en ? <>Five calm breaths.<br />Well done 🌿</> : <>你剛剛完成了<br />5 次放鬆呼吸 🌿</>}</div>
        <div style={{ marginTop: 16, fontFamily: RND, fontWeight: 900, fontSize: 36, color: "#fff", WebkitTextStroke: "6px #6a3fd8", paintOrder: "stroke fill" }}>FeelFul · Healthy breathing Game</div>
      </div>
      <Audio src={staticFile("feelful/pad.wav")} volume={0.5} />
      {!en && <Audio src={staticFile("feelful/hook.wav")} volume={0.9} />}
      {Array.from({ length: N }, (_, i) => (
        <React.Fragment key={i}>
          <Sequence from={sec(START + i * CYCLE)}><Audio src={staticFile("feelful/inhale.wav")} volume={0.45} /></Sequence>
          <Sequence from={sec(START + i * CYCLE + IN)}><Audio src={staticFile("feelful/exhale.wav")} volume={0.45} /></Sequence>
        </React.Fragment>
      ))}
      {!en && <Sequence from={sec(START + 0.1)}><Audio src={staticFile("feelful/in.wav")} volume={0.9} /></Sequence>}
      {!en && <Sequence from={sec(START + IN + 0.2)}><Audio src={staticFile("feelful/out.wav")} volume={0.9} /></Sequence>}
      {en && EN_VO.map((v) => <Sequence key={v.id} from={sec(v.at)}><Audio src={staticFile(`feelful/en/${v.id}.wav`)} volume={1} /></Sequence>)}
      {/* 英文字幕（開場／結尾已有大字，不重複）*/}
      {en && EN_VO.filter((v) => v.sub).map((v) => {
        const o = interpolate(t, [v.at - 0.1, v.at + 0.1, v.at + v.dur + 0.5, v.at + v.dur + 0.7], [0, 1, 1, 0], clamp);
        return o > 0 && (
          <div key={"sub" + v.id} style={{ position: "absolute", left: 36, right: 120, top: 1400, display: "flex", justifyContent: "center", opacity: o }}>
            <div style={{ fontFamily: RND, fontWeight: 800, fontSize: 40, lineHeight: 1.3, color: "#fff", textAlign: "center", background: "rgba(59,36,102,.62)", borderRadius: 30, padding: "14px 30px", whiteSpace: "pre-line" }}>{v.text.replace(/\. (?=\S)/g, ".\n")}</div>
          </div>
        );
      })}
      {RINGS.map((r, i) => <Sequence key={"rs" + i} from={sec(r)}><Audio src={staticFile("feelful/ring.wav")} volume={0.45} /></Sequence>)}
      {STARS.map((c, i) => <Sequence key={"cs" + i} from={sec(c)}><Audio src={staticFile("feelful/coin.wav")} volume={0.2} /></Sequence>)}
    </AbsoluteFill>
  );
};
