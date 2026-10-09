import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { Glint } from "../lib/Glint";
import { SLAM, pop, tween } from "../lib/anim";
import { C, FONT } from "../theme";

// 新 LOGO 492×372（透明底），放大 1.38 倍 —— 點陣圖的上限
const W = 680;
const H = (372 / 492) * W;
const X = (1080 - W) / 2;
const Y = 520;
// ASATEX 標牌上 X 字的位置（LOGO 原圖座標 → 畫面）
const XS = W / 492;
const STAR: [number, number] = [X + 308 * XS, Y + 78 * XS];

export const S7Logo: React.FC = () => {
  const f = useCurrentFrame();
  const sweep = tween(f, 10, 22, 110, -10);
  return (
    <AbsoluteFill style={{ background: C.cream }}>
      <AbsoluteFill
        style={{
          scale: String(tween(f, 0, 12, 1.14, 1, SLAM)),
          opacity: tween(f, 0, 3, 0, 1),
          transformOrigin: `540px ${Y + H / 2}px`,
        }}
      >
        <Img src={staticFile("logo-asahi.png")} style={{ position: "absolute", left: X, top: Y, width: W, height: H }} />
        {/* 斜向光帶掃過 LOGO：以 LOGO 本身當遮罩，只亮在圖形上 */}
        <div
          style={{
            position: "absolute",
            left: X,
            top: Y,
            width: W,
            height: H,
            WebkitMaskImage: `url(${staticFile("logo-asahi.png")})`,
            maskImage: `url(${staticFile("logo-asahi.png")})`,
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",
            backgroundImage: "linear-gradient(115deg, rgba(255,255,255,0) 40%, rgba(255,255,255,.7) 50%, rgba(255,255,255,0) 60%)",
            backgroundSize: "300% 100%",
            backgroundPosition: `${sweep}% 0%`,
          }}
        />
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: Y + H + 70,
          textAlign: "center",
          fontFamily: FONT,
          fontWeight: 600,
          fontSize: 40,
          color: C.navy,
          whiteSpace: "nowrap",
          letterSpacing: `${tween(f, 2, 14, 0.42, 0.18)}em`,
          paddingLeft: `${tween(f, 2, 14, 0.42, 0.18)}em`,
          opacity: tween(f, 2, 7, 0, 1),
        }}
      >
        ELEGANCIA QUE TE ACOMPAÑA
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: Y + H + 150,
          textAlign: "center",
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 44,
          letterSpacing: 3,
          color: C.red,
          opacity: tween(f, 6, 11, 0, 1),
          translate: `0px ${tween(f, 6, 13, 18, 0)}px`,
        }}
      >
        PANTY DE RED · #CK2603L
      </div>

      <svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{ position: "absolute" }}>
        {/* 接住 S6 縮成一點的徽章 */}
        <Glint x={540} y={900} size={120} scale={pop(f, 0, 6, 1.5)} opacity={tween(f, 4, 9, 1, 0)} streak={tween(f, 0, 6, 0, 300)} />
        {/* 收在 X 上 —— 和開場第一格同一顆光 */}
        <Glint
          x={STAR[0]}
          y={STAR[1]}
          size={54}
          scale={pop(f, 20, 7, 1.6) * (1 + 0.06 * Math.sin(f * 0.8))}
          rotate={tween(f, 20, 28, -45, 0)}
          streak={tween(f, 20, 29, 0, 240)}
        />
      </svg>
    </AbsoluteFill>
  );
};
