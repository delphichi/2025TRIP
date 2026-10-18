// EP3《Halloween》Asatex 短劇第三集（9:16，切鏡）：房間裡比絲襪（鏡 1–5）→ 夜店燈一暗，閨蜜的螢光網襪發光（鏡 6–7）
// （房間白網襪 → 夜店直接變藍，本身就是變色效果，不另外做關燈；DelphiChi 2026-10-15）
// → 兩款產品照（鏡 8）→ 夜店兩人一起喊「¡Estamos listas para la fiesta de Halloween!」（鏡 9）→ 片尾。
// 產品：她穿 CK2603L 鑽石亮片，閨蜜穿 CK4603LY 螢光。圖：scripts/fiesta_fix.py；配音：scripts/fiesta_vo.sh → vo_fast.py fiesta 1.1。
import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp } from "./Nochebuena";
import { durOf, Layout, makeGuantes, PACE_CUT } from "./Guantes";

const SANS = "Montserrat, Helvetica Neue, Arial, sans-serif";
const ROOM = "fiesta/escena.png";
const DISCO = "fiesta/disco.png";

// 鏡 8：兩款產品照上下排（CK4603LY 只裁包裝，不放批發價）
const Products: React.FC<{ len: number }> = ({ len }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const op = interpolate(f, [0, 4, len - 5, len], [0, 1, 1, 0], clamp);
  const card = (i: number) => spring({ frame: f - 2 - i * 6, fps, config: { damping: 15 } });
  const tag = (t: string, c: string) => (
    <div style={{ position: "absolute", left: 24, bottom: 20, fontFamily: SANS, fontWeight: 800, fontSize: 34, color: "#fff", background: c, padding: "8px 18px", borderRadius: 12 }}>{t}</div>
  );
  return (
    <AbsoluteFill style={{ opacity: op, background: "linear-gradient(180deg,#120a1f 0%,#05060b 100%)", alignItems: "center", justifyContent: "center", gap: 28, flexDirection: "column" }}>
      <div style={{ position: "relative", width: 960, height: 820, borderRadius: 26, overflow: "hidden", transform: `translateX(${(1 - card(0)) * -120}px)`, opacity: card(0), boxShadow: "0 10px 40px rgba(0,0,0,.6)" }}>
        <Img src={staticFile("fiesta/ck2603l.webp")} style={{ width: 960, height: 1280, objectFit: "cover", objectPosition: "top" }} />
        {tag("CK2603L · Brillos de diamante", "rgba(160,20,40,.92)")}
      </div>
      <div style={{ position: "relative", width: 960, height: 590, borderRadius: 26, overflow: "hidden", transform: `translateX(${(1 - card(1)) * 120}px)`, opacity: card(1), boxShadow: "0 10px 40px rgba(0,0,0,.6)" }}>
        <Img src={staticFile("fiesta/ck4603ly.webp")} style={{ width: 960, height: 942, objectFit: "cover", objectPosition: "top" }} />
        {tag("CK4603LY · Fluorescentes", "rgba(20,110,170,.92)")}
      </div>
    </AbsoluteFill>
  );
};

const LAYOUT: Layout = {
  W: 1080, H: 1920, img: ROOM, iw: 572, ih: 1024, vertical: true,
  shots: [
    { s: 2.2, x: 160, y: 820, s2: 1.9 }, // 房間：她的鑽石亮片腿特寫，慢慢拉開
    { s: 1.8, x: 170, y: 470 }, // 房間：她中景
    { s: 1.0, x: 286, y: 512 }, // 房間：雙人全景
    { s: 2.0, x: 420, y: 420 }, // 房間：閨蜜近景
    { s: 3.0, x: 205, y: 320 }, // 房間：她臉部特寫
    { s: 2.0, x: 420, y: 830, img: DISCO }, // 夜店：閨蜜的腿特寫（白網襪已變螢光藍）
    { s: 1.6, x: 410, y: 600, img: DISCO }, // 夜店：閨蜜中景（黑暗中發光）
    { s: 1.0, x: 286, y: 512, img: DISCO }, // 產品照（全螢幕疊圖蓋住）
    { s: 1.15, x: 286, y: 560, img: DISCO }, // 夜店：雙人鏡，一起喊
  ],
  script: {
    vo: "fiesta/vo_fast", // 配音加速 10%（scripts/vo_fast.py），FB/IG 要 30 秒內
    pace: PACE_CUT,
    slogan: ["Asatex", "te hace feliz."],
    // 每句實際秒數：配音後跑 scripts/vo_fast.py fiesta 1.1，照印出的 dur 更新
    dur: { f1: 1.71, f2: 2.67, f3: 1.53, f4: 1.74, f5: 2.37, f6: 2.04, f7: 1.45, f8: 1.79, f9: 2.54, n1: 1.91 },
    lines: [
      { f: "f1", es: "¡Amiga, mira mis pantys!" },
      { f: "f2", es: "¡Con brillos de diamante… de Asatex!" },
      { f: "f3", es: "¡Yo también compré en Asatex!" },
      { f: "f4", es: "Pero las mías tienen un secreto…" },
      { f: "f5", es: "¿Secreto? ¡Las mías brillan más!" },
      { f: "f6", es: "¿Ah, sí? ¡Mira ahora!" },
      { f: "f7", es: "¡Brillan en la oscuridad!" },
      { f: "f8", es: "¡Buenos, bonitos y baratos!" },
      { f: "f9", es: "¡Estamos listas para la fiesta de Halloween!" },
    ],
    beds: [
      { src: "sfx/club_muffled.wav", volume: 0.5, until: "f6" }, // 房間：隔牆悶悶的舞曲
      { src: "sfx/club_beat.wav", volume: 0.22, from: "f6" }, // 夜店：舞曲全開到片尾
      { src: "sfx/crowd.wav", volume: 0.12, from: "f6", until: "f8" }, // 夜店人群
    ],
    sfx: [
      { src: "sfx/sparkle.wav", at: "f1", offset: -0.15, volume: 0.45 }, // 鑽石亮片
      { src: "sfx/whoosh.wav", at: "f6", offset: -0.3, volume: 0.5 }, // 切到夜店
      { src: "sfx/sparkle.wav", at: "f6", offset: 0.6, volume: 0.35 }, // 螢光
      { src: "sfx/whoosh.wav", at: "f8", offset: -0.3, volume: 0.45 }, // 產品照
    ],
    overlays: { f8: Products },
  },
};

export const F_FPS = 30;
export const F_DUR = durOf(LAYOUT);
export const Fiesta = makeGuantes(LAYOUT);
