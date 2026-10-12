// ASATEX 30 秒史詩奇幻預告片風格片頭（西班牙文），1920×1080，30 fps。
// 配樂由 scripts/score.py 合成，重擊點與下面的時間表 T 一致（改一邊要同步改另一邊）。
import React from "react";
import { AbsoluteFill, Audio, Easing, Img, interpolate, random, Sequence, spring, staticFile, useCurrentFrame } from "remotion";
import { loadFont } from "@remotion/fonts";
import { ICONS } from "./trailer/icons";

loadFont({ family: "Cinzel", url: staticFile("trailer/Cinzel.ttf"), weight: "400 900" });
loadFont({ family: "Plex Mono", url: staticFile("trailer/PlexMono-Medium.ttf"), weight: "500" });

export const T_FPS = 30;
export const T_DUR = 900;
const s = (sec: number) => Math.round(sec * T_FPS);

// 時間表（秒）
const T = { card1: 0.5, hit1: 3.5, card2: 4.0, glimpse: 7.0, suck: 9.5, drop: 10.0, mont: 12.0, promise: 22.0, end: 26.0 };
const IMPACTS: [number, number][] = [
  [T.hit1, 0.6], [T.drop, 1], [22, 0.5], [23, 0.6], [24, 0.5], [25, 0.6], [T.end, 0.8],
  ...Array.from({ length: 9 }, (_, i) => [T.mont + 1 + i, 0.22] as [number, number]),
];

const GOLD = "linear-gradient(180deg, #fff6d6 0%, #f6d77a 28%, #c8902a 52%, #fbe3a0 64%, #9a6516 100%)";
const INK = "#07090c";
const CINZEL = "Cinzel, Trajan Pro, serif";
const MONO = '"Plex Mono", ui-monospace, monospace';
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const PRODUCTS = [
  { k: "telas", w: "TELAS" },
  { k: "calcetines", w: "CALCETINES" },
  { k: "pantis", w: "PANTIS" },
  { k: "ropa", w: "ROPA INTERIOR" },
  { k: "pijamas", w: "PIJAMAS" },
  { k: "panuelos", w: "PAÑUELOS" },
  { k: "guantes", w: "GUANTES" },
  { k: "balones", w: "BALONES", sub: "BÁSQUETBOL · FÚTBOL" },
  { k: "bolsas", w: "BOLSAS", sub: "DE COMPRAS" },
  { k: "cinta", w: "CINTA", sub: "DE EMBALAJE" },
];
const GLOWS = ["#e9a83a", "#3aa7b8", "#c94a3a", "#e9c46a", "#5b7fd6", "#e9a83a", "#3aa7b8", "#d9752e", "#c94a3a", "#e9c46a"];

// 衝擊：最近一次重擊後的衰減量
const impactAt = (f: number) => {
  let v = 0;
  for (const [t, a] of IMPACTS) {
    const d = f - s(t);
    if (d >= 0 && d < 24) v = Math.max(v, a * Math.exp(-d / 5));
  }
  return v;
};

// ── 共用元件 ──
const GoldText: React.FC<{ children: React.ReactNode; size: number; weight?: number; track?: number; style?: React.CSSProperties; sheen?: number }> = ({ children, size, weight = 700, track = 0.08, style, sheen = -1 }) => (
  <span
    style={{
      fontFamily: CINZEL,
      fontWeight: weight,
      fontSize: size,
      letterSpacing: `${track}em`,
      backgroundImage: sheen >= 0 ? `linear-gradient(105deg, rgba(255,255,255,0) ${sheen * 140 - 30}%, rgba(255,255,255,.95) ${sheen * 140 - 18}%, rgba(255,255,255,0) ${sheen * 140 - 6}%), ${GOLD}` : GOLD,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
      filter: "drop-shadow(0 0 18px rgba(255,190,90,.35)) drop-shadow(0 4px 2px rgba(0,0,0,.6))",
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </span>
);

// 字距由寬收緊、從模糊到清楚的預告片字卡
const TitleCard: React.FC<{ lines: string[]; dur: number; size?: number }> = ({ lines, dur, size = 74 }) => {
  const f = useCurrentFrame();
  const inP = interpolate(f, [0, 24], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const outP = interpolate(f, [dur - 10, dur], [0, 1], clamp);
  const track = interpolate(f, [0, dur], [0.24, 0.1], { ...clamp, easing: Easing.out(Easing.quad) });
  const scale = interpolate(f, [0, dur], [1, 1.07]);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `scale(${scale})` }}>
      <div style={{ display: "grid", gap: 18, justifyItems: "center", opacity: inP * (1 - outP), filter: `blur(${(1 - inP) * 14 + outP * 10}px)` }}>
        {lines.map((l, i) => (
          <GoldText key={l} size={i === 0 ? size * 0.62 : size} weight={i === 0 ? 400 : 700} track={track} sheen={interpolate(f, [8 + i * 6, 50 + i * 6], [0, 1], clamp)}>
            {l}
          </GoldText>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Embers: React.FC<{ n?: number; k?: number; burstAt?: number }> = ({ n = 110, k = 1, burstAt }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ mixBlendMode: "screen", pointerEvents: "none" }}>
      {Array.from({ length: n }, (_, i) => {
        const r = (x: string) => random(`ember-${i}-${x}`);
        const size = 2 + r("s") * 5;
        const sp = 1.2 + r("v") * 3.2;
        let x = r("x") * 1920 + Math.sin(f / (20 + r("w") * 30) + r("p") * 6) * 30;
        let y = 1180 - ((r("y") * 1300 + f * sp) % 1300);
        let o = 0.35 + r("o") * 0.65;
        if (burstAt !== undefined && f >= burstAt) {
          const d = f - burstAt;
          const ang = r("a") * Math.PI * 2;
          const v = (6 + r("bv") * 28) * (1 - Math.exp(-d / 6)) * 7;
          x = 960 + Math.cos(ang) * v;
          y = 540 + Math.sin(ang) * v - d * 1.5;
          o *= Math.exp(-d / 40);
        }
        const flick = 0.6 + 0.4 * Math.sin(f * (0.3 + r("f") * 0.5) + r("q") * 9);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: size,
              borderRadius: "50%",
              background: "radial-gradient(circle, #fff3c4 0%, #ffb648 45%, rgba(255,120,30,0) 72%)",
              boxShadow: `0 0 ${size * 3}px rgba(255,160,60,.8)`,
              opacity: o * flick * k,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const Rays: React.FC<{ k: number; color?: string; speed?: number; cx?: string; cy?: string }> = ({ k, color = "255,196,96", speed = 0.15, cx = "50%", cy = "50%" }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        opacity: k,
        mixBlendMode: "screen",
        background: `repeating-conic-gradient(from ${f * speed}deg at ${cx} ${cy}, rgba(${color},.0) 0deg, rgba(${color},.22) 4deg, rgba(${color},0) 9deg, rgba(${color},0) 17deg)`,
        maskImage: `radial-gradient(circle at ${cx} ${cy}, #000 0%, rgba(0,0,0,.6) 30%, transparent 70%)`,
        WebkitMaskImage: `radial-gradient(circle at ${cx} ${cy}, #000 0%, rgba(0,0,0,.6) 30%, transparent 70%)`,
        filter: "blur(6px)",
      }}
    />
  );
};

const Grain: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ mixBlendMode: "overlay", opacity: 0.18, pointerEvents: "none" }}>
      <svg width="1920" height="1080">
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={f % 97} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="1920" height="1080" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
};

// ── 第一幕：阿塔卡馬沙漠夜景 ──
const dune = (seed: number, base: number, amp: number) => {
  const pts: string[] = [];
  for (let x = -200; x <= 2400; x += 40) {
    const y = base - amp * (0.55 * Math.sin(x / 420 + seed) + 0.3 * Math.sin(x / 170 + seed * 2.3) + 0.15 * Math.sin(x / 75 + seed * 4.1));
    pts.push(`${x},${y.toFixed(1)}`);
  }
  return `M-200,1300 L${pts.join(" L")} L2400,1300 Z`;
};
const DUNES = [
  { d: dune(1.3, 640, 60), c: "#1b1712", px: 0.15 },
  { d: dune(4.2, 720, 90), c: "#14110d", px: 0.35 },
  { d: dune(2.7, 820, 110), c: "#0d0b09", px: 0.6 },
  { d: dune(5.9, 940, 90), c: "#070605", px: 1 },
];
const Desert: React.FC = () => {
  const f = useCurrentFrame();
  const glow = interpolate(f, [0, s(T.suck)], [0.25, 1], clamp);
  const push = interpolate(f, [s(T.glimpse), s(T.suck)], [1, 1.35], { ...clamp, easing: Easing.in(Easing.cubic) });
  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg, #04060c 0%, #0a1020 45%, #2a1a10 70%, #120c07 100%)", transform: `scale(${push})`, transformOrigin: "50% 62%" }}>
      {Array.from({ length: 180 }, (_, i) => {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(f / 14 + i));
        return <div key={i} style={{ position: "absolute", left: random(`st-x${i}`) * 1920, top: random(`st-y${i}`) * 560, width: 2, height: 2, borderRadius: 1, background: "#fff", opacity: random(`st-o${i}`) * 0.8 * tw }} />;
      })}
      <div style={{ position: "absolute", left: 1320, top: 150, width: 90, height: 90, borderRadius: "50%", boxShadow: "inset -22px 6px 0 0 #f4e6c4", opacity: 0.85, filter: "drop-shadow(0 0 20px rgba(244,230,196,.5))" }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 22% at 50% 64%, rgba(255,170,70,${0.55 * glow}) 0%, rgba(255,120,40,${0.18 * glow}) 45%, rgba(0,0,0,0) 75%)` }} />
      <Rays k={glow * 0.55} cx="50%" cy="64%" speed={0.08} />
      <svg width="1920" height="1080" style={{ position: "absolute", inset: 0 }}>
        {DUNES.map((d, i) => (
          <path key={i} d={d.d} fill={d.c} transform={`translate(${-f * 0.8 * d.px} 0)`} />
        ))}
      </svg>
    </AbsoluteFill>
  );
};

// 爆點前的商品剪影閃現
const Glimpses: React.FC = () => {
  const f = useCurrentFrame();
  const times = [0, 9, 17, 24, 30, 35, 40, 44, 48, 52, 55, 58, 61, 64, 67, 70];
  const idx = times.filter((t) => f >= t).length - 1;
  if (idx < 0) return null;
  const local = f - times[idx];
  if (local > 3) return null;
  const p = PRODUCTS[idx % PRODUCTS.length];
  const Icon = ICONS[p.k];
  const x = 260 + random(`gx${idx}`) * 1200, y = 160 + random(`gy${idx}`) * 520;
  return (
    <svg width={340} height={340} viewBox="0 0 240 240" style={{ position: "absolute", left: x, top: y, opacity: 1 - local / 4, filter: "drop-shadow(0 0 16px #ffbf55)" }}>
      <g fill="none" stroke="#ffd98a" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round">{Icon()}</g>
    </svg>
  );
};

// ── 第二幕：logo 爆出 ──
const LogoReveal: React.FC = () => {
  const f = useCurrentFrame();
  const sp = spring({ frame: f, fps: T_FPS, config: { damping: 11, stiffness: 140, mass: 0.9 } });
  const scale = interpolate(sp, [0, 1], [1.9, 1]);
  const ca = Math.max(0, 14 * Math.exp(-f / 6));
  const ring = interpolate(f, [0, 22], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const sub = interpolate(f, [16, 34], [0, 1], clamp);
  const logoStyle: React.CSSProperties = { position: "absolute", width: 820, left: 550, top: 175 };
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 46%, #3a2410 0%, #140c06 45%, ${INK} 80%)` }}>
      <Rays k={0.95} speed={0.4} cy="46%" />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 300 + ring * 1900, height: 300 + ring * 1900, borderRadius: "50%", border: `${10 * (1 - ring) + 1}px solid rgba(255,214,140,${0.9 * (1 - ring)})`, filter: "blur(3px)", marginTop: -80 }} />
      </AbsoluteFill>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${scale})`, transformOrigin: "50% 42%" }}>
        <Img src={staticFile("trailer/logo.png")} style={{ ...logoStyle, opacity: 0.55, transform: `translateX(${-ca}px)`, filter: "sepia(1) saturate(6) hue-rotate(-50deg)", mixBlendMode: "screen" }} />
        <Img src={staticFile("trailer/logo.png")} style={{ ...logoStyle, opacity: 0.55, transform: `translateX(${ca}px)`, filter: "sepia(1) saturate(6) hue-rotate(160deg)", mixBlendMode: "screen" }} />
        <Img src={staticFile("trailer/logo.png")} style={{ ...logoStyle, filter: "drop-shadow(0 0 40px rgba(255,190,90,.55)) drop-shadow(0 0 6px rgba(255,230,170,.9))" }} />
      </div>
      <div style={{ position: "absolute", top: 820, width: "100%", textAlign: "center", opacity: sub, transform: `translateY(${(1 - sub) * 20}px)` }}>
        <GoldText size={40} weight={600} track={interpolate(f, [16, 60], [0.6, 0.32], clamp)}>ASAHI LTDA · ZOFRI IQUIQUE</GoldText>
      </div>
      <Embers n={140} burstAt={0} k={1.2} />
    </AbsoluteFill>
  );
};

// ── 商品快剪 ──
const ProductShot: React.FC<{ i: number }> = ({ i }) => {
  const f = useCurrentFrame();
  const p = PRODUCTS[i];
  const Icon = ICONS[p.k];
  const dir = i % 2 === 0 ? 1 : -1;
  const enter = interpolate(f, [0, 7], [1, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  const exit = interpolate(f, [26, 30], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const draw = interpolate(f, [0, 14], [1, 0], { ...clamp, easing: Easing.out(Easing.quad) });
  const glow = GLOWS[i];
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 80% at 30% 50%, ${glow}33 0%, ${INK} 65%)` }}>
      <Rays k={0.45} cx="27%" cy="50%" speed={dir * 0.6} />
      <div style={{ position: "absolute", right: 90, top: 150, fontFamily: MONO, fontSize: 300, lineHeight: 1, color: "transparent", WebkitTextStroke: `2px ${glow}55`, transform: `translateY(${f * -1.2}px)` }}>{String(i + 1).padStart(2, "0")}</div>
      <div style={{ position: "absolute", inset: 0, transform: `translateX(${enter * 160 * dir}px) scale(${1 + exit * 0.35})`, opacity: 1 - exit, filter: `blur(${enter * 10 + exit * 8}px)` }}>
        <svg width={520} height={520} viewBox="0 0 240 240" style={{ position: "absolute", left: 260, top: 280, transform: `translateY(${Math.sin(f / 7) * 6}px) rotate(${(1 - draw) * 0 + Math.sin(f / 11) * 2}deg)`, filter: `drop-shadow(0 0 14px ${glow}) drop-shadow(0 0 3px #fff2cc)` }}>
          <g fill="none" stroke="#ffe3a0" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={1} strokeDashoffset={draw}>
            {Icon()}
          </g>
        </svg>
        <div style={{ position: "absolute", left: 860, top: 0, bottom: 0, display: "grid", alignContent: "center", gap: 14 }}>
          <div style={{ fontFamily: MONO, fontSize: 26, letterSpacing: 6, color: glow, opacity: 0.9 }}>{String(i + 1).padStart(2, "0")} / 10</div>
          <GoldText size={p.w.length > 10 ? 80 : p.w.length > 8 ? 96 : p.w.length > 6 ? 118 : 136} weight={900} track={interpolate(f, [0, 30], [0.16, 0.05], clamp)} sheen={interpolate(f, [4, 26], [0, 1], clamp)}>
            {p.w}
          </GoldText>
          {p.sub ? <GoldText size={44} weight={500} track={0.3}>{p.sub}</GoldText> : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// 黑邊裡的進度條（作品集味）
const Progress: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: "absolute", left: 160, right: 160, bottom: 62, display: "flex", gap: 10 }}>
      {PRODUCTS.map((p, i) => {
        const k = interpolate(f, [i * 30, i * 30 + 30], [0, 1], clamp);
        return (
          <div key={p.k} style={{ flex: 1, display: "grid", gap: 8 }}>
            <div style={{ height: 3, background: "rgba(255,220,150,.18)" }}>
              <div style={{ height: 3, width: `${k * 100}%`, background: "#f3c766", boxShadow: "0 0 10px #f3c766" }} />
            </div>
            <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: 2, color: k > 0 && k < 1 ? "#f3c766" : "rgba(255,230,180,.35)", whiteSpace: "nowrap", overflow: "hidden" }}>{p.w}</div>
          </div>
        );
      })}
    </div>
  );
};

// ── 承諾 ──
const Stamp: React.FC<{ text: string; at: number; size: number; y: number; weight?: number }> = ({ text, at, size, y, weight = 900 }) => {
  const f = useCurrentFrame() - at;
  if (f < 0) return null;
  const k = interpolate(f, [0, 5], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ position: "absolute", top: y, width: "100%", textAlign: "center", transform: `scale(${1.35 - 0.35 * k})`, opacity: k, filter: `blur(${(1 - k) * 12}px)` }}>
      <GoldText size={size} weight={weight} track={interpolate(f, [0, 30], [0.2, 0.1], clamp)} sheen={interpolate(f, [2, 22], [0, 1], clamp)}>
        {text}
      </GoldText>
    </div>
  );
};
const Promise_: React.FC = () => {
  const f = useCurrentFrame();
  const second = f >= 60;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 50%, #2a1b0c 0%, ${INK} 70%)` }}>
      <Rays k={0.6} speed={0.25} />
      <Embers n={70} k={0.8} />
      {!second ? (
        <>
          <Stamp text="LO QUE USTED NECESITE," at={0} size={70} y={360} weight={600} />
          <Stamp text="LO ENCONTRAMOS." at={30} size={128} y={480} />
        </>
      ) : (
        <>
          <Stamp text="PROVEEDORES DE CALIDAD." at={60} size={84} y={370} weight={700} />
          <Stamp text="AL MEJOR PRECIO." at={90} size={128} y={490} />
        </>
      )}
    </AbsoluteFill>
  );
};

// ── 結尾卡 ──
const WhatsApp: React.FC = () => (
  <svg width="44" height="44" viewBox="0 0 48 48" aria-hidden>
    <path d="M24 4C13 4 4 12.8 4 23.7c0 3.6 1 7 2.8 9.9L4 44l10.8-2.8c2.8 1.5 6 2.3 9.2 2.3 11 0 20-8.8 20-19.8S35 4 24 4z" fill="#25d366" />
    <path d="M17.5 13.8c-.5-1.1-1-1.1-1.5-1.1h-1.3c-.4 0-1.2.2-1.8.8-.6.6-2.3 2.2-2.3 5.4s2.4 6.3 2.7 6.7c.3.4 4.6 7.2 11.3 9.9 5.6 2.2 6.7 1.8 7.9 1.7 1.2-.1 3.9-1.6 4.5-3.1.6-1.5.6-2.8.4-3.1-.2-.3-.6-.4-1.3-.8-.7-.3-3.9-1.9-4.5-2.1-.6-.2-1-.3-1.5.3-.4.7-1.7 2.1-2.1 2.6-.4.4-.8.5-1.4.2-.7-.3-2.8-1-5.3-3.3-2-1.7-3.3-3.9-3.7-4.5-.4-.7 0-1 .3-1.4.3-.3.7-.8 1-1.2.3-.4.4-.7.7-1.2.2-.4.1-.9 0-1.2-.2-.4-1.4-3.6-2-4.9z" fill="#fff" />
  </svg>
);
const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const sp = spring({ frame: f, fps: T_FPS, config: { damping: 14, stiffness: 120 } });
  const a = interpolate(f, [10, 26], [0, 1], clamp);
  const b = interpolate(f, [20, 36], [0, 1], clamp);
  const c = interpolate(f, [30, 46], [0, 1], clamp);
  const push = interpolate(f, [0, 120], [1, 1.035]);
  const out = interpolate(f, [108, 120], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 38%, #3b2610 0%, #140d06 45%, ${INK} 85%)`, transform: `scale(${push})` }}>
      <Rays k={0.8} speed={0.18} cy="30%" />
      <Embers n={90} k={0.9} />
      <Img src={staticFile("trailer/logo.png")} style={{ position: "absolute", width: 470, left: 725, top: 70, transform: `scale(${0.8 + 0.2 * sp})`, opacity: sp, filter: "drop-shadow(0 0 30px rgba(255,190,90,.5))" }} />
      <div style={{ position: "absolute", top: 455, width: "100%", textAlign: "center", opacity: a, transform: `translateY(${(1 - a) * 24}px)` }}>
        <GoldText size={150} weight={900} track={0.06} sheen={interpolate(f, [16, 50], [0, 1], clamp)}>¡VISÍTENOS!</GoldText>
      </div>
      <div style={{ position: "absolute", top: 655, width: "100%", textAlign: "center", opacity: b }}>
        <GoldText size={50} weight={600} track={interpolate(f, [20, 80], [0.5, 0.32], clamp)}>ZOFRI · IQUIQUE · CHILE</GoldText>
      </div>
      <div style={{ position: "absolute", top: 760, width: "100%", display: "flex", justifyContent: "center", opacity: c, transform: `scale(${0.92 + 0.08 * c})` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "14px 34px", borderRadius: 999, border: "2px solid rgba(243,199,102,.7)", background: "rgba(10,8,5,.55)", boxShadow: "0 0 30px rgba(243,199,102,.25)" }}>
          <WhatsApp />
          <span style={{ fontFamily: MONO, fontSize: 52, letterSpacing: 3, color: "#fbe7b5" }}>+56 9 9442 7681</span>
        </div>
      </div>
      <AbsoluteFill style={{ background: "#000", opacity: out }} />
    </AbsoluteFill>
  );
};

// ── 總裝 ──
export const Trailer: React.FC = () => {
  const f = useCurrentFrame();
  const imp = impactAt(f);
  const rumble = f >= s(T.glimpse) && f < s(T.suck) ? interpolate(f, [s(T.glimpse), s(T.suck)], [0, 7]) : 0;
  const amp = imp * 22 + rumble;
  const sx = (random(`sx${f}`) - 0.5) * 2 * amp, sy = (random(`sy${f}`) - 0.5) * 2 * amp;
  const flash = imp >= 0.21 ? imp * (imp > 0.5 ? 0.9 : 0.35) : 0;
  const bars = f < s(T.end) ? 138 : interpolate(f, [s(T.end), s(T.end) + 18], [138, 0], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  return (
    <AbsoluteFill style={{ background: INK, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `translate(${sx}px, ${sy}px) scale(${1 + imp * 0.03})` }}>
        <Sequence durationInFrames={s(T.suck)}>
          <Desert />
          <Embers n={60} k={0.7} />
        </Sequence>
        <Sequence from={s(T.card1)} durationInFrames={s(T.hit1) - s(T.card1)}>
          <TitleCard lines={["EN EL CORAZÓN", "DEL DESIERTO DE ATACAMA"]} dur={s(T.hit1) - s(T.card1)} />
        </Sequence>
        <Sequence from={s(T.card2)} durationInFrames={s(T.glimpse) - s(T.card2) + 6}>
          <TitleCard lines={["EXISTE UN LUGAR", "DONDE TODO SE ENCUENTRA"]} dur={s(T.glimpse) - s(T.card2) + 6} />
        </Sequence>
        <Sequence from={s(T.glimpse)} durationInFrames={s(T.suck) - s(T.glimpse)}>
          <Glimpses />
        </Sequence>
        <Sequence from={s(T.drop)} durationInFrames={s(T.mont) - s(T.drop)}>
          <LogoReveal />
        </Sequence>
        {PRODUCTS.map((p, i) => (
          <Sequence key={p.k} from={s(T.mont + i)} durationInFrames={30}>
            <ProductShot i={i} />
          </Sequence>
        ))}
        <Sequence from={s(T.promise)} durationInFrames={s(T.end) - s(T.promise)}>
          <Promise_ />
        </Sequence>
        <Sequence from={s(T.end)}>
          <EndCard />
        </Sequence>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#fff8e6", opacity: flash, mixBlendMode: "screen" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,.65) 100%)" }} />
      <Grain />
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: bars, background: "#000" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: bars, background: "#000" }}>
        <Sequence from={s(T.mont)} durationInFrames={s(T.promise) - s(T.mont)} layout="none">
          <Progress />
        </Sequence>
      </div>
      <Audio src={staticFile("trailer/score.wav")} />
    </AbsoluteFill>
  );
};
