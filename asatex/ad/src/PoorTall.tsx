// 「你這個病叫做窮」細長角色導演版（9:16）：2D 診間背景（Gemini，雙人鏡輕虛化／單人鏡重虛化）＋ DangoTall × PotatoTall，
// 誰講話鏡頭給誰、單人鏡越問越近、「上班」前停一拍＋急推、大字跳字幕、最後雙人鏡驚嚇→昏倒。配音沿用 hosp/vo、對嘴 hospEnv。
import React from "react";
import { AbsoluteFill, Audio, Easing, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, ease } from "./Nochebuena";
import { ENV } from "./hospEnv";
import { Expr } from "./Mascots";
import { DangoTall, Pose, PotatoTall } from "./TallCast";

const FPS = 30;
const sec = (s: number) => Math.round(s * FPS);
const SANS = '"PingFang TC", "Noto Sans TC", sans-serif';
type Who = "p" | "d";
const LINES: { f: string; who: Who; zh: string; pre?: number }[] = [
  { f: "p1", who: "p", zh: "醫生，我是不是很嚴重？\n我每天都好累，什麼都不想做……" },
  { f: "d1", who: "d", zh: "你要有心理準備。" },
  { f: "p2", who: "p", zh: "我……還能活多久？" },
  { f: "d2", who: "d", zh: "你這個病，叫做……「窮」。", pre: 0.2 },
  { f: "p3", who: "p", zh: "那……有藥醫嗎？" },
  { f: "d3", who: "d", zh: "有啊。" },
  { f: "p4", who: "p", zh: "是什麼藥？！" },
  { f: "d4", who: "d", zh: "上班。", pre: 0.9 },
  { f: "p5", who: "p", zh: "這……這比絕症還可怕！" },
];
const DUR: Record<string, number> = { p1: 5.06, d1: 1.16, p2: 2.09, d2: 2.51, p3: 2.41, d3: 0.7, p4: 1.3, d4: 0.65, p5: 2.6 };
const T = (() => {
  let t = 0.1;
  return LINES.map((l) => {
    const at = t + (l.pre ?? 0), len = DUR[l.f];
    t = at + len + 0.18;
    return { ...l, at, len };
  });
})();
const AT = Object.fromEntries(T.map((l) => [l.f, l]));
const at = (f: string, d = 0) => AT[f].at + d;
const FAINT = at("p5", AT.p5.len - 0.3);
export const PT_DUR = sec(FAINT + 2.6);
const mouthAt = (who: Who, t: number) => {
  const l = T.find((x) => x.who === who && t >= x.at && t < x.at + x.len);
  return l ? ENV[l.f]?.[Math.floor((t - l.at) * FPS)] ?? 0 : 0;
};

type Kind = "two" | "doc" | "pat";
const FRAME: Record<Kind, { s: number; x: number; y: number }> = {
  two: { s: 1, x: 540, y: 960 },
  doc: { s: 1.85, x: 300, y: 700 },
  pat: { s: 1.85, x: 795, y: 720 },
};
// 每一鏡：開始秒、鏡頭、放大加成（越問越近）、鏡內推近、急推目標
const SHOTS: { t: number; k: Kind; zoom?: number; push: number; crash?: { at: number; zoom: number } }[] = [
  { t: 0, k: "two", push: 0.06 },
  { t: at("p1", 2.4), k: "pat", push: 0.08 },
  { t: at("d1", -0.1), k: "doc", push: 0.06 },
  { t: at("p2", -0.1), k: "pat", zoom: 1.12, push: 0.06 },
  { t: at("d2", -0.3), k: "doc", push: 0.06, crash: { at: at("d2", 1.5), zoom: 1.35 } }, // 說到「窮」急推
  { t: at("p3", -0.1), k: "pat", push: 0.05 },
  { t: at("d3", -0.1), k: "doc", push: 0.04 },
  { t: at("p4", -0.1), k: "pat", zoom: 1.3, push: 0.08 },
  { t: at("d4", -0.9), k: "doc", zoom: 1.15, push: 0.02, crash: { at: at("d4", -0.12), zoom: 1.5 } }, // 停一拍→急推「上班」
  { t: at("p5", -0.1), k: "two", push: 0.03 },
];
const camAt = (t: number) => {
  let i = 0;
  for (let k = 0; k < SHOTS.length; k++) if (t >= SHOTS[k].t) i = k;
  const sh = SHOTS[i], t1 = SHOTS[i + 1]?.t ?? PT_DUR / FPS;
  const fr = FRAME[sh.k];
  let s = fr.s * (sh.zoom ?? 1) * (1 + sh.push * interpolate(t, [sh.t, t1], [0, 1], clamp));
  if (sh.crash) s *= 1 + (sh.crash.zoom - 1) * interpolate(t, [sh.crash.at, sh.crash.at + 0.15], [0, 1], { ...clamp, easing: ease });
  const hw = 540 / s, hh = 960 / s;
  return { s, x: Math.min(Math.max(fr.x, hw), 1080 - hw), y: Math.min(Math.max(fr.y, hh), 1920 - hh), k: sh.k };
};

const patAt = (t: number, f: number): { e: Expr; p: Pose } => {
  const open = mouthAt("p", t);
  if (t >= FAINT) {
    // 腿一軟往下滑：整個人沉下去、微微歪向一邊，只剩暈眩的頭留在畫面裡
    const k = interpolate(t, [FAINT, FAINT + 0.35], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
    return { e: { eye: "dizzy", mouth: "wavy", fx: ["spin"] }, p: { bob: 480 * k, lean: -18 * k, armL: 60 + 60 * k, armR: 60 + 60 * k, tilt: 12 * k } };
  }
  if (t >= at("d4", 0.3)) return { e: { eye: "shock", mouth: "o", open, fx: ["shock"] }, p: { armL: 150, armR: 150, tilt: Math.sin(f * 2.2) * 5, bob: Math.sin(f * 2.6) * 6 } };
  if (t >= at("p4", -0.1)) return { e: { eye: "star", mouth: "open", open, fx: ["sparkle"] }, p: { armL: 120, armR: 120, bob: -Math.abs(Math.sin(f / 4)) * 14 } };
  if (t >= at("p3", -0.1)) return { e: { eye: "sad", mouth: "frown", open }, p: { armL: 25, armR: 70, tilt: -6 } };
  if (t >= at("p2", -0.1)) return { e: { eye: "tears", mouth: "open", open }, p: { armL: 140, armR: 140, tilt: 6 } };
  return { e: { eye: "sad", mouth: "frown", open, fx: ["sweat"] }, p: { armL: 18, armR: 40 + Math.sin(f / 7) * 10, tilt: -4 } };
};
const docAt = (t: number, f: number): { e: Expr; p: Pose } => {
  const open = mouthAt("d", t);
  const glint = (t >= at("d2", 1.5) && t < at("d2", 2.0)) || (t >= at("d4") && t < at("d4", 0.5));
  if (t >= at("p5")) return { e: { eye: "line", mouth: "flat" }, p: { armL: 10, armR: 10 } };
  if (t >= at("d4", -0.9)) return { e: { eye: "line", mouth: "flat", open, fx: glint ? ["sparkle"] : [] }, p: { armR: 50, armL: 8 } };
  if (t >= at("d2", -0.3)) return { e: { eye: "line", mouth: "flat", open, fx: glint ? ["sparkle"] : [] }, p: { armR: t >= at("d2", 1.5) ? 145 : 30, armL: 8 } };
  if (t >= at("d1", -0.1)) return { e: { eye: "line", mouth: "flat", open }, p: { armR: 22, armL: 8 } };
  return { e: { eye: "dot", mouth: "flat" }, p: { armR: 12, armL: 8 } };
};

const BIG: { t: number; text: string; color?: string; size?: number; dur?: number; top?: number }[] = [
  { t: at("p1", 0.3), text: "很嚴重？", color: "#ffffff", dur: 1.8 },
  { t: at("p2", 0.4), text: "還能活多久？", color: "#8fd3ff", dur: 1.6, size: 130 },
  { t: at("d2", 1.5), text: "窮", color: "#ff5a5a", size: 300, dur: 1.2 },
  { t: at("p4", 0.1), text: "什麼藥？！", color: "#ffd23f", dur: 1.2 },
  { t: at("d4"), text: "上班。", color: "#ffffff", size: 220, dur: 1.1 },
  { t: at("p5", 0.3), text: "比絕症還可怕！", color: "#ff6b8a", size: 120, dur: 2.2 },
];
const BigWord: React.FC<{ text: string; color: string; size: number; len: number; top: number }> = ({ text, color, size, len, top }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = spring({ frame: f, fps, config: { damping: 10, stiffness: 180 } });
  const out = interpolate(f, [len - 4, len], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: top, opacity: out }}>
      <div style={{ transform: `scale(${0.4 + 0.6 * k}) rotate(${(1 - k) * -8}deg)`, fontFamily: SANS, fontWeight: 900, fontSize: size, color, WebkitTextStroke: "16px #1a1626", paintOrder: "stroke fill", textShadow: "0 10px 0 rgba(0,0,0,.25)", whiteSpace: "nowrap" }}>{text}</div>
    </AbsoluteFill>
  );
};
const Caption: React.FC<{ text: string; len: number }> = ({ text, len }) => {
  const f = useCurrentFrame();
  const op = interpolate(f, [0, 3, len - 4, len], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 440, opacity: op }}>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 46, lineHeight: 1.35, color: "#fff", textAlign: "center", whiteSpace: "pre-line", WebkitTextStroke: "8px #1a1626", paintOrder: "stroke fill", maxWidth: 1000 }}>{text}</div>
    </AbsoluteFill>
  );
};

export const PoorTall: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const c = camAt(t);
  const P = patAt(t, f), D = docAt(t, f);
  const shake = t >= at("p5") && t < at("p5", 0.5) ? Math.sin(f * 4) * 14 : 0;
  const end = interpolate(t, [FAINT + 0.5, FAINT + 0.8], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: "#f3e6d6", overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 1080, height: 1920, transformOrigin: "0 0", transform: `translate(${540 - c.s * c.x + shake}px,${960 - c.s * c.y}px) scale(${c.s})` }}>
        <Img src={staticFile(c.k === "two" ? "clinic/blur.png" : "clinic/blur_close.png")} style={{ position: "absolute", width: 1080, height: 1920 }} />
        <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: "absolute" }}>
          <defs><radialGradient id="ptsh"><stop offset="0" stopColor="#3a2a20" stopOpacity="0.32" /><stop offset="1" stopColor="#3a2a20" stopOpacity="0" /></radialGradient></defs>
          {c.k !== "pat" && <><ellipse cx={290} cy={1610} rx={190} ry={32} fill="url(#ptsh)" /><DangoTall e={D.e} p={D.p} x={290} y={1600} s={1.1} /></>}
          {c.k !== "doc" && <><ellipse cx={800} cy={1610} rx={190} ry={32} fill="url(#ptsh)" /><PotatoTall e={P.e} p={P.p} x={800} y={1600} s={1.1} /></>}
        </svg>
      </div>
      <div style={{ position: "absolute", top: 210, left: 40, fontFamily: "Montserrat, Arial", fontWeight: 800, fontSize: 26, color: "rgba(60,40,30,.5)", letterSpacing: 2 }}>ASATEX · @asatex.chile</div>
      {BIG.map((b, i) => <Sequence key={"b" + i} from={sec(b.t)} durationInFrames={sec(b.dur ?? 1)}><BigWord text={b.text} color={b.color ?? "#fff"} size={b.size ?? 150} len={sec(b.dur ?? 1)} top={b.top ?? 1150} /></Sequence>)}
      {T.map((l) => <Sequence key={l.f} from={Math.max(0, sec(l.at) - 2)} durationInFrames={sec(l.len) + 5}><Caption text={l.zh} len={sec(l.len) + 5} /></Sequence>)}
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", opacity: end, paddingTop: 230 }}>
        <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 96, lineHeight: 1.2, textAlign: "center", color: "#ff3b3b", WebkitTextStroke: "14px #fff", paintOrder: "stroke fill", transform: `rotate(-6deg) scale(${0.8 + 0.2 * end})` }}>以為是重症<br />沒想到是絕症</div>
      </AbsoluteFill>
      {T.map((l) => <Sequence key={"a" + l.f} from={sec(l.at)}><Audio src={staticFile(`hosp/vo/${l.f}.wav`)} /></Sequence>)}
      <Audio src={staticFile("sfx/pluck.wav")} volume={0.06} />
      {Array.from({ length: Math.floor(FAINT) }, (_, i) => <Sequence key={"bp" + i} from={sec(i + 0.3)}><Audio src={staticFile("sfx/beep.wav")} volume={0.1} /></Sequence>)}
      <Sequence from={sec(at("d2", 1.45))}><Audio src={staticFile("sfx/dundun.wav")} volume={0.7} /></Sequence>
      <Sequence from={sec(at("p4", -0.1))}><Audio src={staticFile("sfx/sparkle.wav")} volume={0.4} /></Sequence>
      <Sequence from={sec(at("d4", -0.2))}><Audio src={staticFile("sfx/whoosh.wav")} volume={0.5} /></Sequence>
      <Sequence from={sec(at("d4", 0.35))}><Audio src={staticFile("sfx/dundun.wav")} volume={0.8} /></Sequence>
      <Sequence from={sec(FAINT + 0.2)}><Audio src={staticFile("sfx/flatline.wav")} volume={0.35} /></Sequence>
    </AbsoluteFill>
  );
};
