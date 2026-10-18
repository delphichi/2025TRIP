// 洗碗手套一鏡到底：同一張廚房圖，照 PocketCall 的 CAM 關鍵格手法運鏡。橫式 Guantes（16:9）、直式 GuantesV（9:16）共用台詞與時間軸，只換圖和五個鏡位。
// 手套特寫慢拉「¿Sabes qué?」→ 女孩中景 → 全景男孩發問 → 推近兩人上半身 → 男孩中景 → 片尾 logo＋地址＋WhatsApp＋旁白「Si es Asatex, es seguro.」
import React from "react";
import { loadFont } from "@remotion/fonts";
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { clamp, ease } from "./Nochebuena";

loadFont({ family: "Montserrat", url: staticFile("showroom/Montserrat.ttf"), weight: "100 900" });
loadFont({ family: "Plex Mono", url: staticFile("showroom/PlexMono-Medium.ttf"), weight: "500" });
const SANS = "Montserrat, Helvetica Neue, Arial, sans-serif";
const MONO = '"Plex Mono", ui-monospace, monospace';
const GOLD = "#d9b26a";

export const G_FPS = 30;
const sec = (s: number) => Math.round(s * G_FPS);

// 劇本：每句台詞配一個鏡位（順序一一對應）；dur＝每句實際秒數（跑配音腳本後照印出的數字更新）
// vo＝配音資料夾（片尾旁白固定叫 n1.wav）；slogan＝片尾口號（直式會在兩段之間換行）；overlays＝某句台詞期間疊在畫面上的特效
export type Script = {
  lines: readonly { f: string; es: string; sub?: false; pre?: number }[]; // sub: false＝這句不上字幕；pre＝這一鏡切進來後先停幾秒才開口（製造笑點前的停頓）
  dur: Record<string, number>;
  vo: string;
  slogan: [string, string];
  overlays?: Record<string, React.FC<{ len: number }>>;
  // 關燈：從 from 那句開口後 delay 秒，畫面淡到「暗版」圖（map：原圖→暗版），到 to 那句講完再亮回來
  dark?: { map: Record<string, string>; from: string; to: string; delay?: number };
  // 背景音（public/sfx/，scripts/sfx_bank.py 合成）：從 from 那一鏡切進來開始（沒給＝片頭），到 until 那一鏡切進來前停（沒給＝片尾），前後淡入淡出
  beds?: { src: string; volume: number; from?: string; until?: string }[];
  // 音效：在 at 那句開口時（加 offset 秒）播一次
  sfx?: { src: string; at: string; offset?: number; volume?: number }[];
  pace?: Partial<Pace>; // 節奏；沒給就用 PACE 預設（洗碗手套片的節奏）
};
// 節奏（秒）：start 第一句前、first 第一句後、move 換鏡運鏡、lead 運鏡開始後多久開口、gap 每句講完停多久、
// tail 最後一句到片尾、endLen 片尾長度、endVo 片尾出現後多久念旁白。FB/IG 要 30 秒內時用緊的節奏。
// cut：直接切鏡（每鏡固定、只慢慢微推近，換人講話就切），不再運鏡移過去 —— 一鏡到底甩太快會暈（DelphiChi 2026-10-15）
export type Pace = { start: number; first: number; move: number; lead: number; gap: number; tail: number; endLen: number; endVo: number; cut: boolean };
const PACE: Pace = { start: 0.5, first: 0.3, move: 1.0, lead: 0.45, gap: 0.25, tail: 0.2, endLen: 4.2, endVo: 0.7, cut: false };
export const PACE_SHORT: Partial<Pace> = { start: 0.2, first: 0.15, move: 0.6, lead: 0.15, gap: 0.1, tail: 0.1, endLen: 2.7, endVo: 0.3 };
export const PACE_CUT: Partial<Pace> = { start: 0.2, first: 0.15, lead: 0.12, gap: 0.2, tail: 0.1, endLen: 2.7, endVo: 0.3, cut: true };
const GUANTES: Script = {
  vo: "guantes/vo",
  slogan: ["Si es Asatex,", "es seguro."],
  dur: { g1: 0.93, g2: 2.83, b1: 2.0, g3: 2.79, b2: 1.9, n1: 2.0 },
  lines: [
    { f: "g1", es: "¿Sabes qué?" },
    { f: "g2", es: "Para lavar la loza, necesitas guantes Asatex." },
    { f: "b1", es: "¿Y los guantes Asatex no se rompen?" },
    { f: "g3", es: "Los guantes Asatex son súper cómodos." },
    { f: "b2", es: "¿Y dónde compro guantes Asatex?" },
  ],
};

// 鏡位：放大倍數 s、對準的點（原圖像素座標）；第一個鏡位講話時從 s 慢慢拉到 s2
// o：視差繞拍位置（-1～1，左右）；r：畫面傾斜角度（度，荷蘭角）
// img：這一鏡用哪張場景圖（換場景，例如房間→夜店；尺寸要跟 Layout 的 iw×ih 一樣），沒給就用 Layout.img
// s2/x2/y2：這一鏡講話期間鏡頭從 (s,x,y) 慢慢移到 (s2,x2,y2) —— 拉遠用 s2、由上往下掃用 y2；沒給就只微推近 4%
export type Shot = { s: number; x: number; y: number; s2?: number; x2?: number; y2?: number; o?: number; r?: number; img?: string };
// layers：2.5D 視差用的三層圖（背景挖掉人物補好、人物去背、前景流理台），沒有就整張圖平移
type Layers = { bg: string; people: string; front: string };
export type Layout = { W: number; H: number; img: string; iw: number; ih: number; shots: readonly Shot[]; vertical: boolean; layers?: Layers; script?: Script };

const H_LAYOUT: Layout = {
  W: 1920, H: 1080, img: "guantes/cocina.png", iw: 1024, ih: 572, vertical: false,
  shots: [
    { s: 3.2, x: 535, y: 400, s2: 2.6 }, // 粉紅手套特寫
    { s: 1.75, x: 495, y: 300 }, // 女孩中景
    { s: 1.0, x: 512, y: 286 }, // 全景
    { s: 1.9, x: 640, y: 262 }, // 兩人上半身
    { s: 2.0, x: 752, y: 272 }, // 男孩中景
  ],
};
export const V_LAYOUT: Layout = {
  W: 1080, H: 1920, img: "guantes/cocina_v.png", iw: 572, ih: 1024, vertical: true,
  shots: [
    { s: 3.0, x: 290, y: 830, s2: 2.5 },
    { s: 1.7, x: 285, y: 680 },
    { s: 1.0, x: 286, y: 512 },
    { s: 1.44, x: 385, y: 650 },
    { s: 2.0, x: 480, y: 640 },
  ],
};
// 直式 2.5D：同鏡位，每次換鏡左右繞一下；男孩問「哪裡買」時畫面歪 -5 度
const V3D_LAYOUT: Layout = {
  ...V_LAYOUT,
  layers: { bg: "guantes/v_bg.png", people: "guantes/v_people.png", front: "guantes/v_front.png" },
  shots: V_LAYOUT.shots.map((sh, i) => ({ ...sh, o: [-0.35, 1, -1, 1, -0.6][i], r: i === 4 ? -5 : 0 })),
};
const PARALLAX = 16; // 繞拍幅度（畫面基準像素）：人物層移這麼多，前景 1.8 倍，背景反向 0.5 倍
const DEPTH = { bg: -0.5, people: 1, front: 1.8 };

// 由台詞長度排出時間軸：第一句從特寫開始，之後每句先運鏡、鏡頭還在動時開口，講完停 0.25 秒
const build = (shots: readonly Shot[], sc: Script) => {
  const cam: { f: number; s: number; x: number; y: number; o: number; r: number; img?: string }[] = [];
  const lines: { f: string; es: string; sub?: false; pre?: number; at: number; len: number }[] = [];
  const endOf = (sh: Shot) => ({ ...sh, s: sh.s2 ?? sh.s * 1.04, x: sh.x2 ?? sh.x, y: sh.y2 ?? sh.y });
  const P = { ...PACE, ...sc.pace };
  let t = P.start;
  sc.lines.forEach((l, i) => {
    const sh = shots[i];
    const d = sc.dur[l.f];
    if (i === 0) {
      const o = sh.o ?? 0, r = sh.r ?? 0;
      cam.push({ f: 0, ...sh, o, r }, { f: sec(t + d + 0.3), ...endOf(sh), o: -o, r });
      lines.push({ ...l, at: t, len: d });
      t += d + P.first;
    } else {
      const o = sh.o ?? 0, r = sh.r ?? 0;
      if (P.cut) {
        // 下一格緊接上一鏡的最後一格 → 插值只有 1 格＝直接切
        cam.push({ f: sec(t) + 1, ...sh, o, r });
        const at = t + P.lead + (l.pre ?? 0);
        lines.push({ ...l, at, len: d });
        t = at + d + P.gap;
        cam.push({ f: sec(t), ...endOf(sh), o: o * 0.6, r }); // 講話時慢慢拉遠／掃過／微推近
        return;
      }
      cam.push({ f: sec(t + P.move), ...sh, o, r });
      const at = t + P.lead;
      lines.push({ ...l, at, len: d });
      t = Math.max(t + P.move, at + d + P.gap);
      cam.push({ f: sec(t), ...sh, s: sh.s * 1.03, o: o * 0.6, r }); // 講話時微微推近、繞回一點，畫面不死
    }
  });
  return { cam, lines, end: t + P.tail, P };
};
export const durOf = (L: Layout) => {
  const b = build(L.shots, L.script ?? GUANTES);
  return sec(b.end + b.P.endLen);
};
export const G_DUR = durOf(H_LAYOUT); // 洗碗手套橫直兩版時間軸相同

const Sub: React.FC<{ text: string; len: number; v: boolean }> = ({ text, len, v }) => {
  const f = useCurrentFrame();
  const op = interpolate(f, [0, 5, len - 6, len], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: v ? 300 : 90, opacity: op }}>
      <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: v ? 52 : 50, lineHeight: 1.3, textAlign: "center", maxWidth: v ? 900 : undefined, color: "#fff", background: "rgba(10,12,18,.55)", padding: "14px 30px", borderRadius: 18 }}>{text}</div>
    </AbsoluteFill>
  );
};

const WhatsApp: React.FC = () => (
  <svg width="54" height="54" viewBox="0 0 48 48" aria-hidden>
    <path d="M24 4C13 4 4 12.8 4 23.7c0 3.6 1 7 2.8 9.9L4 44l10.8-2.8c2.8 1.5 6 2.3 9.2 2.3 11 0 20-8.8 20-19.8S35 4 24 4z" fill="#25d366" />
    <path d="M17.5 13.8c-.5-1.1-1-1.1-1.5-1.1h-1.3c-.4 0-1.2.2-1.8.8-.6.6-2.3 2.2-2.3 5.4s2.4 6.3 2.7 6.7c.3.4 4.6 7.2 11.3 9.9 5.6 2.2 6.7 1.8 7.9 1.7 1.2-.1 3.9-1.6 4.5-3.1.6-1.5.6-2.8.4-3.1-.2-.3-.6-.4-1.3-.8-.7-.3-3.9-1.9-4.5-2.1-.6-.2-1-.3-1.5.3-.4.7-1.7 2.1-2.1 2.6-.4.4-.8.5-1.4.2-.7-.3-2.8-1-5.3-3.3-2-1.7-3.3-3.9-3.7-4.5-.4-.7 0-1 .3-1.4.3-.3.7-.8 1-1.2.3-.4.4-.7.7-1.2.2-.4.1-.9 0-1.2-.2-.4-1.4-3.6-2-4.9z" fill="#fff" />
  </svg>
);

export const IG_HANDLE = "@asatex.chile"; // 官方 Instagram（DelphiChi 2026-10-15）
export const Instagram: React.FC<{ size?: number }> = ({ size = 54 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
    <defs><linearGradient id="igg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#feda75" /><stop offset="0.35" stopColor="#fa7e1e" /><stop offset="0.6" stopColor="#d62976" /><stop offset="1" stopColor="#4f5bd5" /></linearGradient></defs>
    <rect x="3" y="3" width="42" height="42" rx="12" fill="url(#igg)" />
    <rect x="12" y="12" width="24" height="24" rx="7" fill="none" stroke="#fff" strokeWidth="3.2" />
    <circle cx="24" cy="24" r="5.6" fill="none" stroke="#fff" strokeWidth="3.2" />
    <circle cx="32" cy="16" r="1.9" fill="#fff" />
  </svg>
);

const Rise: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const f = useCurrentFrame();
  const k = interpolate(f, [at, at + 14], [0, 1], { ...clamp, easing: ease });
  return <div style={{ opacity: k, transform: `translateY(${(1 - k) * 24}px)` }}>{children}</div>;
};

export const makeGuantes = (L: Layout): React.FC => {
  const sc = L.script ?? GUANTES;
  const { W, H, vertical: v } = L;
  // 圖用 cover 鋪滿畫面：IW×IH 是圖在畫面上的尺寸，OX/OY 是裁掉的邊
  const k0 = Math.max(W / L.iw, H / L.ih);
  const IW = L.iw * k0, IH = L.ih * k0, OX = (IW - W) / 2, OY = (IH - H) / 2;
  const pt = (x: number, y: number) => ({ x: x * k0 - OX, y: y * k0 - OY });
  const { cam, lines, end, P } = build(L.shots, sc);
  const CAM = cam.map((c) => ({ f: c.f, s: c.s, p: pt(c.x, c.y), o: c.o, r: c.r, img: c.img ?? L.img }));
  const pad = L.layers ? PARALLAX * DEPTH.front : 0; // 視差會把圖層推出去，鏡頭要多留這麼多邊

  const camAt = (f: number) => {
    const j = CAM.findIndex((c, n) => n < CAM.length - 1 && f >= c.f && f < CAM[n + 1].f);
    const i = j < 0 ? CAM.length - 2 : j; // 超過最後一格就停在最後鏡位
    const a = CAM[i], b = CAM[i + 1];
    const k = interpolate(f, [a.f, b.f], [0, 1], { ...clamp, easing: ease });
    const r = a.r + (b.r - a.r) * k;
    const o = a.o + (b.o - a.o) * k;
    // 傾斜時畫面四角會轉出去，放大一點補回來
    const rad = (Math.abs(r) * Math.PI) / 180;
    const s = (a.s + (b.s - a.s) * k) * (1 + 0.35 * Math.sin(rad));
    // 鏡頭不能拍到圖外的黑邊：用旋轉後的外框算
    const hw = (W * Math.cos(rad) + H * Math.sin(rad)) / (2 * s) + pad;
    const hh = (W * Math.sin(rad) + H * Math.cos(rad)) / (2 * s) + pad;
    const x = Math.min(Math.max(a.p.x + (b.p.x - a.p.x) * k, -OX + hw), W + OX - hw);
    const y = Math.min(Math.max(a.p.y + (b.p.y - a.p.y) * k, -OY + hh), H + OY - hh);
    return { s, x, y, r, o, img: k >= 0.5 ? b.img : a.img };
  };

  const Bg: React.FC<{ style?: React.CSSProperties; src?: string }> = ({ style, src }) => (
    <Img src={staticFile(src ?? L.img)} style={{ position: "absolute", left: -OX, top: -OY, width: IW, height: IH, ...style }} />
  );
  // 2.5D：三層各自依深度橫移（人物稍微放大，像離鏡頭近一點）
  // 關燈的時間窗（格）
  const dk = sc.dark && (() => {
    const a = lines.find((l) => l.f === sc.dark!.from)!, b = lines.find((l) => l.f === sc.dark!.to)!;
    return { on: sec(a.at + (sc.dark!.delay ?? 0.5)), off: sec(b.at + b.len + 0.15) };
  })();
  const Scene: React.FC<{ o: number; img: string; f: number }> = ({ o, img, f }) => {
    if (!L.layers) {
      const dsrc = sc.dark?.map[img];
      const dop = dk && dsrc ? interpolate(f, [dk.on, dk.on + 5, dk.off, dk.off + 5], [0, 1, 1, 0], clamp) : 0;
      return (
        <>
          <Bg src={img} />
          {dop > 0 && <Bg src={dsrc} style={{ opacity: dop }} />}
        </>
      );
    }
    const d = (k: number) => ({ transform: `translateX(${o * PARALLAX * k}px)` });
    return (
      <>
        <Bg src={L.layers.bg} style={d(DEPTH.bg)} />
        <Bg src={L.layers.people} style={d(DEPTH.people)} />
        <Bg src={L.layers.front} style={d(DEPTH.front)} />
      </>
    );
  };

  // 片尾：廚房圖模糊壓暗當底，logo＋口號＋地址＋WhatsApp
  const EndCard: React.FC = () => {
    const f = useCurrentFrame();
    const bg = interpolate(f, [0, 12], [0, 1], clamp);
    return (
      <AbsoluteFill style={{ opacity: bg, background: "#0b0c0f" }}>
        <Bg style={{ opacity: 0.35, filter: "blur(6px)", transform: `scale(${interpolate(f, [0, sec(P.endLen)], [1.08, 1.0])})` }} />
        <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgba(11,12,15,.55) 0%, rgba(11,12,15,.92) 75%)" }} />
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div style={{ display: "grid", justifyItems: "center", gap: v ? 40 : 28, textAlign: "center" }}>
            <Rise at={4}><Img src={staticFile("showroom/logo.png")} style={{ width: v ? 520 : 400 }} /></Rise>
            <Rise at={12}><div style={{ fontFamily: SANS, fontWeight: 700, fontSize: v ? 72 : 64, lineHeight: 1.2, color: "#fff", letterSpacing: "0.02em" }}>{sc.slogan[0]}{v ? <br /> : " "}{sc.slogan[1]}</div></Rise>
            <Rise at={22}><div style={{ fontFamily: SANS, fontWeight: 500, fontSize: v ? 32 : 30, color: GOLD, letterSpacing: "0.3em" }}>ZOFRI · IQUIQUE · CHILE</div></Rise>
            <Rise at={30}>
              <div style={{ display: "flex", alignItems: "center", gap: 18, border: `2px solid ${GOLD}`, borderRadius: 999, padding: "12px 34px", marginTop: 8 }}>
                <WhatsApp />
                <span style={{ fontFamily: MONO, fontSize: 50, color: "#fff", letterSpacing: 2 }}>+56 9 5362 4274</span>
              </div>
            </Rise>
            <Rise at={36}>
              <div style={{ display: "flex", alignItems: "center", gap: 18, border: `2px solid ${GOLD}`, borderRadius: 999, padding: "12px 34px" }}>
                <Instagram />
                <span style={{ fontFamily: MONO, fontSize: 50, color: "#fff", letterSpacing: 2 }}>{IG_HANDLE}</span>
              </div>
            </Rise>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  };

  const total = sec(end + P.endLen);
  const cutF = (id: string) => sec(lines.find((l) => l.f === id)!.at) - 4; // 這一鏡切進來的那一格（開口前一點）
  const Beds: React.FC = () => (
    <>
      {(sc.beds ?? []).map((b, i) => {
        const a = b.from ? cutF(b.from) : 0, z = b.until ? cutF(b.until) : total;
        return (
          <Sequence key={"bed" + i} from={a} durationInFrames={z - a}>
            <Audio src={staticFile(b.src)} volume={(fr) => b.volume * interpolate(fr, [0, 8, z - a - 10, z - a], [0, 1, 1, 0], clamp)} />
          </Sequence>
        );
      })}
      {(sc.sfx ?? []).map((x, i) => (
        <Sequence key={"sfx" + i} from={Math.max(0, sec(lines.find((l) => l.f === x.at)!.at + (x.offset ?? 0)))}>
          <Audio src={staticFile(x.src)} volume={x.volume ?? 0.6} />
        </Sequence>
      ))}
    </>
  );

  return () => {
    const f = useCurrentFrame();
    const c = camAt(f);
    const blur = interpolate(f, [0, 12], [5, 0], clamp);
    return (
      <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
        <AbsoluteFill style={{ transform: `rotate(${c.r}deg)` }}>
          <div style={{ position: "absolute", width: W, height: H, transformOrigin: "0 0", transform: `translate(${W / 2 - c.s * c.x}px, ${H / 2 - c.s * c.y}px) scale(${c.s})`, filter: `blur(${blur}px)` }}>
            <Scene o={c.o} img={c.img} f={f} />
          </div>
        </AbsoluteFill>
        <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 60%, rgba(10,8,14,.35) 100%)" }} />
        {lines.filter((l) => l.sub !== false).map((l) => (
          <Sequence key={l.f} from={sec(l.at) - 3} durationInFrames={sec(l.len) + 10}><Sub text={l.es} len={sec(l.len) + 10} v={v} /></Sequence>
        ))}
        {lines.map((l) => {
          const Ov = sc.overlays?.[l.f];
          return Ov ? <Sequence key={"o" + l.f} from={sec(l.at)} durationInFrames={sec(l.len + 1)}><Ov len={sec(l.len + 1)} /></Sequence> : null;
        })}
        {lines.map((l) => (
          <Sequence key={"a" + l.f} from={sec(l.at)}><Audio src={staticFile(`${sc.vo}/${l.f}.wav`)} /></Sequence>
        ))}
        <Sequence from={sec(end)}><EndCard /></Sequence>
        <Beds />
        <Sequence from={sec(end + P.endVo)}><Audio src={staticFile(`${sc.vo}/n1.wav`)} /></Sequence>
      </AbsoluteFill>
    );
  };
};

export const Guantes = makeGuantes(H_LAYOUT);
export const GuantesV = makeGuantes(V_LAYOUT);
export const GuantesV3D = makeGuantes(V3D_LAYOUT);
