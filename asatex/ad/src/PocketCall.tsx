// 同一張照片（K1）三段運鏡＋媽媽三句台詞：口袋特寫「Hijo…」→ 拉遠全身定格「Hijo, ¿vas a venir este año?」→ 推近臉部「¿Otra vez no vienes?」
import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { clamp, ease } from "./Nochebuena";

export const PC_FPS = 30;
export const PC_DUR = 285; // 9.5 秒
const W = 1080, H = 1920;
const pt = (x: number, y: number) => ({ x: (x / 768) * W, y: (y / 1376) * H }); // K1 原圖座標 → 畫面座標
// 鏡頭關鍵格：第幾幀、放大倍數、對準的點
const CAM = [
  { f: 0, s: 3.2, p: pt(510, 815) },   // 口袋刺繡
  { f: 15, s: 3.2, p: pt(510, 815) },
  { f: 90, s: 1.0, p: { x: W / 2, y: H / 2 } }, // 全身
  { f: 165, s: 1.0, p: { x: W / 2, y: H / 2 } }, // 定格
  { f: 210, s: 2.4, p: pt(395, 470) }, // 臉部特寫
  { f: PC_DUR, s: 2.5, p: pt(395, 470) },
];
const LINES = [
  { at: 15, f: "p_mama1", es: "Hijo…" },
  { at: 99, f: "p_mama2", es: "Hijo, ¿vas a venir este año?" },
  { at: 216, f: "p_mama3", es: "¿Otra vez no vienes?" },
];

const cam = (f: number) => {
  const i = Math.max(0, CAM.findIndex((c, j) => j < CAM.length - 1 && f >= c.f && f < CAM[j + 1].f));
  const a = CAM[i], b = CAM[Math.min(i + 1, CAM.length - 1)];
  const k = b.f === a.f ? 1 : interpolate(f, [a.f, b.f], [0, 1], { ...clamp, easing: ease });
  return { s: a.s + (b.s - a.s) * k, x: a.p.x + (b.p.x - a.p.x) * k, y: a.p.y + (b.p.y - a.p.y) * k };
};

const Sub: React.FC<{ text: string; len: number }> = ({ text, len }) => {
  const f = useCurrentFrame();
  const op = interpolate(f, [0, 5, len - 6, len], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 300, opacity: op }}>
      <div style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 48, color: "#fff", background: "rgba(10,12,18,.55)", padding: "14px 28px", borderRadius: 18 }}>{text}</div>
    </AbsoluteFill>
  );
};

export const PocketCall: React.FC = () => {
  const f = useCurrentFrame();
  const c = cam(f);
  const blur = interpolate(f, [0, 12], [5, 0], clamp);
  // 最後一句：畫面微微變冷變暗＋暗角，帶出失落
  const sad = interpolate(f, [200, 240], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      <Img src={staticFile("noche/real/K1.png")} style={{ position: "absolute", width: W, height: H, objectFit: "cover", transformOrigin: "0 0", transform: `translate(${W / 2 - c.s * c.x}px, ${H / 2 - c.s * c.y}px) scale(${c.s})`, filter: `blur(${blur}px) saturate(${1 - 0.25 * sad}) brightness(${1 - 0.1 * sad})` }} />
      <AbsoluteFill style={{ opacity: sad, background: "radial-gradient(ellipse at center, transparent 50%, rgba(10,8,6,.55) 100%)" }} />
      {LINES.map((l) => (
        <Sequence key={l.f} from={l.at - 3} durationInFrames={l.f === "p_mama1" ? 40 : 66}><Sub text={l.es} len={l.f === "p_mama1" ? 40 : 66} /></Sequence>
      ))}
      <Audio src={staticFile("noche/real_mix.wav")} endAt={PC_DUR} />
      {LINES.map((l) => (
        <Sequence key={"a" + l.f} from={l.at}><Audio src={staticFile(`noche/vo/${l.f}.wav`)} /></Sequence>
      ))}
    </AbsoluteFill>
  );
};
