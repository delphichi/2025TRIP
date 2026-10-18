// 免費「一鏡到底」：口袋拉遠 → 前後景視差往右繞 → 前景門框擋過（藏剪接）→ 媽媽側身。
// 素材：K1.png（原圖）、K1_bg.png（補洞背景）、K1_fg.png（正面去背）、K1_side.png（mom.png 側身去背＋調暖）、K1_sidebg.png（窗邊聖誕燈散景）
import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { clamp, ease } from "./Nochebuena";

export const PO_FPS = 30;
export const PO_DUR = 240; // 8 秒
const W = 1080, H = 1920;
const POCKET = { x: (510 / 768) * W, y: (815 / 1376) * H };
const CUT = 157; // 門框完全擋住畫面的那一幀
const img = (f: string) => staticFile(`noche/real/${f}`);

const Layer: React.FC<{ src: string; x?: number; s?: number; blur?: number; origin?: string }> = ({ src, x = 0, s = 1, blur = 0, origin = "50% 50%" }) => (
  <Img src={src} style={{ position: "absolute", width: W, height: H, objectFit: "cover", transformOrigin: origin, transform: `translateX(${x}px) scale(${s})`, filter: blur ? `blur(${blur}px)` : undefined }} />
);

export const PocketOrbit: React.FC = () => {
  const f = useCurrentFrame();
  // 第一段：單張照片從口袋拉遠（同 PocketPull）
  const k = interpolate(f, [15, 99], [0, 1], { ...clamp, easing: ease });
  const s = interpolate(k, [0, 1], [3.2, 1]);
  const fx = interpolate(k, [0, 1], [POCKET.x, W / 2]), fy = interpolate(k, [0, 1], [POCKET.y, H / 2]);
  // 第二段：視差往右繞（背景往左多、人物往左少＋微微放大）
  const o = interpolate(f, [99, CUT], [0, 1], { ...clamp, easing: (t) => t * t });
  // 第三段：側身，持續往右繞後慢慢停
  const o2 = interpolate(f, [CUT, PO_DUR], [0, 1], { ...clamp, easing: (t) => 1 - (1 - t) * (1 - t) });
  // 門框：深色木頭、強烈失焦，從右往左掃過
  const bar = interpolate(f, [146, 168], [W + 100, -1500], clamp);
  const sub = interpolate(f, [84, 90, 140, 146], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      {f < 99 && (
        <Img src={img("K1.png")} style={{ position: "absolute", width: W, height: H, objectFit: "cover", transformOrigin: "0 0", transform: `translate(${W / 2 - s * fx}px, ${H / 2 - s * fy}px) scale(${s})`, filter: `blur(${interpolate(f, [0, 12], [5, 0], clamp)}px)` }} />
      )}
      {f >= 99 && f < CUT && (
        <>
          <Layer src={img("K1_bg.png")} x={-90 * o} s={1 + 0.03 * o} blur={2.5 * o} />
          <Layer src={img("K1_fg.png")} x={-25 * o} s={1 + 0.05 * o} origin="50% 70%" />
        </>
      )}
      {f >= CUT && (
        <>
          <Layer src={img("K1_sidebg.png")} x={60 - 140 * o2} s={1.12} />
          <Layer src={img("K1_side.png")} x={40 - 70 * o2} s={1.03 + 0.04 * o2} origin="45% 40%" />
        </>
      )}
      <div style={{ position: "absolute", top: -100, left: bar, width: 1500, height: H + 200, background: "linear-gradient(90deg, rgba(28,16,8,0) 0%, #1c1008 18%, #2a1a0e 50%, #1c1008 82%, rgba(28,16,8,0) 100%)", filter: "blur(30px)" }} />
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 300, opacity: sub }}>
        <div style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 48, color: "#fff", background: "rgba(10,12,18,.55)", padding: "14px 28px", borderRadius: 18 }}>¿Vienes hoy?</div>
      </AbsoluteFill>
      <Audio src={staticFile("noche/real_mix.wav")} endAt={PO_DUR} />
      <Sequence from={87}><Audio src={staticFile("noche/vo/r_mama1.wav")} /></Sequence>
    </AbsoluteFill>
  );
};
