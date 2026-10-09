import React from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";
import { CameraMotionBlur } from "@remotion/motion-blur";
import { Glint } from "../lib/Glint";
import { Mesh } from "../lib/Mesh";
import { EXPO_OUT, IN_OUT, SLAM, pop, shake, tween } from "../lib/anim";
import { C, FONT } from "../theme";

const CODE = "#CK2603L";
const POOL = "0123456789ABCDEFGHJKLMNPRSTUVWXYZ";
export const EXIT = 37; // 與 S6 同速推出（輸送帶）

/** 型號逐字翻牌：落定前每格亂跳。 */
const Flip: React.FC<{ f: number }> = ({ f }) => (
  <span style={{ display: "inline-flex" }}>
    {CODE.split("").map((ch, i) => {
      const land = 3 + i * 1.5;
      const shown = f >= land ? ch : POOL[Math.floor(random(`c${i}-${Math.floor(f)}`) * POOL.length)];
      return (
        <span
          key={i}
          style={{
            display: "inline-block",
            width: ch === "#" ? 52 : 54,
            textAlign: "center",
            opacity: f < 1 ? 0 : f >= land ? 1 : 0.55,
            translate: `0px ${f >= land ? tween(f, land, land + 3, -14, 0) : 0}px`,
          }}
        >
          {shown}
        </span>
      );
    })}
  </span>
);

const Plate: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 760,
          width: 880,
          height: 160,
          borderRadius: 30,
          background: C.red,
          boxShadow: "0 24px 60px rgba(0,0,0,.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 76,
          color: C.cream,
          fontVariantNumeric: "tabular-nums",
          opacity: interpolate(f, [0, 1], [0, 1], { extrapolateRight: "clamp" }),
          scale: String(tween(f, 0, 8, 1.7, 1, SLAM)),
          rotate: `${tween(f, 0, 9, -9, -3)}deg`,
        }}
      >
        MODELO&nbsp;<Flip f={f} />
      </div>
    </AbsoluteFill>
  );
};

export const S5Specs: React.FC = () => {
  const f = useCurrentFrame();
  const sh = shake(f, [0], 14, 8);
  const exit = tween(f, EXIT, EXIT + 8, 0, -1080, IN_OUT);
  const n98 = Math.round(tween(f, 15, 27, 0, 98));
  const n2 = Math.round(tween(f, 17, 27, 0, 2));
  // 三聯屏往上壓成一條色彩索引
  const stripTop = tween(f, 0, 9, 0, 520);
  const stripH = tween(f, 0, 9, 1640, 22);

  return (
    <AbsoluteFill style={{ background: C.ink, translate: `${exit + sh.x}px ${sh.y}px` }}>
      <svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{ position: "absolute" }}>
        <Mesh spacing={120} width={14} color="#262626" drift={[f * 2, f * 1.2]} opacity={0.9} />
      </svg>
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 50%, rgba(20,20,20,.2) 30%, rgba(20,20,20,.95) 100%)" }} />

      {["#3a3a3a", C.redHi, C.skin].map((c, i) => (
        <div
          key={c}
          style={{
            position: "absolute",
            left: tween(f, 0, 9, i * 360, 90 + i * 300),
            width: tween(f, 0, 9, 360, 300),
            top: stripTop,
            height: stripH,
            background: c,
          }}
        />
      ))}

      <CameraMotionBlur samples={6} shutterAngle={180}>
        <Plate />
      </CameraMotionBlur>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 1040,
          textAlign: "center",
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 56,
          letterSpacing: 2,
          color: C.cream,
          fontVariantNumeric: "tabular-nums",
          opacity: tween(f, 15, 19, 0, 1),
          translate: `0px ${tween(f, 15, 23, 30, 0)}px`,
        }}
      >
        <span style={{ color: C.gold }}>{n98}%</span> NYLON · <span style={{ color: C.gold }}>{n2}%</span> SPANDEX
      </div>

      <div
        style={{
          position: "absolute",
          left: 90,
          top: 1230,
          width: 900,
          height: 130,
          borderRadius: 65,
          background: "#0b0b0b",
          border: `5px solid ${C.gold}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          translate: `${tween(f, 30, 40, 1100, 0, EXPO_OUT)}px 0px`,
        }}
      >
        <span
          style={{
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 46,
            letterSpacing: 1,
            color: "transparent",
            backgroundImage: `linear-gradient(100deg, ${C.gold} 0%, ${C.gold} 42%, #fff 50%, ${C.gold} 58%, ${C.gold} 100%)`,
            backgroundSize: "300% 100%",
            backgroundPosition: `${tween(f, 33, 44, 100, 0)}% 0%`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
          }}
        >
          CON BRILLOS DE DIAMANTE
        </span>
      </div>

      <svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{ position: "absolute", translate: `${tween(f, 30, 40, 1100, 0, EXPO_OUT)}px 0px` }}>
        <Glint x={150} y={1295} size={34} scale={pop(f, 36, 6, 1.6)} />
        <Glint x={930} y={1295} size={34} scale={pop(f, 37, 6, 1.6)} />
        <Glint x={968} y={1236} size={76} scale={pop(f, 40, 7, 1.5)} streak={tween(f, 40, 48, 0, 190)} />
      </svg>
    </AbsoluteFill>
  );
};
