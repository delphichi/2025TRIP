// 第 6 集《焦慮的失眠症》（9:16，中文，無縫循環）：桃子小姐 × 糰糰醫生。
// 她講一長串煩惱 → 醫生打瞌睡 → 她自己想通「睡前把擔心寫在紙上、手機放客廳」→ 發現醫生睡著 → 醫生醒來「掛號費五百」→ 接回開頭。
// 沒有片尾（循環），品牌放角落；全片時鐘滴答（頭尾接得起來）。配音 scripts/insomnia_vo.sh，對嘴 src/insomniaEnv.ts。
import React from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp } from "./Nochebuena";
import { ENV } from "./insomniaEnv";
import { Dango, Expr } from "./Mascots";
import { LExpr, MissPeach } from "./MissPeach";

const FPS = 30;
const sec = (s: number) => Math.round(s * FPS);
const SANS = '"PingFang TC", "Noto Sans TC", sans-serif';
type Who = "p" | "d";
const LINES: { f: string; who: Who; zh: string; pre?: number }[] = [
  { f: "m1", who: "p", zh: "醫生……我已經三天沒睡了。" },
  { f: "m2", who: "d", zh: "睡前都在想什麼？" },
  { f: "m3", who: "p", zh: "明天的會議、這個月的帳單、十年後的房價、\n地球暖化，還有我國中講錯的一句話……" },
  { f: "m4", who: "p", zh: "……還是說，睡前把擔心的事寫在紙上，\n手機放客廳，會不會比較好？" },
  { f: "m5", who: "p", zh: "醫生？你還在聽嗎？醫生！" },
  { f: "m6", who: "d", zh: "嗯……你說得很好。掛號費五百。", pre: 0.4 },
];
const DUR: Record<string, number> = { m1: 3.25, m2: 1.25, m3: 5.42, m4: 6.5, m5: 3.25, m6: 2.14 };
const T = (() => {
  let t = 0.05;
  return LINES.map((l) => {
    const at = t + (l.pre ?? 0), len = DUR[l.f];
    t = at + len + 0.2;
    return { ...l, at, len };
  });
})();
const AT = Object.fromEntries(T.map((l) => [l.f, l]));
const END = AT.m6.at + AT.m6.len + 0.15;
export const I_DUR = sec(END);

const mouthAt = (who: Who, t: number) => {
  const l = T.find((x) => x.who === who && t >= x.at && t < x.at + x.len);
  return l ? ENV[l.f]?.[Math.floor((t - l.at) * FPS)] ?? 0 : 0;
};
const after = (t: number, f: string, d = 0) => t >= AT[f].at + d;

// 鏡頭（切鏡）：[開始秒, 放大倍數, 中心 x, 中心 y, 結束時再推近多少]
const SHOTS: [number, number, number, number, number][] = [
  [0, 2.2, 720, 820, 0.12], // 開場：她黑眼圈特寫（Hook）
  [AT.m2.at - 0.1, 1.8, 290, 1420, 0.05], // 醫生
  [AT.m3.at - 0.1, 1.4, 730, 780, 0.08], // 她講煩惱，泡泡冒出
  [AT.m3.at + 2.9, 1.0, 540, 1150, 0.04], // 雙人：醫生在旁邊打瞌睡
  [AT.m4.at - 0.1, 2.1, 720, 820, 0.1], // 她想通了
  [AT.m5.at - 0.1, 1.0, 540, 1150, 0.03], // 雙人：發現醫生睡著
  [AT.m6.at - 0.3, 2.2, 290, 1400, 0.06], // 醫生醒來
  [AT.m6.at + 1.15, 2.2, 720, 820, 0.04], // 她聽到「五百」變臉
];
const camAt = (t: number) => {
  let i = 0;
  for (let k = 0; k < SHOTS.length; k++) if (t >= SHOTS[k][0]) i = k;
  const [t0, s, x, y, push] = SHOTS[i], t1 = SHOTS[i + 1]?.[0] ?? END;
  const k = interpolate(t, [t0, t1], [0, 1], clamp);
  const sc = s * (1 + push * k);
  const hw = 540 / sc, hh = 960 / sc;
  return { s: sc, x: Math.min(Math.max(x, hw), 1080 - hw), y: Math.min(Math.max(y, hh), 1920 - hh) };
};

// 她的表情
const peachAt = (t: number, f: number): { e: LExpr; tilt: number } => {
  const open = mouthAt("p", t);
  if (after(t, "m6", 1.15)) return { e: { eye: "annoyed", mouth: "pout", brow: "angry", look: -1, fx: ["anger"] }, tilt: -4 };
  if (after(t, "m5", -0.1)) return { e: { eye: "shock", mouth: "o", brow: "up", look: -1, open, fx: ["shock"] }, tilt: 6 };
  if (after(t, "m4", 0.5)) return { e: { eye: "star", mouth: "open", brow: "up", open, fx: ["sparkle"] }, tilt: -3 + Math.sin(f / 10) * 1.5 };
  if (after(t, "m3", -0.1)) return { e: { eye: "open", mouth: "flat", brow: "sad", open, fx: ["sweat"], look: Math.sin(f / 7) * 0.6 }, tilt: Math.sin(f / 4) * 2 };
  return { e: { eye: "tired", mouth: "flat", brow: "sad", open, fx: ["sweat"] }, tilt: -4 };
};
// 醫生的表情
const dangoAt = (t: number, f: number): { e: Expr; tilt: number } => {
  const open = mouthAt("d", t);
  if (after(t, "m6", -0.3)) return { e: { eye: "dot", mouth: "smile", open, fx: after(t, "m6", 1.15) ? [] : ["sparkle"] }, tilt: 0 };
  if (after(t, "m3", 3.3)) return { e: { eye: "closed", mouth: "o", fx: ["zzz"] }, tilt: 8 + Math.sin(f / 12) * 4 };
  if (after(t, "m3", 1.8)) return { e: { eye: "line", mouth: "flat" }, tilt: Math.max(0, Math.sin(f / 6)) * 7 };
  if (after(t, "m2", -0.1)) return { e: { eye: "line", mouth: "flat", open }, tilt: 0 };
  return { e: { eye: "dot", mouth: "flat" }, tilt: 0 };
};

// 深夜病房
const Room: React.FC = () => (
  <g>
    <defs><linearGradient id="nightWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3d4266" /><stop offset="1" stopColor="#555a82" /></linearGradient></defs>
    <rect width={1080} height={1740} fill="url(#nightWall)" />
    <rect y={1740} width={1080} height={180} fill="#2c2f47" />
    <rect y={1300} width={1080} height={16} fill="#6a6f99" />
    {/* 窗＋月亮 */}
    <rect x={90} y={300} width={300} height={380} rx={14} fill="#1c2140" stroke="#2a2420" strokeWidth={8} />
    <circle cx={290} cy={400} r={46} fill="#fff4c4" />
    <circle cx={312} cy={388} r={42} fill="#1c2140" />
    {[[150, 380], [200, 560], [330, 610], [170, 470]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={4} fill="#fff" opacity={0.8} />)}
    <line x1={240} y1={300} x2={240} y2={680} stroke="#2a2420" strokeWidth={6} />
    {/* 時鐘 3:00 */}
    <g transform="translate(830,330)">
      <circle r={86} fill="#f5f1e6" stroke="#2a2420" strokeWidth={8} />
      {Array.from({ length: 12 }, (_, i) => <line key={i} x1={Math.sin((i * Math.PI) / 6) * 66} y1={-Math.cos((i * Math.PI) / 6) * 66} x2={Math.sin((i * Math.PI) / 6) * 76} y2={-Math.cos((i * Math.PI) / 6) * 76} stroke="#2a2420" strokeWidth={5} />)}
      <line x1={0} y1={0} x2={0} y2={-56} stroke="#2a2420" strokeWidth={7} strokeLinecap="round" />
      <line x1={0} y1={0} x2={44} y2={0} stroke="#2a2420" strokeWidth={9} strokeLinecap="round" />
      <circle r={7} fill="#2a2420" />
    </g>
    {/* 病床（在她身後）*/}
    <rect x={560} y={1420} width={480} height={60} rx={14} fill="#dfe4ee" stroke="#2a2420" strokeWidth={6} />
    <rect x={560} y={1476} width={480} height={36} fill="#8f98ad" stroke="#2a2420" strokeWidth={6} />
    <rect x={1000} y={1290} width={34} height={200} rx={10} fill="#b8bfce" stroke="#2a2420" strokeWidth={5} />
    {[600, 1000].map((x) => <rect key={x} x={x - 7} y={1510} width={14} height={220} fill="#6f778c" />)}
  </g>
);

// 煩惱泡泡（跟著台詞一顆顆冒出、她想通時一顆顆破掉）
const WORRIES: [number, string][] = [[0.2, "📅"], [1.0, "💸"], [1.9, "🏠"], [2.8, "🌍"], [3.7, "😳"]];
const Bubbles: React.FC<{ t: number }> = ({ t }) => {
  const { fps } = useVideoConfig();
  if (t < AT.m3.at || t > AT.m4.at + 2.5) return null;
  return (
    <g>
      {WORRIES.map(([d, em], i) => {
        const appear = spring({ frame: Math.round((t - AT.m3.at - d) * fps), fps, config: { damping: 9 } });
        const pop = interpolate(t, [AT.m4.at + 0.5 + i * 0.25, AT.m4.at + 0.7 + i * 0.25], [1, 0], clamp);
        const k = appear * pop;
        // 圍在她頭的兩側（頭中心約 (730, 835)）
        const pos = [[520, 640], [940, 620], [500, 820], [960, 800], [560, 470]][i];
        const x = pos[0], y = pos[1] + Math.sin(t * 2 + i) * 8;
        return k > 0.01 ? (
          <g key={i} transform={`translate(${x},${y}) scale(${k})`}>
            <circle r={58} fill="#fff" stroke="#2a2420" strokeWidth={5} />
            <text y={4} fontSize={64} textAnchor="middle" dominantBaseline="middle">{em}</text>
          </g>
        ) : null;
      })}
      {t > AT.m4.at + 0.5 && (
        <text x={900} y={500} fontSize={110 * spring({ frame: Math.round((t - AT.m4.at - 0.5) * fps), fps, config: { damping: 8 } })} textAnchor="middle">💡</text>
      )}
    </g>
  );
};

const Caption: React.FC<{ text: string; len: number }> = ({ text, len }) => {
  const f = useCurrentFrame();
  const op = interpolate(f, [0, 3, len - 4, len], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 260, opacity: op }}>
      <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 54, lineHeight: 1.35, color: "#fff", textAlign: "center", whiteSpace: "pre-line", WebkitTextStroke: "10px #1a1626", paintOrder: "stroke fill", maxWidth: 1000 }}>{text}</div>
    </AbsoluteFill>
  );
};

export const Insomnia: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const c = camAt(t);
  const p = peachAt(t, f), d = dangoAt(t, f);
  const jolt = after(t, "m6", -0.3) && !after(t, "m6", 0.1) ? Math.sin(f * 3) * 10 : 0;
  return (
    <AbsoluteFill style={{ background: "#3d4266" }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        <g transform={`translate(${540 - c.s * c.x},${960 - c.s * c.y}) scale(${c.s})`}>
          <Room />
          <Dango e={d.e} x={290 + jolt} y={1730} s={1.6} tilt={d.tilt} />
          <MissPeach e={p.e} x={730} y={1730} s={0.92} tilt={p.tilt} breathe={Math.sin(f / 18)} />
          <Bubbles t={t} />
        </g>
      </svg>
      {/* 品牌放角落（循環片不放片尾）*/}
      <div style={{ position: "absolute", top: 70, left: 40, fontFamily: "Montserrat, Arial", fontWeight: 800, fontSize: 26, color: "rgba(255,255,255,.75)", letterSpacing: 2 }}>ASATEX · @asatex.chile</div>
      {T.map((l) => <Sequence key={l.f} from={Math.max(0, sec(l.at) - 2)} durationInFrames={sec(l.len) + 6}><Caption text={l.zh} len={sec(l.len) + 6} /></Sequence>)}
      {T.map((l) => <Sequence key={"a" + l.f} from={sec(l.at)}><Audio src={staticFile(`insomnia/vo/${l.f}.wav`)} /></Sequence>)}
      {Array.from({ length: Math.ceil(END) }, (_, i) => <Sequence key={"t" + i} from={sec(i + 0.5)}><Audio src={staticFile("sfx/tick.wav")} volume={0.25} /></Sequence>)}
      {[AT.m3.at + 3.6, AT.m4.at + 1.6, AT.m4.at + 4.2, AT.m5.at + 1.0].map((s, i) => <Sequence key={"z" + i} from={sec(s)}><Audio src={staticFile("sfx/snore.wav")} volume={0.35} /></Sequence>)}
      <Sequence from={sec(AT.m4.at + 0.5)}><Audio src={staticFile("sfx/ding.wav")} volume={0.4} /></Sequence>
      <Sequence from={sec(AT.m6.at + 1.15)}><Audio src={staticFile("sfx/cash.wav")} volume={0.45} /></Sequence>
    </AbsoluteFill>
  );
};
