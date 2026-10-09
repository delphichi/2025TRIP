import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { CameraMotionBlur } from "@remotion/motion-blur";
import { Glint } from "../lib/Glint";
import { HeroPlate, heroPoint } from "../lib/hero";
import { EXPO_IN, EXPO_OUT, SLAM, shake, tween } from "../lib/anim";
import { C, FONT } from "../theme";

// 鑽石沿小腿由腳踝往膝蓋亮（原圖座標，取自腿部輪廓分析）
const TRAIL: [number, number][] = [
  [425, 980], [410, 880], [396, 780], [386, 680], [376, 580], [366, 480], [432, 305],
];
const TRAIL_START = 30;
const TRAIL_STEP = 3;
const LAST = TRAIL.length - 1;

const Word: React.FC<{ f: number; at: number; color?: string; children: React.ReactNode }> = ({ f, at, color = C.ink, children }) => (
  <span
    style={{
      display: "inline-block",
      color,
      opacity: interpolate(f, [at, at + 1.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      scale: String(f < at ? 0 : tween(f, at, at + 7, 2.6, 1, SLAM)),
      transformOrigin: "50% 60%",
    }}
  >
    {children}
  </span>
);

const Title: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      {/* 直排大標，由下往上讀；字切在八分音符上：PANTY f0 → DE f7 → RED f15 */}
      <div
        style={{
          position: "absolute",
          left: 690,
          top: 1545,
          rotate: "-90deg",
          transformOrigin: "0 0",
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 196,
          lineHeight: 0.9,
          letterSpacing: -4,
          whiteSpace: "nowrap",
        }}
      >
        <div>
          <Word f={f} at={0}>PANTY</Word>
        </div>
        <div>
          <Word f={f} at={7}>DE</Word> <Word f={f} at={15} color={C.red}>RED</Word>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const S3Reveal: React.FC = () => {
  const f = useCurrentFrame();
  const sh = shake(f, [0], 9, 8);
  const zoomOut = tween(f, 51, 59, 1, 34, EXPO_IN);

  return (
    <AbsoluteFill style={{ translate: `${sh.x}px ${sh.y}px` }}>
      <HeroPlate f={f} />

      {/* 副標底下的米白漸層 */}
      <AbsoluteFill
        style={{
          opacity: tween(f, 28, 36, 0, 1),
          background: `linear-gradient(180deg, rgba(244,238,226,0) 78%, rgba(244,238,226,.92) 88%, ${C.cream} 100%)`,
        }}
      />

      <CameraMotionBlur samples={6} shutterAngle={200}>
        <Title />
      </CameraMotionBlur>

      <Img
        src={staticFile("logo-asahi.png")}
        style={{
          position: "absolute",
          right: 70,
          top: 96,
          width: 220,
          opacity: tween(f, 12, 20, 0, 1),
          translate: `0px ${tween(f, 12, 22, -24, 0)}px`,
        }}
      />

      <svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{ position: "absolute" }}>
        {TRAIL.map(([x, y], i) => {
          const t = TRAIL_START + i * TRAIL_STEP;
          const [sx, sy] = heroPoint(f, x, y);
          const born = interpolate(f, [t, t + 2, t + 6], [0, 1.4, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO_OUT });
          const fade = i === LAST ? 1 : tween(f, t + 9, t + 18, 1, 0.25);
          return (
            <Glint
              key={i}
              x={sx}
              y={sy}
              size={28 + i * 7}
              scale={born * (i === LAST ? zoomOut : 1)}
              streak={born * (60 + i * 14)}
              opacity={fade}
            />
          );
        })}
      </svg>

      {/* 副標：字距由 0.6em 收到 0.2em */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 1700,
          textAlign: "center",
          fontFamily: FONT,
          fontWeight: 300,
          fontSize: 56,
          color: C.goldD,
          whiteSpace: "nowrap",
          opacity: tween(f, 32, 38, 0, 1),
          letterSpacing: `${tween(f, 32, 50, 0.6, 0.2)}em`,
          paddingLeft: `${tween(f, 32, 50, 0.6, 0.2)}em`,
        }}
      >
        BRILLA A CADA PASO
      </div>
      <div
        style={{
          position: "absolute",
          left: 250,
          top: 1790,
          width: 580,
          height: 3,
          background: C.goldD,
          scale: `${tween(f, 38, 50, 0, 1)} 1`,
        }}
      />

      {/* 膝蓋那顆鑽石放大填滿 → 白閃 */}
      <AbsoluteFill
        style={{
          background: "#fff",
          opacity: Math.max(interpolate(f, [0, 2, 5], [0.35, 0.35, 0], { extrapolateRight: "clamp" }), tween(f, 53, 59, 0, 1, EXPO_IN)),
        }}
      />
    </AbsoluteFill>
  );
};
