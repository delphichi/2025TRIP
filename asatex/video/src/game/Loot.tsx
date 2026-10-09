import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile } from "remotion";
import { EXPO_IN, EXPO_OUT, SLAM, tween } from "../lib/anim";
import { GEMS, Gem } from "./MapLayers";
import { Sticker } from "./Hud";
import { BRAND, G, MONO } from "./theme";
import { BOX_AT, toScreen } from "./world";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const IN = 225;
const STAMP = 255;
const OUT = 270;

/** 4 芒星小圖示：字型裡沒有 ✦，改畫成和片中鑽石光同一個形狀。 */
const Star: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg viewBox="-10 -10 20 20" width={size} height={size} style={{ display: "inline-block", verticalAlign: "-0.1em", marginRight: 8 }}>
    <path d="M0,-10 Q1.1,-1.1 10,0 Q1.1,1.1 0,10 Q-1.1,1.1 -10,0 Q-1.1,-1.1 0,-10Z" fill={color} />
  </svg>
);

const Stat: React.FC<{ f: number; label: string; v: number; col: string; top: number }> = ({ f, label, v, col, top }) => {
  const k = tween(f, 240, 252, 0, 1, EXPO_OUT);
  return (
    <div style={{ position: "absolute", left: 50, right: 50, top, height: 40, display: "flex", alignItems: "center", gap: 24, opacity: tween(f, 238, 242, 0, 1) }}>
      <div style={{ width: 190, fontFamily: MONO, fontWeight: 700, fontSize: 30, letterSpacing: 3, color: G.ink }}>{label}</div>
      <div style={{ flex: 1, height: 36, borderRadius: 18, background: "#e3d9c8", border: `3px solid ${G.ink}`, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.max(3, v * k)}%`, background: col, borderRadius: 15 }} />
      </div>
      <div style={{ width: 90, textAlign: "right", fontFamily: MONO, fontWeight: 700, fontSize: 32, color: G.ink }}>{Math.round(v * k)}%</div>
    </div>
  );
};

export const Loot: React.FC<{ f: number }> = ({ f }) => {
  if (f < IN - 3 || f > OUT + 10) return null;
  const [bx, by] = toScreen(IN, [BOX_AT[0], BOX_AT[1] - 90]);
  const t = tween(f, IN, IN + 10, 0, 1, EXPO_OUT);
  const s = interpolate(f, [IN, IN + 10], [0.22, 1], { ...clamp, easing: SLAM }) * tween(f, OUT, OUT + 8, 1, 0.18, EXPO_IN);
  const ry = interpolate(f, [IN, IN + 10], [90, 0], { ...clamp, easing: EXPO_OUT });
  const tx = (bx - 540) * (1 - t);
  const ty = (by - 950) * (1 - t) + tween(f, OUT, OUT + 8, 0, -760, EXPO_IN);
  const layer = (at: number) => ({ opacity: tween(f, at, at + 4, 0, 1), translate: `0px ${tween(f, at, at + 8, 24, 0)}px` });
  const stampS = interpolate(f, [STAMP, STAMP + 3, STAMP + 8], [1.7, 0.94, 1], { ...clamp, easing: EXPO_OUT });
  return (
    <AbsoluteFill style={{ opacity: tween(f, OUT + 4, OUT + 8, 1, 0) }}>
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 300,
          width: 840,
          height: 1300,
          transform: `translate(${tx}px, ${ty}px) perspective(1800px) rotateY(${ry}deg) scale(${s})`,
          opacity: tween(f, IN - 3, IN, 0, 1),
        }}
      >
        <div style={{ position: "absolute", inset: 0, top: 16, borderRadius: 48, background: G.ink }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: 48, background: G.paper, border: `6px solid ${G.ink}`, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 24, top: 24, width: 780, height: 610, borderRadius: 26, overflow: "hidden" }}>
            <Img src={staticFile("hero.png")} style={{ width: 780, height: 780 * (1256 / 600), objectFit: "cover", translate: `0px ${tween(f, IN, OUT, -60, -150)}px` }} />
          </div>
          {/* 金邊框描一圈光 */}
          <div
            style={{
              position: "absolute",
              inset: 10,
              borderRadius: 38,
              border: `6px solid ${G.gold}`,
              WebkitMaskImage: `conic-gradient(#000 ${tween(f, IN + 2, IN + 14, 0, 360)}deg, transparent 0deg)`,
              maskImage: `conic-gradient(#000 ${tween(f, IN + 2, IN + 14, 0, 360)}deg, transparent 0deg)`,
            }}
          />
          <div style={{ position: "absolute", left: 48, top: 48, padding: "8px 24px", borderRadius: 28, background: G.ink, color: G.gold, fontFamily: MONO, fontWeight: 700, fontSize: 26, letterSpacing: 3, ...layer(IN + 6) }}>
            <Star size={22} color={G.gold} />
            LEGENDARIO
          </div>
          <div style={{ position: "absolute", left: 48, top: 660, fontFamily: BRAND, fontWeight: 900, fontSize: 84, lineHeight: 1, letterSpacing: -2, color: G.ink, ...layer(236) }}>
            PANTY DE <span style={{ color: G.red }}>RED</span>
          </div>
          <div style={{ position: "absolute", left: 48, top: 770, display: "flex", alignItems: "center", gap: 20, ...layer(239) }}>
            <div style={{ padding: "8px 20px", borderRadius: 14, background: G.red, color: "#fff", fontFamily: BRAND, fontWeight: 800, fontSize: 32, whiteSpace: "nowrap" }}>MODELO #CK2603L</div>
            <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 20, letterSpacing: 0, color: "rgba(20,20,20,.75)", whiteSpace: "nowrap", ...layer(242) }}>
              <Star size={18} color={G.red} />
              CON BRILLOS DE DIAMANTE
            </div>
          </div>
          <Stat f={f} label="NYLON" v={98} col={G.red} top={880} />
          <Stat f={f} label="SPANDEX" v={2} col={G.gold} top={960} />
          <svg viewBox="0 0 400 120" width={400} height={120} style={{ position: "absolute", left: 30, top: 1060, ...layer(246) }}>
            {GEMS.map((g, i) => (
              <Gem key={g.name} x={60 + i * 110} y={60} col={g.col} s={0.75} id={`card${i}`} />
            ))}
          </svg>
          <div style={{ position: "absolute", left: 50, top: 1186, fontFamily: MONO, fontWeight: 700, fontSize: 26, letterSpacing: 2, color: "rgba(20,20,20,.75)", ...layer(248) }}>
            6 + 3 + 3 = 1 DOCENA
          </div>
        </div>
        {/* ×100 徽章蓋章（全片最大的一拍） */}
        {f >= STAMP ? (
          <div
            style={{
              position: "absolute",
              left: 840 - 290,
              top: 1150 - 150,
              width: 300,
              height: 300,
              borderRadius: 150,
              background: G.ink,
              border: `10px solid ${G.gold}`,
              boxSizing: "border-box",
              rotate: `${interpolate(f, [STAMP, STAMP + 8], [-24, -12], clamp)}deg`,
              scale: String(stampS),
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 14px 0 rgba(20,20,20,.35)",
            }}
          >
            <div style={{ fontFamily: BRAND, fontWeight: 900, fontSize: 100, lineHeight: 1, color: G.gold }}>×100</div>
            <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 22, letterSpacing: 2, color: G.paper, marginTop: 6, textAlign: "center", lineHeight: 1.2 }}>
              DOCENAS
              <br />
              POR CAJA
            </div>
          </div>
        ) : null}
      </div>
      <Sticker f={f} at={258} out={OUT} x={540} y={262} text="¡MISIÓN CUMPLIDA!" color={G.pin} size={70} />
    </AbsoluteFill>
  );
};
