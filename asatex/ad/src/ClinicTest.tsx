// 診間背景合成測試：Gemini 2D 診間（放大）＋依高度漸層虛化（前景地毯清楚、後牆模糊）＋糰糰醫生、薯寶站在地毯上＋腳下陰影。
// mode: sharp／blur＝2D 背景、sharp3d／blur3d＝3D 背景；blur＝依高度漸層虛化。
import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { Dango, Potato } from "./Mascots";

export const ClinicTest: React.FC<{ mode?: "sharp" | "blur" | "sharp3d" | "blur3d" }> = ({ mode = "blur" }) => {
  const Y = mode.endsWith("3d") ? 1420 : 1500; // 角色站的地毯高度
  return (
  <AbsoluteFill>
    <Img src={staticFile(`clinic/${mode}.png`)} style={{ position: "absolute", width: 1080, height: 1920 }} />
    <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: "absolute" }}>
      <defs>
        <radialGradient id="shadow"><stop offset="0" stopColor="#3a2a20" stopOpacity="0.35" /><stop offset="1" stopColor="#3a2a20" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx={330} cy={Y} rx={190} ry={36} fill="url(#shadow)" />
      <ellipse cx={760} cy={Y} rx={190} ry={36} fill="url(#shadow)" />
      <Dango e={{ eye: "line", mouth: "flat" }} x={330} y={Y - 5} s={1.35} />
      <Potato e={{ eye: "sad", mouth: "frown", fx: ["sweat"] }} x={760} y={Y - 5} s={1.35} />
    </svg>
  </AbsoluteFill>
);
};
