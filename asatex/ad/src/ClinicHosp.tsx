// 3D 醫院背景（Gemini）＋糰糰醫生 × 桃子小姐。shot：two＝雙人鏡（輕微虛化，醫院特徵認得出）、
// doc＝醫生單人近景、peach＝桃子小姐單人中近景（單人鏡背景虛化更重，像鏡頭對焦在角色上）。
import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { Dango } from "./Mascots";
import { MissPeach } from "./MissPeach";

type Shot = "two" | "doc" | "peach";
const CAM: Record<Shot, { s: number; x: number; y: number }> = {
  two: { s: 1, x: 540, y: 960 },
  doc: { s: 2.3, x: 350, y: 1380 },
  peach: { s: 1.75, x: 740, y: 1040 },
};

export const ClinicHosp: React.FC<{ shot?: Shot }> = ({ shot = "two" }) => {
  const c = CAM[shot];
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#cfe7df" }}>
      <div style={{ position: "absolute", width: 1080, height: 1920, transformOrigin: "0 0", transform: `translate(${540 - c.s * c.x}px,${960 - c.s * c.y}px) scale(${c.s})` }}>
        <Img src={staticFile(shot === "two" ? "clinic/hosp_blur.png" : "clinic/hosp_blur_close.png")} style={{ position: "absolute", width: 1080, height: 1920 }} />
        <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: "absolute" }}>
          <defs><radialGradient id="sh"><stop offset="0" stopColor="#2f4a44" stopOpacity="0.32" /><stop offset="1" stopColor="#2f4a44" stopOpacity="0" /></radialGradient></defs>
          {shot !== "peach" && <ellipse cx={350} cy={1640} rx={200} ry={34} fill="url(#sh)" />}
          {shot !== "doc" && <ellipse cx={740} cy={1640} rx={190} ry={32} fill="url(#sh)" />}
          {shot !== "peach" && <Dango e={shot === "doc" ? { eye: "line", mouth: "flat", open: 0.5 } : { eye: "line", mouth: "flat" }} x={350} y={1636} s={1.45} />}
          {shot !== "doc" && <MissPeach e={shot === "peach" ? { eye: "tired", mouth: "flat", brow: "sad", fx: ["sweat"], open: 0.45 } : { eye: "tired", mouth: "flat", brow: "sad", fx: ["sweat"] }} x={740} y={1636} s={0.86} tilt={-4} />}
        </svg>
      </div>
    </AbsoluteFill>
  );
};
