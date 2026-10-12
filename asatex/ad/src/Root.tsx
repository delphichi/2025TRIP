import React from "react";
import { Composition } from "remotion";
import { Ad, DURATION, FPS } from "./Ad";
import { T_DUR, T_FPS, Trailer } from "./Trailer";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Ad" component={Ad} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} />
    <Composition id="Trailer" component={Trailer} durationInFrames={T_DUR} fps={T_FPS} width={1920} height={1080} />
  </>
);
