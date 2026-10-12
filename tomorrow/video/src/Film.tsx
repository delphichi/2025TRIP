import React from "react";
import { AbsoluteFill, Img, Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { PaperDefs, s2f } from "./paper";
import { Subs } from "./subs";
import { S1, S2 } from "./scenes/act1";
import { S3, S4 } from "./scenes/act2";
import { S5, S6, S7 } from "./scenes/act3";
import { S8, S9, S10 } from "./scenes/act4";
import { S11, S12, S13 } from "./scenes/act5";

// 《每次都說明天開始的男孩》90 秒紙雕動畫。時間表與 tomorrow/分鏡腳本.html、scripts/score.py 一致（S4 延長到 31 秒，S5 從 31 秒開始）。
const SCENES: [string, number, number, React.FC][] = [
  ["S1 第一個明天", 0, 4, S1],
  ["S2 啪啪啪", 4, 15, S2],
  ["S3 日曆站起來", 15, 21, S3],
  ["S4 明天先生", 21, 31, S4],
  ["S5 日子一天天過去", 31, 38, S5],
  ["S6 下週一定開始", 38, 44, S6],
  ["S7 什麼都沒做", 44, 48, S7],
  ["S8 數學第一題", 48, 55, S8],
  ["S9 第一題", 55, 64, S9],
  ["S10 不用交給我了", 64, 70, S10],
  ["S11 三個紙盒", 70, 80, S11],
  ["S12 空白的日曆", 80, 86, S12],
  ["S13 結尾", 86, 90, S13],
];

export const Film: React.FC = () => (
  <AbsoluteFill style={{ background: "#2a2522" }}>
    <PaperDefs />
    {SCENES.map(([name, a, b, Comp]) => (
      <Sequence key={name} name={name} from={s2f(a)} durationInFrames={s2f(b) - s2f(a)}>
        <Comp />
      </Sequence>
    ))}
    {/* 紙纖維浮雕與暗角：整片最上層一次 */}
    <Img src={staticFile("fiber.png")} style={{ position: "absolute", inset: 0, width: 1920, height: 1080, mixBlendMode: "multiply", opacity: 0.32 }} />
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(42,26,10,.30) 100%)" }} />
    <Subs />
    <Audio src={staticFile("score.wav")} />
  </AbsoluteFill>
);
