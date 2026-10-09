import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { CameraMotionBlur } from "@remotion/motion-blur";
import { Glint } from "../lib/Glint";
import { Mesh } from "../lib/Mesh";
import { EXPO_OUT, pop, tween } from "../lib/anim";
import { BEAT, C, FONT } from "../theme";

export type Swatch = {
  name: string;
  bg: string; // 網後面的底
  strand: string;
  hi: string;
  label: string;
};

// NEGRO 疊在膚色上 = 穿上的樣子；ROJO、PIEL 放墨黑上
export const SWATCHES: Swatch[] = [
  { name: "NEGRO", bg: "linear-gradient(180deg,#d8ab88,#a87650)", strand: "#151515", hi: "#6a6a6a", label: C.ink },
  { name: "ROJO", bg: C.ink, strand: C.redHi, hi: "#ff8a8f", label: C.cream },
  { name: "PIEL", bg: C.ink, strand: C.skin, hi: "#f2d6bd", label: C.cream },
];
const FADE = ["rgba(168,118,80,0)", "rgba(20,20,20,0)", "rgba(20,20,20,0)"];
const FADE_TO = ["#a87650", C.ink, C.ink];

const SPACING = 170;
const TILT = 8;

/** 三張卡共用同一條漂移：換的是顏色，不是動作 —— 眼睛不會斷。 */
export const drift = (f: number): [number, number] => [f * 4.2, f * 2.4];

export const MacroMesh: React.FC<{ s: Swatch; f: number; glintAt?: number; spacing?: number; width?: number }> = ({
  s,
  f,
  glintAt = 0,
  spacing = SPACING,
  width = 30,
}) => (
  <svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{ position: "absolute" }}>
    <Mesh spacing={spacing} width={width} color={s.strand} highlight={s.hi} drift={drift(f)} tilt={TILT}>
      <Glint
        x={spacing}
        y={-spacing}
        size={150}
        rotate={-45 - TILT}
        scale={pop(f, glintAt, 7, 1.5)}
        streak={tween(f, glintAt, glintAt + 10, 0, 420)}
      />
      <Glint x={-2 * spacing} y={2 * spacing} size={60} rotate={-45 - TILT} scale={pop(f, glintAt + 3, 6)} />
      <Glint x={2 * spacing} y={-4 * spacing} size={44} rotate={-45 - TILT} scale={pop(f, glintAt + 5, 6)} />
    </Mesh>
  </svg>
);

const Card: React.FC<{ i: number; f: number }> = ({ i, f }) => {
  const s = SWATCHES[i];
  const local = f - i * BEAT;
  return (
    <AbsoluteFill style={{ background: s.bg }}>
      <MacroMesh s={s} f={f} glintAt={i * BEAT} />
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${FADE[i]} 66%, ${FADE_TO[i]} 92%)` }} />
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 120,
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 46,
          letterSpacing: 6,
          color: s.label,
          opacity: tween(local, 0, 4, 0, 1),
        }}
      >
        0{i + 1} / 03
      </div>
      {/* 色名由下方遮罩升起 */}
      <div style={{ position: "absolute", left: 72, bottom: 120, overflow: "hidden", height: 240 }}>
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 236,
            lineHeight: 1,
            letterSpacing: -6,
            color: s.label,
            translate: `0px ${tween(local, 0, 8, 100, 0, EXPO_OUT)}%`,
          }}
        >
          {s.name}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Triptych: React.FC = () => {
  const f = useCurrentFrame(); // 這裡的 f 是 S4 的本地影格（Sequence 內）
  const t = 3 * BEAT;
  const off = [tween(f, t, t + 10, -380, 0), 0, tween(f, t, t + 10, 380, 0)];
  const midScale = tween(f, t, t + 10, 1.5, 1);
  return (
    <AbsoluteFill>
      {SWATCHES.map((s, i) => (
        <div
          key={s.name}
          style={{
            position: "absolute",
            left: i * 360,
            top: 0,
            width: 360,
            height: 1920,
            overflow: "hidden",
            background: s.bg,
            translate: `${off[i]}px 0px`,
            scale: i === 1 ? String(midScale) : "1",
            opacity: i === 1 ? tween(f, t, t + 3, 0, 1) : 1,
          }}
        >
          <div style={{ position: "absolute", left: -i * 360, top: 0, width: 1080, height: 1920 }}>
            <MacroMesh s={s} f={f} glintAt={t + 2 + i * 2} spacing={120} width={20} />
          </div>
        </div>
      ))}
    </AbsoluteFill>
  );
};

export const S4Colors: React.FC = () => {
  const f = useCurrentFrame();
  const t = 3 * BEAT;
  const active = Math.min(2, Math.floor(f / BEAT));
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      {f < t + 10 ? <Card i={active} f={f} /> : null}
      {f >= t ? (
        <>
          <CameraMotionBlur samples={6} shutterAngle={180}>
            <Triptych />
          </CameraMotionBlur>
          {[360, 720].map((x) => (
            <div
              key={x}
              style={{
                position: "absolute",
                left: x - 3,
                top: 0,
                width: 6,
                height: 1640,
                background: C.gold,
                scale: `1 ${tween(f, t + 4, t + 13, 0, 1)}`,
                transformOrigin: "50% 0%",
              }}
            />
          ))}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 1640,
              width: 1080,
              height: 280,
              background: C.ink,
              borderTop: `6px solid ${C.gold}`,
              translate: `0px ${tween(f, t + 2, t + 10, 280, 0)}px`,
              display: "flex",
            }}
          >
            {SWATCHES.map((s, i) => (
              <div
                key={s.name}
                style={{
                  flex: 1,
                  textAlign: "center",
                  paddingTop: 80,
                  fontFamily: FONT,
                  fontWeight: 900,
                  fontSize: 84,
                  color: C.cream,
                  opacity: tween(f, t + 6 + i * 2, t + 10 + i * 2, 0, 1),
                }}
              >
                {s.name}
              </div>
            ))}
          </div>
        </>
      ) : null}
      {/* 從 S3 白閃接進來 */}
      <AbsoluteFill style={{ background: "#fff", opacity: tween(f, 0, 5, 1, 0) }} />
    </AbsoluteFill>
  );
};
