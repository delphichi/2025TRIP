// ASATEX 15 秒直式廣告（1080×1920，25 fps，配合 InfiniteTalk 唱歌鏡頭的 25 fps）。
// 歌：minimax-music 生成的整首 32 秒，從 14.5 秒處切入，讓唱歌鏡頭（原歌 17.5 秒起）剛好落在第 3 秒。
// 歌詞時間來自 whisper 轉寫（換算成廣告時間）：大標題就是正在唱的那句，逐字變亮。
import React from "react";
import { AbsoluteFill, Audio, Easing, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export const FPS = 25;
export const DURATION = 390; // 15.6 秒：最後一句唱完再收

const SONG_OFFSET = 14.5; // 秒
const NAVY = "#1d2846";
const RED = "#d8343a";
const FONT = '"PingFang TC", "Heiti TC", sans-serif';
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// 歌詞（廣告時間，秒）
const LYRICS = [
  { start: 0.33, end: 3.21, lines: ["穿上睡衣", "好好睡一覺"] },
  { start: 3.21, end: 8.45, lines: ["ASATEX 陪你", "一夜好眠到天亮"] },
  { start: 8.45, end: 11.37, lines: ["穿上睡衣", "好好睡一覺"] },
  { start: 11.37, end: 15.1, lines: ["ASATEX 陪你", "一夜好眠到天亮"] },
];

// 場景切點（格）
const S2 = 75; // 唱歌鏡頭
const S3 = 212; // 商品
const S4 = 284; // 收尾 CTA

// 原圖 1024×1024，鋪滿 1920 高 → 放大 1.875
const K = 1920 / 1024;

const Store: React.FC<{ x0: number; zoom?: number; blur?: number; dim?: number; children?: React.ReactNode }> = ({ x0, zoom = 1, blur = 0, dim = 0, children }) => (
  <AbsoluteFill style={{ overflow: "hidden", background: "#000" }}>
    <div
      style={{
        position: "absolute",
        width: 1024,
        height: 1024,
        transformOrigin: "0 0",
        transform: `translate(540px, 960px) scale(${K * zoom}) translate(${-x0 - 288}px, -512px)`,
        filter: blur ? `blur(${blur}px)` : undefined,
      }}
    >
      <Img src={staticFile("store.jpg")} style={{ width: 1024, height: 1024 }} />
      {children}
    </div>
    {dim ? <AbsoluteFill style={{ background: `rgba(10,14,28,${dim})` }} /> : null}
  </AbsoluteFill>
);

const Headline: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const idx = Math.max(0, LYRICS.findIndex((l, i) => t < (LYRICS[i + 1]?.start ?? Infinity)));
  const ly = LYRICS[idx];
  const chars = ly.lines.join("").replace(/ /g, "").length;
  const sung = interpolate(t, [ly.start, ly.end - 0.3], [0, chars], clamp);
  const enter = spring({ frame: frame - Math.round((idx === 0 ? 0 : ly.start) * FPS), fps: FPS, config: { damping: 18, stiffness: 160 } });
  let n = 0;
  return (
    <div
      style={{
        position: "absolute",
        top: 1150,
        left: 70,
        right: 70,
        textAlign: "center",
        fontFamily: FONT,
        fontWeight: 600,
        fontSize: 104,
        lineHeight: 1.22,
        letterSpacing: 4,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 30}px)`,
      }}
    >
      {ly.lines.map((line) => (
        <div key={line}>
          {[...line].map((c, i) => {
            if (c === " ") return <span key={i}> </span>;
            const k = interpolate(sung, [n, n + 1], [0, 1], clamp);
            n++;
            return (
              <span key={i} style={{ color: `rgba(255,255,255,${0.5 + 0.5 * k})`, textShadow: `0 4px 24px rgba(0,0,0,${0.35 + 0.25 * k})` }}>
                {c}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

const Shade: React.FC = () => (
  <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(12,16,32,0) 50%, rgba(12,16,32,.55) 60%, rgba(12,16,32,.72) 76%, rgba(12,16,32,.4) 100%)" }} />
);

// 第 1 幕：店內全景慢慢推近
const SceneHook: React.FC = () => {
  const frame = useCurrentFrame();
  const z = interpolate(frame, [0, S2], [1, 1.08], { ...clamp, easing: Easing.out(Easing.quad) });
  return <Store x0={247} zoom={z} />;
};

// 第 2 幕：唱歌鏡頭（InfiniteTalk）
const SceneSing: React.FC = () => {
  const frame = useCurrentFrame();
  const pop = spring({ frame, fps: FPS, config: { damping: 16, stiffness: 180 } });
  return (
    <AbsoluteFill>
      <Store x0={247} zoom={1.15} blur={18} dim={0.45} />
      <div
        style={{
          position: "absolute",
          left: 60,
          top: 170,
          width: 960,
          height: 960,
          borderRadius: 36,
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(0,0,0,.45)",
          transform: `scale(${0.9 + 0.1 * pop})`,
          opacity: pop,
        }}
      >
        <OffthreadVideo src={staticFile("sing.mp4")} muted style={{ width: 960, height: 960 }} />
      </div>
    </AbsoluteFill>
  );
};

// 第 3 幕：由左往右帶過店內商品，標籤釘在原圖座標上
const TAGS = [
  { x: 150, y: 520, text: "睡衣", at: 4 },
  { x: 760, y: 470, text: "睡袍", at: 46 },
  { x: 915, y: 560, text: "寢具", at: 56 },
];
const SceneProducts: React.FC = () => {
  const frame = useCurrentFrame();
  const x0 = interpolate(frame, [14, 62], [0, 448], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  return (
    <Store x0={x0} zoom={1}>
      {TAGS.map((t) => {
        const s = spring({ frame: frame - t.at, fps: FPS, config: { damping: 14, stiffness: 200 } });
        return (
          <div
            key={t.text}
            style={{
              position: "absolute",
              left: t.x,
              top: t.y,
              transform: `translate(-50%, -50%) scale(${s / K})`,
              fontFamily: FONT,
              fontWeight: 600,
              fontSize: 46,
              color: NAVY,
              background: "rgba(255,255,255,.94)",
              padding: "14px 34px",
              borderRadius: 999,
              whiteSpace: "nowrap",
              boxShadow: "0 10px 30px rgba(0,0,0,.25)",
            }}
          >
            <span style={{ display: "inline-block", width: 16, height: 16, borderRadius: 8, background: RED, marginRight: 14, verticalAlign: "middle" }} />
            {t.text}
          </div>
        );
      })}
    </Store>
  );
};

// 第 4 幕：收尾，品牌＋行動呼籲
const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [0, 6], [0, 1], clamp);
  const a = spring({ frame: frame - 2, fps: FPS, config: { damping: 15, stiffness: 170 } });
  const b = spring({ frame: frame - 10, fps: FPS, config: { damping: 15, stiffness: 170 } });
  const c = spring({ frame: frame - 18, fps: FPS, config: { damping: 15, stiffness: 170 } });
  return (
    <AbsoluteFill style={{ background: NAVY, opacity: fade }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 55%, rgba(255,255,255,.10), rgba(0,0,0,0) 60%)" }} />
      {/* 頭像：從原圖裁臉 */}
      <div
        style={{
          position: "absolute",
          left: 540 - 170,
          top: 290,
          width: 340,
          height: 340,
          borderRadius: 170,
          overflow: "hidden",
          border: "6px solid #fff",
          transform: `scale(${a})`,
          boxShadow: "0 20px 60px rgba(0,0,0,.35)",
        }}
      >
        <Img src={staticFile("store.jpg")} style={{ position: "absolute", width: 1024 * 1.4, height: 1024 * 1.4, left: -(525 * 1.4 - 170), top: -(265 * 1.4 - 170) }} />
      </div>
      <div style={{ position: "absolute", top: 680, width: "100%", textAlign: "center", opacity: b, transform: `translateY(${(1 - b) * 24}px)` }}>
        <div style={{ fontFamily: "Helvetica Neue, Arial, sans-serif", fontWeight: 800, fontSize: 120, letterSpacing: 18, color: "#fff", paddingLeft: 18 }}>ASATEX</div>
        <div style={{ width: 120, height: 8, background: RED, borderRadius: 4, margin: "18px auto 0" }} />
        <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: 44, letterSpacing: 10, color: "rgba(255,255,255,.75)", marginTop: 26 }}>睡衣・睡袍・寢具</div>
      </div>
      <div style={{ position: "absolute", top: 985, width: "100%", textAlign: "center", opacity: c, transform: `scale(${0.9 + 0.1 * c})` }}>
        <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 52, color: "#fff", background: RED, padding: "22px 64px", borderRadius: 999, letterSpacing: 6 }}>今晚，好好睡</span>
      </div>
    </AbsoluteFill>
  );
};

export const Ad: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: NAVY }}>
      <Sequence durationInFrames={S2}>
        <SceneHook />
      </Sequence>
      <Sequence from={S2} durationInFrames={S3 - S2}>
        <SceneSing />
      </Sequence>
      <Sequence from={S3} durationInFrames={S4 - S3 + 6}>
        <SceneProducts />
      </Sequence>
      <Sequence from={S4}>
        <SceneCTA />
      </Sequence>
      <Shade />
      <Headline />
      <Audio
        src={staticFile("song.mp3")}
        trimBefore={Math.round(SONG_OFFSET * fps)}
        volume={(f) => interpolate(f, [0, 4, DURATION - 14, DURATION], [0, 1, 1, 0], clamp)}
      />
    </AbsoluteFill>
  );
};
