// 醫院梗短劇測試（9:16，中文）：原創角色——飯糰醫生（白色、圓眼鏡、聽診器）、馬鈴薯病人（黃色、躺病床）。
// 「以為是重症，沒想到是絕症」：你這個病叫做「窮」→ 藥是「上班」→ 病人昏倒、心電圖拉平。
// 配音 scripts/hosp_vo.sh（Fish 台灣口音），對嘴 src/hospEnv.ts（scripts/lipsync_env.py hosp/vo hosp）。
import React from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, ease } from "./Nochebuena";
import { ENV } from "./hospEnv";

const FPS = 30;
const sec = (s: number) => Math.round(s * FPS);
const K = "#2a2320";
const SANS = '"PingFang TC", "Noto Sans TC", "Heiti TC", sans-serif';

type Who = "p" | "d";
const LINES: { f: string; who: Who; zh: string; pre?: number }[] = [
  { f: "p1", who: "p", zh: "醫生，我是不是很嚴重？\n我每天都好累，什麼都不想做……" },
  { f: "d1", who: "d", zh: "你要有心理準備。" },
  { f: "p2", who: "p", zh: "我……還能活多久？" },
  { f: "d2", who: "d", zh: "你這個病，叫做……「窮」。", pre: 0.3 },
  { f: "p3", who: "p", zh: "那……有藥醫嗎？" },
  { f: "d3", who: "d", zh: "有啊。" },
  { f: "p4", who: "p", zh: "是什麼藥？！" },
  { f: "d4", who: "d", zh: "上班。", pre: 0.9 },
  { f: "p5", who: "p", zh: "這……這比絕症還可怕！" },
];
const DUR: Record<string, number> = { p1: 5.06, d1: 1.16, p2: 2.09, d2: 2.51, p3: 2.41, d3: 0.7, p4: 1.3, d4: 0.65, p5: 2.6 };
const T = (() => {
  let t = 0.6;
  return LINES.map((l) => {
    const at = t + (l.pre ?? 0), len = DUR[l.f];
    t = at + len + 0.35;
    return { ...l, at, len };
  });
})();
const AT = Object.fromEntries(T.map((l) => [l.f, l]));
const FAINT = AT.p5.at + AT.p5.len - 0.6; // 昏倒、心電圖拉平
export const H_DUR = sec(FAINT + 3.2);

const mouthAt = (who: Who, t: number) => {
  const l = T.find((x) => x.who === who && t >= x.at && t < x.at + x.len);
  return l ? ENV[l.f]?.[Math.floor((t - l.at) * FPS)] ?? 0 : 0;
};
const between = (t: number, a: number, b: number) => t >= a && t < b;

// ── 病房 ──
const Room: React.FC<{ f: number; flat: boolean }> = ({ f, flat }) => {
  const beatX = (f * 9) % 260;
  return (
    <g>
      <rect width={1080} height={1150} fill="#e9e6df" />
      <rect y={760} width={1080} height={40} fill="#5f6b73" />
      <rect y={800} width={1080} height={350} fill="#d9d5cc" />
      {Array.from({ length: 18 }, (_, i) => <rect key={i} x={(i % 9) * 120} y={800 + Math.floor(i / 9) * 175} width={118} height={173} fill="none" stroke="#c4bfb4" strokeWidth={3} />)}
      <rect y={1150} width={1080} height={770} fill="#cfd3d6" />
      {Array.from({ length: 40 }, (_, i) => <rect key={i} x={(i % 8) * 135} y={1150 + Math.floor(i / 8) * 135} width={133} height={133} fill="none" stroke="#b9bec2" strokeWidth={3} />)}
      {/* 心電圖螢幕＋點滴架 */}
      <rect x={800} y={330} width={220} height={170} rx={12} fill="#2d3338" stroke={K} strokeWidth={6} />
      <rect x={815} y={345} width={190} height={115} rx={6} fill="#0e1a14" />
      {flat
        ? <line x1={820} y1={402} x2={1000} y2={402} stroke="#3cff7a" strokeWidth={4} />
        : <path d={`M820,402 L${820 + beatX * 0.3},402 l10,-34 l10,56 l10,-22 L1000,402`} stroke="#3cff7a" strokeWidth={4} fill="none" />}
      <text x={990} y={485} textAnchor="end" fontFamily="monospace" fontSize={30} fill={flat ? "#ff4d4d" : "#3cff7a"}>{flat ? "0" : "72"}</text>
      <line x1={760} y1={300} x2={760} y2={1180} stroke="#9aa0a6" strokeWidth={10} />
      <rect x={720} y={300} width={80} height={110} rx={16} fill="#dff3ff" stroke="#7aa" strokeWidth={4} opacity={0.9} />
      {/* 病床 */}
      <rect x={420} y={1000} width={600} height={70} rx={14} fill="#f2f4f7" stroke={K} strokeWidth={6} />
      <rect x={420} y={1065} width={600} height={50} fill="#9aa4ad" stroke={K} strokeWidth={6} />
      {[440, 1000].map((x) => <rect key={x} x={x - 8} y={1110} width={16} height={130} fill="#7d868f" />)}
      <rect x={400} y={880} width={36} height={200} rx={10} fill="#c8ced4" stroke={K} strokeWidth={5} />
      {Array.from({ length: 9 }, (_, i) => <line key={i} x1={520 + i * 52} y1={1030} x2={520 + i * 52} y2={1115} stroke="#8a929a" strokeWidth={6} />)}
      <line x1={500} y1={1030} x2={1000} y2={1030} stroke="#8a929a" strokeWidth={8} />
    </g>
  );
};

// ── 飯糰醫生 ──
const Doctor: React.FC<{ t: number; f: number }> = ({ t, f }) => {
  const open = mouthAt("d", t);
  const serious = between(t, AT.d1.at - 0.2, AT.p3.at) || between(t, AT.d4.at - 0.9, FAINT);
  const glint = between(t, AT.d2.at + 1.2, AT.d2.at + 1.6) || between(t, AT.d4.at, AT.d4.at + 0.4);
  const bob = Math.sin(f / 9) * 4;
  return (
    <g transform={`translate(300,${1160 + bob})`}>
      <ellipse cx={0} cy={6} rx={120} ry={18} fill="#000" opacity={0.12} />
      {/* 身體＝飯糰 */}
      <path d="M0,-330 Q40,-330 120,-130 Q150,-40 110,-6 Q0,14 -110,-6 Q-150,-40 -120,-130 Q-40,-330 0,-330 Z" fill="#fbfbf8" stroke={K} strokeWidth={7} />
      <rect x={-70} y={-110} width={140} height={100} rx={12} fill="#2f3a2c" stroke={K} strokeWidth={6} />
      {/* 聽診器 */}
      <path d="M-50,-150 Q-60,-90 -10,-80 Q40,-90 50,-150" stroke="#5a6672" strokeWidth={7} fill="none" />
      <circle cx={-10} cy={-74} r={12} fill="#c9d2da" stroke={K} strokeWidth={4} />
      {/* 病歷板 */}
      <g transform="translate(110,-120) rotate(12)">
        <rect x={-38} y={-52} width={76} height={104} rx={8} fill="#c89a5a" stroke={K} strokeWidth={5} />
        <rect x={-30} y={-38} width={60} height={82} fill="#fff" />
        {[0, 1, 2, 3].map((i) => <line key={i} x1={-22} y1={-26 + i * 18} x2={22} y2={-26 + i * 18} stroke="#aaa" strokeWidth={4} />)}
      </g>
      {/* 臉 */}
      {[-1, 1].map((sd) => (
        <g key={sd}>
          <circle cx={sd * 42} cy={-205} r={30} fill="#fff" stroke={K} strokeWidth={6} />
          {serious ? <line x1={sd * 42 - 12} y1={-205} x2={sd * 42 + 12} y2={-205} stroke={K} strokeWidth={7} strokeLinecap="round" />
            : <circle cx={sd * 42} cy={-203} r={8} fill={K} />}
          <ellipse cx={sd * 72} cy={-168} rx={16} ry={9} fill="#ffb3b3" opacity={0.6} />
        </g>
      ))}
      <line x1={-12} y1={-205} x2={12} y2={-205} stroke={K} strokeWidth={5} />
      {glint && <path d="M50,-232 l10,-22 l4,22 l22,6 l-22,6 l-4,22 l-10,-22 l-22,-6 Z" fill="#fff" stroke="#9cf" strokeWidth={3} />}
      {open > 0.08 ? <ellipse cx={0} cy={-158} rx={14 + 8 * open} ry={4 + 14 * open} fill="#7a2a2a" stroke={K} strokeWidth={4} />
        : <path d={serious ? "M-14,-158 L14,-158" : "M-14,-160 Q0,-150 14,-160"} stroke={K} strokeWidth={5} fill="none" strokeLinecap="round" />}
    </g>
  );
};

// ── 馬鈴薯病人（躺著，頭在左邊）──
const Patient: React.FC<{ t: number; f: number }> = ({ t, f }) => {
  const open = mouthAt("p", t);
  const worried = t < AT.d1.at;
  const sad = between(t, AT.p2.at - 0.1, AT.p3.at);
  const shine = between(t, AT.p4.at - 0.1, AT.d4.at);
  const shock = between(t, AT.d4.at + 0.4, FAINT);
  const faint = t >= FAINT;
  const shake = shock ? Math.sin(f * 2.3) * 5 : 0;
  const tilt = faint ? interpolate(t, [FAINT, FAINT + 0.3], [0, -14], clamp) : 0;
  const eye = (cx: number) => {
    if (faint) return <g key={cx}><path d={`M${cx - 16},-16 l32,32 M${cx + 16},-16 l-32,32`} stroke={K} strokeWidth={7} strokeLinecap="round" /></g>;
    if (shock) return <g key={cx}><circle cx={cx} cy={0} r={22} fill="#fff" stroke={K} strokeWidth={5} /><circle cx={cx} cy={0} r={5} fill={K} /></g>;
    if (shine) return <g key={cx}><circle cx={cx} cy={0} r={18} fill={K} /><circle cx={cx - 5} cy={-6} r={7} fill="#fff" /><circle cx={cx + 6} cy={5} r={3} fill="#fff" /><path d={`M${cx},-28 l3,8 l8,3 l-8,3 l-3,8 l-3,-8 l-8,-3 l8,-3 Z`} fill="#fff6a0" /></g>;
    return <g key={cx}><ellipse cx={cx} cy={0} rx={10} ry={12} fill={K} /><circle cx={cx - 3} cy={-4} r={3.5} fill="#fff" /></g>;
  };
  return (
    <g transform={`translate(${640 + shake},990) rotate(${tilt})`}>
      {/* 身體＝躺著的馬鈴薯，被子蓋住下半 */}
      <ellipse cx={90} cy={-10} rx={230} ry={95} fill="#f1d27a" stroke={K} strokeWidth={7} />
      {[[60, -60], [180, -40], [240, 20], [20, 30]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={7} fill="#c9a24c" />)}
      <path d="M40,-60 Q200,-90 330,-20 L330,60 Q180,90 20,60 Z" fill="#9fc4e8" stroke={K} strokeWidth={6} />
      <path d="M40,-60 Q200,-90 330,-20" stroke="#fff" strokeWidth={10} fill="none" opacity={0.6} />
      {/* 臉（左邊、朝向醫生）*/}
      <g transform="translate(-60,-30)">
        {eye(-34)}{eye(30)}
        <ellipse cx={-62} cy={30} rx={16} ry={9} fill="#ff9c9c" opacity={0.6} />
        <ellipse cx={58} cy={30} rx={16} ry={9} fill="#ff9c9c" opacity={0.6} />
        {open > 0.08 || shock ? <ellipse cx={0} cy={38} rx={12 + 8 * Math.max(open, shock ? 0.7 : 0)} ry={5 + 14 * Math.max(open, shock ? 0.9 : 0)} fill="#7a2a2a" stroke={K} strokeWidth={4} />
          : <path d={worried || sad ? "M-12,42 Q0,32 12,42" : "M-12,38 Q0,48 12,38"} stroke={K} strokeWidth={5} fill="none" strokeLinecap="round" />}
        {worried && <path d={`M62,${-40 + ((f / 2) % 20)} q10,16 0,24 q-10,-8 0,-24 Z`} fill="#7fd0ff" stroke={K} strokeWidth={3} />}
        {sad && [-34, 30].map((x) => <path key={x} d={`M${x},16 q-6,${18 + ((f / 1.5) % 30)} 0,${28 + ((f / 1.5) % 30)} q6,-10 0,-${28 + ((f / 1.5) % 30)} Z`} fill="#7fd0ff" opacity={0.9} />)}
        {shock && [0, 1, 2].map((i) => <line key={i} x1={-70 + i * 60} y1={-60} x2={-80 + i * 70} y2={-95} stroke={K} strokeWidth={6} strokeLinecap="round" />)}
      </g>
    </g>
  );
};

// 牆上浮出「窮」的徵兆
const ICONS = ["💸", "☕", "⏰", "💻", "🚇", "🍜"];
const Icons: React.FC<{ t: number }> = ({ t }) => {
  const { fps } = useVideoConfig();
  if (t < AT.d2.at + 1.4) return null;
  return (
    <g>
      {ICONS.map((e, i) => {
        const k = spring({ frame: Math.round((t - AT.d2.at - 1.4 - i * 0.12) * fps), fps, config: { damping: 10 } });
        return <text key={e} x={120 + (i % 3) * 130} y={470 + Math.floor(i / 3) * 125} fontSize={92 * k} textAnchor="middle" dominantBaseline="middle">{e}</text>;
      })}
    </g>
  );
};

const Caption: React.FC<{ text: string; len: number }> = ({ text, len }) => {
  const f = useCurrentFrame();
  const op = interpolate(f, [0, 4, len - 5, len], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 300, opacity: op }}>
      <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 58, lineHeight: 1.35, color: "#fff", textAlign: "center", whiteSpace: "pre-line", WebkitTextStroke: "10px #000", paintOrder: "stroke fill", maxWidth: 980 }}>{text}</div>
    </AbsoluteFill>
  );
};
const Bubble: React.FC<{ text: string; len: number }> = ({ text, len }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = spring({ frame: f, fps, config: { damping: 12 } }) * interpolate(f, [len - 5, len], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "flex-end", paddingTop: 620, paddingRight: 40 }}>
      <div style={{ transform: `scale(${k})`, transformOrigin: "right center", fontFamily: SANS, fontWeight: 900, fontSize: 46, background: "#ffd426", color: "#1c1c1c", padding: "14px 26px", borderRadius: 16, border: "4px solid #1c1c1c" }}>{text}</div>
    </AbsoluteFill>
  );
};

export const Hospital: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const flat = t >= FAINT + 0.2;
  // 運鏡：說到「窮」「上班」推近醫生，病人驚嚇時推近病人＋震動
  const zoomDoc = Math.max(interpolate(t, [AT.d2.at + 0.8, AT.d2.at + 1.3, AT.p3.at - 0.2, AT.p3.at + 0.2], [0, 1, 1, 0], clamp), interpolate(t, [AT.d4.at - 0.6, AT.d4.at, AT.p5.at - 0.1, AT.p5.at], [0, 1, 1, 0], clamp));
  const zoomPat = interpolate(t, [AT.p5.at, AT.p5.at + 0.3, FAINT + 1.6, FAINT + 2.2], [0, 1, 1, 0], { ...clamp, easing: ease });
  // 平常：病床＋兩個角色撐滿畫面寬（1.35 倍）；特寫：醫生 2.2 倍、病人 2.1 倍
  const s = 1.35 + 0.85 * zoomDoc + 0.75 * zoomPat;
  const cx = 575 + (300 - 575) * zoomDoc + (600 - 575) * zoomPat, cy = 960 + (1000 - 960) * zoomDoc + (980 - 960) * zoomPat;
  const shake = between(t, AT.p5.at, AT.p5.at + 0.6) ? Math.sin(f * 3) * 10 : 0;
  return (
    <AbsoluteFill style={{ background: "#e9e6df" }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        <g transform={`translate(${540 - s * cx + shake},${960 - s * cy}) scale(${s})`}>
          <Room f={f} flat={flat} />
          <Icons t={t} />
          <Patient t={t} f={f} />
          <Doctor t={t} f={f} />
        </g>
      </svg>
      {T.map((l) => (
        <Sequence key={l.f} from={sec(l.at) - 3} durationInFrames={sec(l.len) + 9}><Caption text={l.zh} len={sec(l.len) + 9} /></Sequence>
      ))}
      <Sequence from={sec(AT.p2.at + 0.4)} durationInFrames={sec(2.6)}><Bubble text="這是啥病？太可怕了" len={sec(2.6)} /></Sequence>
      <Sequence from={sec(AT.d4.at + 0.5)} durationInFrames={sec(2.2)}><Bubble text="上…上班？！" len={sec(2.2)} /></Sequence>
      <Sequence from={sec(FAINT + 0.9)} durationInFrames={sec(2.3)}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", paddingBottom: 500 }}>
          <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 90, color: "#ff3b3b", WebkitTextStroke: "10px #fff", paintOrder: "stroke fill", transform: "rotate(-6deg)" }}>以為是重症<br />沒想到是絕症</div>
        </AbsoluteFill>
      </Sequence>
      {T.map((l) => <Sequence key={"a" + l.f} from={sec(l.at)}><Audio src={staticFile(`hosp/vo/${l.f}.wav`)} /></Sequence>)}
      {Array.from({ length: Math.floor(FAINT) }, (_, i) => <Sequence key={"b" + i} from={sec(i + 0.3)}><Audio src={staticFile("sfx/beep.wav")} volume={0.12} /></Sequence>)}
      <Sequence from={sec(AT.d2.at + 1.1)}><Audio src={staticFile("sfx/dundun.wav")} volume={0.7} /></Sequence>
      <Sequence from={sec(AT.p4.at - 0.1)}><Audio src={staticFile("sfx/sparkle.wav")} volume={0.4} /></Sequence>
      <Sequence from={sec(AT.d4.at + 0.4)}><Audio src={staticFile("sfx/dundun.wav")} volume={0.8} /></Sequence>
      <Sequence from={sec(FAINT + 0.2)}><Audio src={staticFile("sfx/flatline.wav")} volume={0.35} /></Sequence>
    </AbsoluteFill>
  );
};
