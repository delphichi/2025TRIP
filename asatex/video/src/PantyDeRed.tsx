import { AbsoluteFill, Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import "./theme";
import { C } from "./theme";
import { S1Light } from "./scenes/S1Light";
import { S2Weave } from "./scenes/S2Weave";
import { S3Reveal } from "./scenes/S3Reveal";
import { S4Colors } from "./scenes/S4Colors";
import { S5Specs } from "./scenes/S5Specs";
import { S6Dozen } from "./scenes/S6Dozen";
import { S7Logo } from "./scenes/S7Logo";

// 時間表（影格）與 asatex/分鏡腳本.html、scripts/score.py 一致。
// 每個切點都落在拍點（15 格）上；S6 提早 8 格進場，和 S5 同速推移。
export const PantyDeRed: React.FC = () => (
  <AbsoluteFill style={{ background: C.ink }}>
    <Sequence name="S1 一點光" from={0} durationInFrames={30}>
      <S1Light />
    </Sequence>
    <Sequence name="S2 織網" from={30} durationInFrames={30}>
      <S2Weave />
    </Sequence>
    <Sequence name="S3 亮相" from={60} durationInFrames={60}>
      <S3Reveal />
    </Sequence>
    <Sequence name="S4 三色" from={120} durationInFrames={60}>
      <S4Colors />
    </Sequence>
    <Sequence name="S5 規格" from={180} durationInFrames={45}>
      <S5Specs />
    </Sequence>
    <Sequence name="S6 一打×100" from={217} durationInFrames={53}>
      <S6Dozen />
    </Sequence>
    <Sequence name="S7 落款" from={270} durationInFrames={30}>
      <S7Logo />
    </Sequence>
    <Audio src={staticFile("score.wav")} />
  </AbsoluteFill>
);
