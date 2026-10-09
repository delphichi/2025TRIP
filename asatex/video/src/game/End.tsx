import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile } from "remotion";
import { Glint } from "../lib/Glint";
import { EXPO_OUT, SLAM, pop, tween } from "../lib/anim";
import { Dolphin } from "./Dolphin";
import { BRAND, G, MONO } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const LW = 640;
const LH = (372 / 492) * LW;
const LY = 500;
const LS = LW / 492;

/** 過關：地圖拉遠蓋上紙層，LOGO 落定，海豚從下方跳進品牌裡。 */
export const End: React.FC<{ f: number }> = ({ f }) => {
  if (f < 270) return null;
  const jt = interpolate(f, [278, 288], [0, 1], clamp);
  const dy = 2080 + (1210 - 2080) * jt - Math.sin(jt * Math.PI) * 280;
  const land = interpolate(f, [288, 290, 293, 297], [1, 0.8, 1.08, 1], clamp);
  const air = jt > 0 && jt < 1 ? 1.12 : 1;
  const wave = f >= 291 ? 55 + 30 * Math.sin(((f - 291) / 7) * Math.PI * 2) : 0;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: G.paper, opacity: tween(f, 272, 282, 0, 0.86) }} />
      <Img
        src={staticFile("logo-asahi.png")}
        style={{
          position: "absolute",
          left: 540 - LW / 2,
          top: LY,
          width: LW,
          height: LH,
          opacity: tween(f, 274, 277, 0, 1),
          scale: String(interpolate(f, [274, 286], [1.14, 1], { ...clamp, easing: SLAM })),
        }}
      />
      <svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{ position: "absolute" }}>
        {f >= 278 ? <Dolphin x={540} y={dy} s={1.4} hop={0} squash={land * air} wave={wave} /> : null}
        <Glint x={540 - LW / 2 + 322 * LS} y={LY + 60 * LS} size={46} scale={pop(f, 290, 7, 1.6) * (1 + 0.06 * Math.sin(f * 0.8))} rotate={tween(f, 290, 298, -45, 0)} streak={tween(f, 290, 299, 0, 200)} />
      </svg>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 1290,
          textAlign: "center",
          fontFamily: BRAND,
          fontWeight: 600,
          fontSize: 40,
          color: G.navy,
          whiteSpace: "nowrap",
          letterSpacing: `${tween(f, 282, 294, 0.4, 0.16)}em`,
          paddingLeft: `${tween(f, 282, 294, 0.4, 0.16)}em`,
          opacity: tween(f, 282, 287, 0, 1),
        }}
      >
        ELEGANCIA QUE TE ACOMPAÑA
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1362, textAlign: "center", fontFamily: BRAND, fontWeight: 800, fontSize: 46, letterSpacing: 3, color: G.red, opacity: tween(f, 285, 290, 0, 1), translate: `0px ${tween(f, 285, 292, 18, 0, EXPO_OUT)}px` }}>
        PANTY DE RED · #CK2603L
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1440, textAlign: "center", fontFamily: MONO, fontWeight: 600, fontSize: 30, letterSpacing: 8, color: G.ink, opacity: tween(f, 288, 293, 0, 0.7) }}>
        ZOFRI · IQUIQUE
      </div>
    </AbsoluteFill>
  );
};
