// 《焦慮的失眠症》醫院版（導演版，9:16，循環）：Gemini 3D 醫院背景＋糰糰醫生 × 桃子小姐，誰講話鏡頭給誰、
// 單人鏡背景虛化更重、雙人鏡揭曉笑點（醫生睡著）、急推＋震動、大字跳字幕、煩惱泡泡、結尾接回開頭構圖。
// 配音沿用 public/insomnia/vo（scripts/insomnia_vo.sh），對嘴 src/insomniaEnv.ts。
import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, ease } from "./Nochebuena";
import { ENV } from "./insomniaEnv";
import { Dango, Expr } from "./Mascots";
import { LExpr, MissPeach } from "./MissPeach";

const FPS = 30;
const sec = (s: number) => Math.round(s * FPS);
const SANS = '"PingFang TC", "Noto Sans TC", sans-serif';

// ── 台詞時間軸 ──
type Who = "p" | "d";
const LINES: { f: string; who: Who; zh: string; pre?: number }[] = [
  { f: "m1", who: "p", zh: "醫生……我已經三天沒睡了。" },
  { f: "m2", who: "d", zh: "睡前都在想什麼？" },
  { f: "m3", who: "p", zh: "明天的會議、這個月的帳單、十年後的房價、\n地球暖化，還有我國中講錯的一句話……" },
  { f: "m4", who: "p", zh: "……還是說，睡前把擔心的事寫在紙上，\n手機放客廳，會不會比較好？" },
  { f: "m5", who: "p", zh: "醫生？你還在聽嗎？醫生！" },
  { f: "m6", who: "d", zh: "嗯……你說得很好。掛號費五百。", pre: 0.35 },
];
const DUR: Record<string, number> = { m1: 3.25, m2: 1.25, m3: 5.42, m4: 6.5, m5: 3.25, m6: 2.14 };
const T = (() => {
  let t = 0.05;
  return LINES.map((l) => {
    const at = t + (l.pre ?? 0), len = DUR[l.f];
    t = at + len + 0.15;
    return { ...l, at, len };
  });
})();
const AT = Object.fromEntries(T.map((l) => [l.f, l]));
const at = (f: string, d = 0) => AT[f].at + d;
const END = at("m6") + AT.m6.len + 0.9; // 她變臉停一下再接回開頭
export const IH_DUR = sec(END);

const mouthAt = (who: Who, t: number) => {
  const l = T.find((x) => x.who === who && t >= x.at && t < x.at + x.len);
  return l ? ENV[l.f]?.[Math.floor((t - l.at) * FPS)] ?? 0 : 0;
};

// ── 鏡頭（場景座標）──
type Kind = "two" | "doc" | "peach";
const FRAME: Record<Kind, { s: number; x: number; y: number }> = {
  two: { s: 1, x: 540, y: 960 },
  doc: { s: 2.3, x: 350, y: 1380 },
  peach: { s: 1.75, x: 745, y: 1010 },
};
// [開始秒, 鏡頭, 這一鏡內推近多少, 結束時改對準哪個鏡頭（急推）]
const SHOTS: { t: number; k: Kind; push: number; crashTo?: Kind; crashAt?: number }[] = [
  { t: 0, k: "peach", push: 0.12 },
  { t: at("m2", -0.1), k: "doc", push: 0.05 },
  { t: at("m3", -0.1), k: "peach", push: 0.22 }, // 越講越推近，焦慮感
  { t: at("m3", 2.75), k: "two", push: 0.04 }, // 揭曉：醫生在打瞌睡
  { t: at("m4", -0.1), k: "peach", push: 0.1 },
  { t: at("m5", -0.1), k: "two", push: 0, crashTo: "doc", crashAt: at("m5", 2.0) }, // 「醫生！」急推到醫生
  { t: at("m6", -0.35), k: "doc", push: 0.06 },
  { t: at("m6", 1.15), k: "peach", push: 0.05 }, // 接回開頭構圖
];
const camAt = (t: number) => {
  let i = 0;
  for (let k = 0; k < SHOTS.length; k++) if (t >= SHOTS[k].t) i = k;
  const sh = SHOTS[i], t1 = SHOTS[i + 1]?.t ?? END;
  const a = FRAME[sh.k];
  const k = interpolate(t, [sh.t, t1], [0, 1], clamp);
  let s = a.s * (1 + sh.push * k), x = a.x, y = a.y;
  if (sh.crashTo && sh.crashAt) {
    const b = FRAME[sh.crashTo], c = interpolate(t, [sh.crashAt, sh.crashAt + 0.18], [0, 1], { ...clamp, easing: ease });
    s = s + (b.s - s) * c; x = x + (b.x - x) * c; y = y + (b.y - y) * c;
  }
  const hw = 540 / s, hh = 960 / s;
  return { s, x: Math.min(Math.max(x, hw), 1080 - hw), y: Math.min(Math.max(y, hh), 1920 - hh), kind: sh.k as Kind, crashed: !!sh.crashTo && t >= (sh.crashAt ?? 1e9) };
};

// ── 表演 ──
const peachAt = (t: number, f: number): { e: LExpr; tilt: number } => {
  const open = mouthAt("p", t);
  if (t >= at("m6", 1.15)) return { e: { eye: "annoyed", mouth: "pout", brow: "angry", look: -1, fx: ["anger"] }, tilt: -5 };
  if (t >= at("m5", -0.1)) return { e: { eye: "shock", mouth: "o", brow: "up", look: -1, open, fx: ["shock"] }, tilt: 5 };
  if (t >= at("m4", 0.4)) return { e: { eye: "star", mouth: "open", brow: "up", open, fx: ["sparkle"] }, tilt: -3 + Math.sin(f / 10) * 1.5 };
  if (t >= at("m3", -0.1)) return { e: { eye: "open", mouth: "flat", brow: "sad", open, fx: ["sweat"], look: Math.sin(f / 6) * 0.7 }, tilt: Math.sin(f / 3.5) * 2.5 };
  return { e: { eye: "tired", mouth: "flat", brow: "sad", open, fx: ["sweat"] }, tilt: -4 + Math.sin(f / 20) };
};
const dangoAt = (t: number, f: number): { e: Expr; tilt: number; jolt: number } => {
  const open = mouthAt("d", t);
  if (t >= at("m6", -0.35)) {
    const jolt = t < at("m6", -0.05) ? Math.sin(f * 3) * 12 : 0;
    return { e: { eye: "dot", mouth: "smile", open, fx: t < at("m6", 1.0) ? ["sparkle"] : [] }, tilt: 0, jolt };
  }
  if (t >= at("m3", 2.4)) return { e: { eye: "closed", mouth: "o", fx: ["zzz"] }, tilt: 9 + Math.sin(f / 12) * 4, jolt: 0 };
  if (t >= at("m3", 1.0)) return { e: { eye: "line", mouth: "flat" }, tilt: Math.max(0, Math.sin(f / 5)) * 8, jolt: 0 };
  return { e: { eye: "line", mouth: "flat", open }, tilt: 0, jolt: 0 };
};

// 煩惱泡泡（場景座標，圍在她頭兩側；頭中心約 (740, 800)）
const WORRY: [number, string, number, number][] = [[0.15, "📅", 480, 640], [1.0, "💸", 1000, 610], [1.9, "🏠", 470, 830], [2.6, "🌍", 1010, 820], [3.6, "😳", 560, 520]];
const Bubbles: React.FC<{ t: number }> = ({ t }) => {
  const { fps } = useVideoConfig();
  if (t < at("m3") || t > at("m4", 2.5)) return null;
  return (
    <g>
      {WORRY.map(([d, em, x, y], i) => {
        const ap = spring({ frame: Math.round((t - at("m3") - d) * fps), fps, config: { damping: 9 } });
        const pop = interpolate(t, [at("m4", 0.4 + i * 0.22), at("m4", 0.6 + i * 0.22)], [1, 0], clamp);
        const k = ap * pop;
        return k > 0.01 ? (
          <g key={i} transform={`translate(${x},${y + Math.sin(t * 2 + i) * 8}) scale(${k})`}>
            <circle r={62} fill="#fff" stroke="#2a2420" strokeWidth={5} />
            <text y={5} fontSize={66} textAnchor="middle" dominantBaseline="middle">{em}</text>
          </g>
        ) : null;
      })}
      {t > at("m4", 0.4) && <text x={950} y={560} textAnchor="middle" fontSize={130 * spring({ frame: Math.round((t - at("m4", 0.4)) * fps), fps, config: { damping: 8 } })}>💡</text>}
    </g>
  );
};

// 大字跳字幕
// top：大字放在畫面哪個高度（預設 1000＝她身體的位置，不擋臉）
const BIG: { t: number; text: string; color?: string; size?: number; dur?: number; top?: number }[] = [
  { t: at("m1", 1.6), text: "3 天", color: "#ffd84d", size: 190, dur: 1.5 },
  { t: at("m3", 0.15), text: "會議", dur: 0.85 },
  { t: at("m3", 1.0), text: "帳單", dur: 0.85 },
  { t: at("m3", 1.9), text: "房價", dur: 0.7 },
  { t: at("m3", 2.6), text: "暖化", dur: 0.9 },
  { t: at("m3", 3.6), text: "國中？！", color: "#ff6b8a", dur: 1.6 },
  { t: at("m4", 1.6), text: "寫在紙上", color: "#7fe0b8", dur: 1.6 },
  { t: at("m4", 3.6), text: "手機放客廳", color: "#7fe0b8", dur: 2.4 },
  { t: at("m5", 2.0), text: "醫生！", color: "#ff5a5a", size: 170, dur: 1.0, top: 230 },
  { t: at("m6", 1.15), text: "$500", color: "#ffcf3a", size: 210, dur: 1.2 },
];
const BigWord: React.FC<{ text: string; color: string; size: number; len: number; top: number }> = ({ text, color, size, len, top }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = spring({ frame: f, fps, config: { damping: 10, stiffness: 180 } });
  const out = interpolate(f, [len - 4, len], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: top, opacity: out }}>
      <div style={{ transform: `scale(${0.4 + 0.6 * k}) rotate(${(1 - k) * -8}deg)`, fontFamily: SANS, fontWeight: 900, fontSize: size, color, WebkitTextStroke: "16px #1a1626", paintOrder: "stroke fill", textShadow: "0 10px 0 rgba(0,0,0,.25)", whiteSpace: "nowrap" }}>{text}</div>
    </AbsoluteFill>
  );
};
const Caption: React.FC<{ text: string; len: number }> = ({ text, len }) => {
  const f = useCurrentFrame();
  const op = interpolate(f, [0, 3, len - 4, len], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 440, opacity: op }}>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 44, lineHeight: 1.35, color: "#fff", textAlign: "center", whiteSpace: "pre-line", WebkitTextStroke: "8px #1a1626", paintOrder: "stroke fill", maxWidth: 1000 }}>{text}</div>
    </AbsoluteFill>
  );
};

export const InsomniaHosp: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const c = camAt(t);
  const p = peachAt(t, f), d = dangoAt(t, f);
  const close = c.kind !== "two" || c.crashed;
  const showDoc = c.kind !== "peach", showPeach = c.kind !== "doc" && !c.crashed;
  const shake = t >= at("m5", 2.0) && t < at("m5", 2.45) ? Math.sin(f * 4) * 14 : 0;
  return (
    <AbsoluteFill style={{ background: "#cfe7df", overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 1080, height: 1920, transformOrigin: "0 0", transform: `translate(${540 - c.s * c.x + shake}px,${960 - c.s * c.y}px) scale(${c.s})` }}>
        <Img src={staticFile(close ? "clinic/hosp_blur_close.png" : "clinic/hosp_blur.png")} style={{ position: "absolute", width: 1080, height: 1920 }} />
        <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: "absolute" }}>
          <defs><radialGradient id="ihsh"><stop offset="0" stopColor="#2f4a44" stopOpacity="0.32" /><stop offset="1" stopColor="#2f4a44" stopOpacity="0" /></radialGradient></defs>
          {showDoc && <><ellipse cx={350} cy={1640} rx={200} ry={34} fill="url(#ihsh)" /><Dango e={d.e} x={350 + d.jolt} y={1636} s={1.45} tilt={d.tilt} /></>}
          {showPeach && <><ellipse cx={740} cy={1640} rx={190} ry={32} fill="url(#ihsh)" /><MissPeach e={p.e} x={740} y={1636} s={0.86} tilt={p.tilt} breathe={Math.sin(f / 18)} /></>}
          {showPeach && <Bubbles t={t} />}
        </svg>
      </div>
      <div style={{ position: "absolute", top: 210, left: 40, fontFamily: "Montserrat, Arial", fontWeight: 800, fontSize: 26, color: "rgba(30,50,46,.55)", letterSpacing: 2 }}>ASATEX · @asatex.chile</div>
      {BIG.map((b, i) => <Sequence key={"b" + i} from={sec(b.t)} durationInFrames={sec(b.dur ?? 1)}><BigWord text={b.text} color={b.color ?? "#ffffff"} size={b.size ?? 150} len={sec(b.dur ?? 1)} top={b.top ?? 1000} /></Sequence>)}
      {T.map((l) => <Sequence key={l.f} from={Math.max(0, sec(l.at) - 2)} durationInFrames={sec(l.len) + 5}><Caption text={l.zh} len={sec(l.len) + 5} /></Sequence>)}
      {T.map((l) => <Sequence key={"a" + l.f} from={sec(l.at)}><Audio src={staticFile(`insomnia/vo/${l.f}.wav`)} /></Sequence>)}
      <Audio src={staticFile("sfx/pluck.wav")} volume={0.07} />
      {Array.from({ length: Math.ceil(END) }, (_, i) => <Sequence key={"t" + i} from={sec(i + 0.5)}><Audio src={staticFile("sfx/tick.wav")} volume={0.18} /></Sequence>)}
      {[at("m3", 2.9), at("m4", 1.8), at("m4", 4.4), at("m5", 0.8)].map((s, i) => <Sequence key={"z" + i} from={sec(s)}><Audio src={staticFile("sfx/snore.wav")} volume={0.35} /></Sequence>)}
      <Sequence from={sec(at("m4", 0.4))}><Audio src={staticFile("sfx/ding.wav")} volume={0.45} /></Sequence>
      <Sequence from={sec(at("m5", 1.95))}><Audio src={staticFile("sfx/whoosh.wav")} volume={0.5} /></Sequence>
      <Sequence from={sec(at("m6", 1.15))}><Audio src={staticFile("sfx/cash.wav")} volume={0.5} /></Sequence>
      <Sequence from={sec(at("m1", 1.6))}><Audio src={staticFile("sfx/dundun.wav")} volume={0.35} /></Sequence>
    </AbsoluteFill>
  );
};
