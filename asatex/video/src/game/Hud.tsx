import React from "react";
import { interpolate, spring } from "remotion";
import { EXPO_IN, EXPO_OUT, tween } from "../lib/anim";
import { GEMS, Gem } from "./MapLayers";
import { BRAND, DISPLAY, G, MONO } from "./theme";
import { FPS, GEM_D, PICK_F, along, camera, toScreen } from "./world";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const FLY = 10; // 色票飛進收集欄的格數
export const ARRIVE = PICK_F.map((p) => p + FLY); // 卡片變 LISTO 的影格
const sp = (f: number, start: number, k = 220, d = 18) => spring({ frame: f - start, fps: FPS, config: { stiffness: k, damping: d } });

/** 收集欄卡片中心（螢幕座標）。 */
const slot = (i: number): [number, number] => [116 + i * 322, 1626];

/** 有幾顆已經入袋、計數多少。 */
const got = (f: number) => ARRIVE.map((a) => f >= a);
const count = (f: number) => GEMS.reduce((s, g, i) => s + (f >= ARRIVE[i] ? g.q : 0), 0);

/** 數字「打一下」：變動當下 1.25 → 1 */
const punch = (f: number) => {
  let s = 1;
  for (const a of ARRIVE) if (f >= a && f < a + 8) s = Math.max(s, interpolate(f, [a, a + 8], [1.3, 1], { ...clamp, easing: EXPO_OUT }));
  return s;
};

export const Banner: React.FC<{ f: number }> = ({ f }) => {
  const y = interpolate(sp(f, 8), [0, 1], [-360, 0]) + tween(f, 216, 226, 0, -380, EXPO_IN);
  if (f < 8) return null;
  return (
    <div style={{ position: "absolute", left: 60, top: 76, width: 960, height: 230, translate: `0px ${y}px` }}>
      <div style={{ position: "absolute", inset: 0, top: 12, borderRadius: 40, background: G.ink }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: 40, background: G.paper, border: `5px solid ${G.ink}` }}>
        <div style={{ position: "absolute", left: 36, top: 30, padding: "6px 22px", borderRadius: 22, background: G.ink, color: G.paper, fontFamily: MONO, fontWeight: 700, fontSize: 24, letterSpacing: 4 }}>
          MISIÓN
        </div>
        <div
          style={{
            position: "absolute",
            left: 236,
            top: 30,
            padding: "4px 18px",
            borderRadius: 10,
            background: G.red,
            color: "#fff",
            fontFamily: BRAND,
            fontWeight: 800,
            fontSize: 28,
            scale: String(interpolate(f, [16, 19, 24], [0, 1.25, 1], { ...clamp, easing: EXPO_OUT })),
          }}
        >
          #CK2603L
        </div>
        <div style={{ position: "absolute", left: 36, top: 82, fontFamily: DISPLAY, fontWeight: 800, fontSize: 64, lineHeight: 1, color: G.ink, letterSpacing: -1 }}>ENCUENTRA</div>
        <div style={{ position: "absolute", left: 36, top: 150, fontFamily: BRAND, fontWeight: 900, fontSize: 54, lineHeight: 1, color: G.ink }}>
          PANTY DE <span style={{ color: G.red }}>RED</span>
        </div>
        <div style={{ position: "absolute", right: 40, top: 40, width: 200, textAlign: "center", opacity: tween(f, 30, 36, 0, 1) }}>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, letterSpacing: 3, color: G.ink, opacity: 0.6 }}>DOCENA</div>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 64, color: count(f) === 12 ? G.green : G.ink, scale: String(punch(f)) }}>
            {count(f)}/12
          </div>
        </div>
      </div>
    </div>
  );
};

export const Inventory: React.FC<{ f: number }> = ({ f }) => {
  if (f < 30) return null;
  const y = interpolate(sp(f, 30), [0, 1], [420, 0]) + tween(f, 210, 220, 0, 420, EXPO_IN);
  // 白色底板：滑到最新入袋的那張（彈簧）
  const plateX = 22 + 322 * sp(f, ARRIVE[1]) + 322 * sp(f, ARRIVE[2]);
  const plateOn = sp(f, ARRIVE[0]);
  const g = got(f);
  return (
    <div style={{ position: "absolute", left: 40, top: 1536, width: 1000, height: 300, translate: `0px ${y}px` }}>
      <div style={{ position: "absolute", inset: 0, top: 12, borderRadius: 40, background: G.ink }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: 40, background: G.paper, border: `5px solid ${G.ink}` }} />
      <div
        style={{
          position: "absolute",
          left: plateX,
          top: 20,
          width: 312,
          height: 262,
          borderRadius: 28,
          background: "#fff",
          border: `3px solid ${G.ink}`,
          opacity: plateOn,
          scale: String(0.9 + 0.1 * plateOn),
        }}
      />
      {/* 完成時光掃過三張卡 */}
      {f >= ARRIVE[2] ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 40,
            background: "linear-gradient(110deg, rgba(255,255,255,0) 40%, rgba(255,255,255,.85) 50%, rgba(255,255,255,0) 60%)",
            backgroundSize: "300% 100%",
            backgroundPosition: `${tween(f, ARRIVE[2], ARRIVE[2] + 14, 100, 0)}% 0%`,
          }}
        />
      ) : null}
      {GEMS.map((gm, i) => {
        const x = 22 + i * 322;
        const on = g[i];
        const pulse = on ? interpolate(f, [ARRIVE[i], ARRIVE[i] + 3, ARRIVE[i] + 9], [1, 1.12, 1], clamp) : 1;
        return (
          <div key={gm.name} style={{ position: "absolute", left: x, top: 20, width: 312, height: 262, scale: String(pulse) }}>
            <svg width={110} height={110} viewBox="-55 -55 110 110" style={{ position: "absolute", left: 0, top: 16 }}>
              {on ? (
                <Gem x={0} y={0} col={gm.col} s={0.62} id={`inv${i}`} />
              ) : (
                <path d="M0,-34 L34,0 L0,34 L-34,0Z" fill="none" stroke={G.ink} strokeWidth={4} strokeDasharray="8 8" opacity={0.4} />
              )}
            </svg>
            <div style={{ position: "absolute", left: 104, top: 36, fontFamily: DISPLAY, fontWeight: 800, fontSize: 46, color: G.ink }}>{gm.name}</div>
            <div style={{ position: "absolute", left: 26, top: 130, fontFamily: MONO, fontWeight: 600, fontSize: 26, letterSpacing: 2, color: G.ink, opacity: 0.7 }}>
              {gm.q} UNIDADES
            </div>
            <div style={{ position: "absolute", left: 26, top: 196, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 18, height: 18, borderRadius: 9, background: on ? G.green : "#c9bfae" }} />
              <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, letterSpacing: 2, color: G.ink, opacity: on ? 1 : 0.45 }}>{on ? "LISTO" : "PENDIENTE"}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** 撿到的色票沿弧線飛進收集欄；同時浮出 +6／+3。 */
export const Pickups: React.FC<{ f: number }> = ({ f }) => (
  <svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{ position: "absolute" }}>
    {GEMS.map((gm, i) => {
      const p = PICK_F[i];
      if (f < p || f > p + 26) return null;
      const [sx, sy] = toScreen(p, [along(GEM_D[i])[0], along(GEM_D[i])[1] - 46]);
      const [tx, ty] = slot(i);
      const t = interpolate(f, [p + 2, p + 2 + FLY], [0, 1], { ...clamp, easing: EXPO_IN });
      const x = sx + (tx - sx) * t;
      const y = sy + (ty - sy) * t - Math.sin(t * Math.PI) * 380;
      const s = (0.85 * camZ(p)) * (1 - t) + 0.62 * t;
      const ft = f - p;
      return (
        <g key={gm.name}>
          {t < 1 ? <Gem x={x} y={y} col={gm.col} s={s * (f < p + 2 ? 1.25 : 1)} id={`fly${i}`} shine={1} /> : null}
          <g transform={`translate(${sx + 40} ${sy - 90 - ft * 3}) rotate(-6)`} opacity={interpolate(ft, [0, 2, 16, 22], [0, 1, 1, 0], clamp)}>
            <rect x={-64} y={-56} width={128} height={80} rx={16} fill={G.pin} stroke={G.ink} strokeWidth={5} />
            <text x={0} y={6} textAnchor="middle" fontFamily={DISPLAY} fontWeight={800} fontSize={60} fill="#fff">
              +{gm.q}
            </text>
          </g>
        </g>
      );
    })}
  </svg>
);
const camZ = (f: number) => camera(f).z;

export const Sticker: React.FC<{ f: number; at: number; out: number; x: number; y: number; text: string; color: string; size?: number }> = ({
  f,
  at,
  out,
  x,
  y,
  text,
  color,
  size = 66,
}) => {
  if (f < at || f > out + 6) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        translate: "-50% -50%",
        rotate: "-6deg",
        scale: String(interpolate(f, [at, at + 3, at + 8], [0, 1.25, 1], { ...clamp, easing: EXPO_OUT }) * tween(f, out, out + 6, 1, 0, EXPO_IN)),
        padding: "8px 30px 12px",
        borderRadius: 18,
        background: color,
        border: `5px solid ${G.ink}`,
        boxShadow: `0 10px 0 ${G.ink}`,
        fontFamily: DISPLAY,
        fontWeight: 800,
        fontSize: size,
        color: "#fff",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
};

/** 對話泡：錨在海豚頭上（螢幕座標）。 */
export const Bubble: React.FC<{ f: number; at: number; out: number; anchor: [number, number]; text: string }> = ({ f, at, out, anchor, text }) => {
  if (f < at || f > out + 5) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: anchor[0],
        top: anchor[1],
        translate: "-50% -100%",
        transformOrigin: "50% 100%",
        scale: String(interpolate(f, [at, at + 3, at + 7], [0, 1.2, 1], { ...clamp, easing: EXPO_OUT }) * tween(f, out, out + 5, 1, 0, EXPO_IN)),
        padding: "10px 30px 14px",
        background: "#fff",
        border: `4px solid ${G.ink}`,
        borderRadius: 18,
        fontFamily: DISPLAY,
        fontWeight: 800,
        fontSize: 52,
        color: G.ink,
        whiteSpace: "nowrap",
      }}
    >
      {text}
      <div style={{ position: "absolute", left: "50%", bottom: -22, width: 30, height: 30, background: "#fff", borderRight: `4px solid ${G.ink}`, borderBottom: `4px solid ${G.ink}`, rotate: "45deg", translate: "-50% 0" }} />
    </div>
  );
};
