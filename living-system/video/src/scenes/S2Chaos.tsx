// S2 越努力越亂（54–126）：時間加速、紙越堆越多、火車卡住冒煙、小沐把紙揉成一團。
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { DeskRoom } from "./Desk";

export const S2Chaos: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <DeskRoom f={f} />
    </AbsoluteFill>
  );
};
