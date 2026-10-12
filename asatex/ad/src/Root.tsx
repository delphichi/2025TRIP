import React from "react";
import { Composition } from "remotion";
import { Ad, DURATION, FPS } from "./Ad";
import { T_DUR, T_FPS, Trailer } from "./Trailer";
import { S_DUR, S_FPS, Showroom } from "./Showroom";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Ad" component={Ad} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} />
    <Composition id="Trailer" component={Trailer} durationInFrames={T_DUR} fps={T_FPS} width={1920} height={1080} />
    <Composition id="Showroom" component={Showroom} durationInFrames={S_DUR} fps={S_FPS} width={1920} height={1080} />
  </>
);
