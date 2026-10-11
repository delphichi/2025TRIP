import { Composition } from "remotion";
import { Teaser } from "./Teaser";

export const RemotionRoot: React.FC = () => (
  <Composition id="Teaser" component={Teaser} durationInFrames={450} fps={30} width={1080} height={1920} />
);
