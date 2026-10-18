// 免費運鏡測試：同一張 K1 關鍵影格，從睡衣口袋刺繡大特寫一鏡拉遠到媽媽全身講電話（不用 AI 影片）。
import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { clamp, ease } from "./Nochebuena";

export const PP_FPS = 30;
export const PP_DUR = 135; // 4.5 秒
const W = 1080, H = 1920;
// 口袋刺繡在 K1（768×1376）裡的位置，換算成畫面座標
const POCKET = { x: (510 / 768) * W, y: (815 / 1376) * H };
const START_ZOOM = 3.2;

export const PocketPull: React.FC = () => {
  const f = useCurrentFrame();
  // 0–0.5 秒停在口袋，0.5–3.3 秒拉遠，之後極慢推近
  const k = interpolate(f, [15, 99], [0, 1], { ...clamp, easing: ease });
  const drift = interpolate(f, [99, PP_DUR], [1, 1.025], clamp);
  const s = interpolate(k, [0, 1], [START_ZOOM, 1]) * drift;
  const fx = interpolate(k, [0, 1], [POCKET.x, W / 2]);
  const fy = interpolate(k, [0, 1], [POCKET.y, H / 2]);
  const tx = W / 2 - s * fx, ty = H / 2 - s * fy;
  const blur = interpolate(f, [0, 12], [5, 0], clamp);
  const sub = interpolate(f, [84, 90, 126, 132], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      <Img src={staticFile("noche/real/K1.png")} style={{ position: "absolute", width: W, height: H, objectFit: "cover", transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${s})`, filter: `blur(${blur}px)` }} />
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 300, opacity: sub }}>
        <div style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 48, color: "#fff", background: "rgba(10,12,18,.55)", padding: "14px 28px", borderRadius: 18 }}>¿Vienes hoy?</div>
      </AbsoluteFill>
      <Audio src={staticFile("noche/real_mix.wav")} endAt={PP_DUR} />
      <Sequence from={87}><Audio src={staticFile("noche/vo/r_mama1.wav")} /></Sequence>
    </AbsoluteFill>
  );
};
