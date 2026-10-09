import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Glint } from "../lib/Glint";
import { EXPO_IN, EXPO_OUT, IN_OUT, SLAM, pop, shake, tween } from "../lib/anim";
import { C, FONT } from "../theme";

/** S6 的 Sequence 提早 8 格開始（推入轉場），B0 是它的第一個拍點（全片 f225）。 */
export const LEAD = 8;
const CX = 540;
const CY = 820;
const R = 330;
const DOTS = [...Array(6).fill(C.ink), ...Array(3).fill(C.red), ...Array(3).fill(C.skin)] as string[];
const ROWS: [string, string, string][] = [
  ["NEGRO", "6", C.ink],
  ["ROJO", "3", C.red],
  ["PIEL", "3", C.skin],
];
const HIT = 30; // 百打重拍（全片 f255）

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const Dozen: React.FC<{ b: number }> = ({ b }) => {
  const ring = tween(b, HIT - 4, HIT, 1, 0, EXPO_IN); // 收縮吸進中心
  const landed = b < 0 ? 0 : Math.min(12, Math.floor(b / 2) + 1);
  const lastLand = (landed - 1) * 2;
  const bump = 1 + 0.1 * Math.max(0, 1 - (b - lastLand) / 3);
  const out = tween(b, HIT - 4, HIT - 1, 1, 0);
  return (
    <AbsoluteFill style={{ background: C.cream }}>
      <svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{ position: "absolute" }}>
        <circle cx={CX} cy={CY} r={R * ring} fill="none" stroke="#d9cfbd" strokeWidth={4} strokeDasharray="4 16" opacity={tween(b, -6, 6, 0, 1) * out} />
        {DOTS.map((c, i) => {
          const land = i * 2;
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / 12;
          const drop = interpolate(b, [land - 4, land], [-110, 0], { ...clamp, easing: EXPO_IN });
          const squash = interpolate(b, [land, land + 2, land + 5], [0.72, 1.12, 1], clamp);
          return (
            <ellipse
              key={i}
              cx={CX + R * ring * Math.cos(a)}
              cy={CY + R * ring * Math.sin(a) + drop + (1 - squash) * 26}
              rx={52 * (2 - squash)}
              ry={52 * squash}
              fill={c}
              opacity={interpolate(b, [land - 4, land - 2], [0, 1], clamp)}
            />
          );
        })}
      </svg>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: CY - 150,
          textAlign: "center",
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 240,
          lineHeight: 1,
          letterSpacing: -6,
          color: C.ink,
          fontVariantNumeric: "tabular-nums",
          opacity: landed > 0 ? out : 0,
          scale: String(bump),
        }}
      >
        {landed}
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: CY + 100,
          textAlign: "center",
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 52,
          letterSpacing: 6,
          color: C.goldD,
          opacity: tween(b, 22, 25, 0, 1) * out,
          translate: `0px ${tween(b, 22, 28, 20, 0)}px`,
        }}
      >
        = 1 DOCENA
      </div>
      {ROWS.map(([name, q, c], j) => (
        <div
          key={name}
          style={{
            position: "absolute",
            left: 270,
            width: 540,
            top: 1340 + j * 120,
            display: "flex",
            alignItems: "center",
            gap: 30,
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 56,
            letterSpacing: 4,
            color: C.ink,
            opacity: tween(b, 15 + j * 3, 18 + j * 3, 0, 1) * out,
            translate: `${tween(b, 15 + j * 3, 22 + j * 3, -40, 0)}px 0px`,
          }}
        >
          <span style={{ width: 60, height: 60, borderRadius: 30, background: c, flex: "none" }} />
          <span style={{ flex: 1 }}>{name}</span>
          <span style={{ fontWeight: 800 }}>× {q}</span>
        </div>
      ))}
    </AbsoluteFill>
  );
};

const Badge: React.FC<{ b: number }> = ({ b }) => {
  const k = b - HIT;
  const reveal = tween(k, 0, 7, 0, 1300, EXPO_OUT);
  const exit = tween(k, 11, 15, 1, 0.04, EXPO_IN);
  const sh = shake(k, [0], 16, 8);
  const count = Math.round(tween(k, 0, 10, 1, 100, EXPO_OUT));
  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(circle at 50% 47%, #24211c, #141414 60%)",
        clipPath: `circle(${reveal}px at 540px 900px)`,
        translate: `${sh.x}px ${sh.y}px`,
      }}
    >
      <svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{ position: "absolute" }}>
        {[0, 4].map((d) => (
          <circle
            key={d}
            cx={540}
            cy={900}
            r={tween(k, d, d + 14, 390, 780)}
            fill="none"
            stroke={C.gold}
            strokeWidth={tween(k, d, d + 14, 10, 1)}
            opacity={tween(k, d, d + 14, 0.6, 0)}
          />
        ))}
      </svg>
      <AbsoluteFill style={{ scale: String(tween(k, 0, 8, 0.4, 1, SLAM) * exit), transformOrigin: "540px 900px" }}>
        <div
          style={{
            position: "absolute",
            left: 150,
            top: 510,
            width: 780,
            height: 780,
            borderRadius: 390,
            background: "#0c0c0c",
            border: `12px solid ${C.gold}`,
            boxSizing: "border-box",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 180,
            top: 540,
            width: 720,
            height: 720,
            borderRadius: 360,
            border: `3px solid ${C.gold}`,
            opacity: 0.6,
            boxSizing: "border-box",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 640,
            textAlign: "center",
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 300,
            lineHeight: 1,
            letterSpacing: -10,
            color: C.gold,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {count}
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 960,
            textAlign: "center",
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 100,
            lineHeight: 1,
            color: C.gold,
            opacity: tween(k, 3, 6, 0, 1),
            translate: `0px ${tween(k, 3, 9, 24, 0)}px`,
          }}
        >
          DOCENAS
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 1080,
            textAlign: "center",
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 50,
            letterSpacing: 6,
            color: C.cream,
            opacity: tween(k, 6, 9, 0, 1),
          }}
        >
          POR CAJA
        </div>
      </AbsoluteFill>
      <svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{ position: "absolute" }}>
        <Glint x={830} y={640} size={90} scale={pop(k, 7, 7, 1.5) * exit} streak={tween(k, 7, 14, 0, 260) * exit} />
      </svg>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 1500,
          textAlign: "center",
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 50,
          letterSpacing: 4,
          color: "#bdb3a2",
          opacity: tween(k, 8, 11, 0, 1) * tween(k, 11, 14, 1, 0),
        }}
      >
        6 + 3 + 3 = 1 DOCENA
      </div>
    </AbsoluteFill>
  );
};

export const S6Dozen: React.FC = () => {
  const L = useCurrentFrame();
  const b = L - LEAD;
  return (
    <AbsoluteFill style={{ translate: `${tween(L, 0, LEAD, 1080, 0, IN_OUT)}px 0px` }}>
      <Dozen b={b} />
      {b >= HIT ? <Badge b={b} /> : null}
    </AbsoluteFill>
  );
};
