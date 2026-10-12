import React from "react";
import { Composition } from "remotion";
import { Ad, DURATION, FPS } from "./Ad";

export const RemotionRoot: React.FC = () => (
  <Composition id="Ad" component={Ad} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} />
);
