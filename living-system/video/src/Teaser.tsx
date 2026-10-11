import React from "react";
import { AbsoluteFill, Img, Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { C, PaperDefs } from "./paper";
import { S1Cut } from "./scenes/S1Cut";
import { S2Chaos } from "./scenes/S2Chaos";
import { S3Deer } from "./scenes/S3Deer";
import { S4Doors } from "./scenes/S4Doors";
import { S5City } from "./scenes/S5City";
import { S6Sleep } from "./scenes/S6Sleep";

// 《今天，先別把自己摺壞》15 秒紙雕預告。時間表與 living-system/分鏡腳本-摺壞預告.html、scripts/score.py 一致。
export const Teaser: React.FC = () => (
  <AbsoluteFill style={{ background: C.black }}>
    <PaperDefs />
    <Sequence name="S1 剪出城市" from={0} durationInFrames={54}>
      <S1Cut />
    </Sequence>
    <Sequence name="S2 越努力越亂" from={54} durationInFrames={72}>
      <S2Chaos />
    </Sequence>
    <Sequence name="S3 折折登場" from={126} durationInFrames={84}>
      <S3Deer />
    </Sequence>
    <Sequence name="S4 五扇紙門" from={210} durationInFrames={122}>
      <S4Doors />
    </Sequence>
    <Sequence name="S5 城市動起來" from={332} durationInFrames={58}>
      <S5City />
    </Sequence>
    <Sequence name="S6 明天記得睡覺" from={390} durationInFrames={60}>
      <S6Sleep />
    </Sequence>
    {/* 紙纖維浮雕：整片最上層一次 */}
    <Img src={staticFile("fiber.png")} style={{ position: "absolute", inset: 0, width: 1080, height: 1920, mixBlendMode: "multiply", opacity: 0.38 }} />
    <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 45%, rgba(0,0,0,0) 55%, rgba(42,26,10,.28) 100%)" }} />
    <Audio src={staticFile("score.wav")} />
  </AbsoluteFill>
);
