import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { DangoTall, PotatoTall } from "./TallCast";
export const TallTest: React.FC = () => (
  <AbsoluteFill>
    <Img src={staticFile("clinic/blur.png")} style={{ position: "absolute", width: 1080, height: 1920 }} />
    <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: "absolute" }}>
      <defs><radialGradient id="tsh"><stop offset="0" stopColor="#3a2a20" stopOpacity="0.32" /><stop offset="1" stopColor="#3a2a20" stopOpacity="0" /></radialGradient></defs>
      <ellipse cx={300} cy={1610} rx={200} ry={34} fill="url(#tsh)" /><ellipse cx={780} cy={1610} rx={200} ry={34} fill="url(#tsh)" />
      <DangoTall e={{ eye: "line", mouth: "flat" }} p={{ armR: 14 }} x={290} y={1600} s={1.1} />
      <PotatoTall e={{ eye: "sad", mouth: "frown", fx: ["sweat"] }} p={{ armL: 18, armR: 18, tilt: -4 }} x={800} y={1600} s={1.1} />
    </svg>
  </AbsoluteFill>
);
