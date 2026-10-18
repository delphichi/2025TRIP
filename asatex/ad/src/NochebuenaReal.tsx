// Nochebuena 30 秒寫實版：Kling v3 Pro 生成的 9 段寫實影片＋真實商品照＋字卡＋公司 logo 片尾。
// 分鏡表：asatex/nochebuena/分鏡表-30秒.md v4。音軌：scripts/noche_real_mix.py → public/noche/real_mix.wav
import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import { clamp, ease } from "./Nochebuena";

export const NR_FPS = 30;
export const NR_DUR = 900;
const SANS = "Montserrat, sans-serif";
const s = (sec: number) => Math.round(sec * NR_FPS);

// 剪接表（秒）：clip＝影片檔、from／to＝在成片的位置、skip＝從影片第幾秒開始用
const CUTS = [
  { clip: "V1", from: 0, to: 2.5, skip: 0 },
  { clip: "V2", from: 2.5, to: 5, skip: 0.3 },
  { clip: "V3", from: 5, to: 6.5, skip: 0.5, out: "black" },
  { clip: "V4", from: 6.5, to: 9, skip: 0, dream: true, inn: "black" },
  { clip: "V5", from: 9, to: 12, skip: 0.6, dream: true, out: "black" },
  { clip: "V6", from: 12, to: 13.5, skip: 0 },
  { clip: "V7", from: 13.5, to: 16, skip: 0.3 },
  { clip: "V8", from: 16, to: 19.5, skip: 0.3 },
  { clip: "V9", from: 19.5, to: 25.5, skip: 0 },
] as const;

// 台詞（秒、檔名、字幕）
const VO = [
  { at: 0.9, f: "r_mama1", es: "¿Vienes hoy?" },
  { at: 3.1, f: "r_hijo1", es: "La próxima vez, mamá." },
  { at: 14.4, f: "r_hijo2", es: "¡Mamá, ya llegué!" },
  { at: 17.0, f: "r_mama2", es: "Te estaba esperando." },
  { at: 24.2, f: "grito_todos4", es: "¡Estamos todos!" },
  { at: 26.3, f: "narr3", es: "" },
];

// 全家聊天中插入的商品特寫（真實照片）
const INSERTS = [
  { img: "prod/fabric.jpg", from: 21.4, to: 22.2 },
  { img: "prod/d_collar.jpg", from: 22.2, to: 23.0 },
];

const Clip: React.FC<{ c: (typeof CUTS)[number] }> = ({ c }) => {
  const f = useCurrentFrame();
  const len = s(c.to - c.from);
  const fin = "inn" in c && c.inn === "black" ? interpolate(f, [0, 10], [0, 1], clamp) : 1;
  const fout = "out" in c && c.out === "black" ? interpolate(f, [len - 10, len], [1, 0], clamp) : 1;
  const dream = "dream" in c && c.dream;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ opacity: fin * fout, filter: dream ? "grayscale(0.55) sepia(0.35) brightness(0.92) contrast(0.95)" : undefined }}>
        <OffthreadVideo src={staticFile(`noche/real/${c.clip}.mp4`)} startFrom={s(c.skip)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      {dream && <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 45%, rgba(20,16,10,.55) 100%)" }} />}
    </AbsoluteFill>
  );
};

// 開場：口袋刺繡照片大特寫，0.9 秒內拉遠並淡入寫實影片
const PocketOpen: React.FC = () => {
  const f = useCurrentFrame();
  const sc = interpolate(f, [0, 27], [1.35, 1.0], { ...clamp, easing: ease });
  const op = interpolate(f, [16, 27], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: op }}>
      <Img src={staticFile("noche/prod/chest.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${sc})` }} />
    </AbsoluteFill>
  );
};

const Insert: React.FC<{ img: string; len: number }> = ({ img, len }) => {
  const f = useCurrentFrame();
  const op = interpolate(f, [0, 4, len - 4, len], [0, 1, 1, 0], clamp);
  const sc = interpolate(f, [0, len], [1.08, 1.0], clamp);
  return (
    <AbsoluteFill style={{ opacity: op, background: "#000" }}>
      <Img src={staticFile(`noche/${img}`)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${sc})` }} />
    </AbsoluteFill>
  );
};

const Sub: React.FC<{ text: string; len: number }> = ({ text, len }) => {
  const f = useCurrentFrame();
  const op = interpolate(f, [0, 5, len - 6, len], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 300, opacity: op }}>
      <div style={{ maxWidth: 900, textAlign: "center", fontFamily: SANS, fontWeight: 600, fontSize: 48, lineHeight: 1.3, color: "#fff", background: "rgba(10,12,18,.55)", padding: "14px 28px", borderRadius: 18 }}>{text}</div>
    </AbsoluteFill>
  );
};

const Title: React.FC<{ text: string; len: number; size?: number; top?: number }> = ({ text, len, size = 62, top }) => {
  const f = useCurrentFrame();
  const op = interpolate(f, [0, 8, len - 8, len], [0, 1, 1, 0], clamp);
  const ls = interpolate(f, [0, len], [6, 12], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: top ? "flex-start" : "center", alignItems: "center", paddingTop: top, opacity: op }}>
      <div style={{ fontFamily: SANS, fontWeight: 300, fontSize: size, letterSpacing: ls, color: "#f3ead6", textTransform: "uppercase", textShadow: "0 2px 18px rgba(0,0,0,.6)" }}>{text}</div>
    </AbsoluteFill>
  );
};

// 片尾：公司 logo＋廣告詞
const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const bg = interpolate(f, [0, 12], [0, 1], clamp);
  const lg = interpolate(f, [6, 22], [0, 1], { ...clamp, easing: ease });
  const tx = interpolate(f, [22, 38], [0, 1], { ...clamp, easing: ease });
  const sc = interpolate(f, [0, 135], [0.96, 1.02], clamp);
  return (
    <AbsoluteFill style={{ opacity: bg, background: "linear-gradient(180deg,#fbf7f1 0%,#f3ebe1 100%)", justifyContent: "center", alignItems: "center" }}>
      <div style={{ transform: `scale(${sc})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 70 }}>
        <Img src={staticFile("showroom/logo.png")} style={{ width: 620, opacity: lg, transform: `translateY(${(1 - lg) * 30}px)` }} />
        <div style={{ opacity: tx, transform: `translateY(${(1 - tx) * 20}px)`, fontFamily: SANS, fontWeight: 500, fontSize: 50, lineHeight: 1.35, color: "#2b2b33", textAlign: "center", maxWidth: 880 }}>
          Asatex te acompaña<br />en todos tus momentos.
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const NochebuenaReal: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    {CUTS.map((c) => (
      <Sequence key={c.clip} from={s(c.from)} durationInFrames={s(c.to - c.from)}>
        <Clip c={c} />
      </Sequence>
    ))}
    <Sequence from={0} durationInFrames={28}><PocketOpen /></Sequence>
    {INSERTS.map((x) => (
      <Sequence key={x.img} from={s(x.from)} durationInFrames={s(x.to - x.from)}><Insert img={x.img} len={s(x.to - x.from)} /></Sequence>
    ))}
    <Sequence from={s(5.7)} durationInFrames={s(1.6)}><Title text="40 años después" len={s(1.6)} /></Sequence>
    <Sequence from={s(12.15)} durationInFrames={s(1.3)}><Title text="24 dic · 20:47" len={s(1.3)} size={78} top={230} /></Sequence>
    <Sequence from={s(25.5)} durationInFrames={s(4.5)}><EndCard /></Sequence>
    {VO.filter((v) => v.es).map((v) => (
      <Sequence key={v.f} from={s(v.at - 0.1)} durationInFrames={s(1.7)}><Sub text={v.es} len={s(1.7)} /></Sequence>
    ))}
    <Audio src={staticFile("noche/real_mix.wav")} />
    {VO.map((v) => (
      <Sequence key={"a" + v.f} from={s(v.at)}><Audio src={staticFile(`noche/vo/${v.f}.wav`)} volume={v.f === "grito_todos4" ? 1.1 : 1} /></Sequence>
    ))}
  </AbsoluteFill>
);
