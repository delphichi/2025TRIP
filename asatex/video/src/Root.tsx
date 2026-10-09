import { Composition } from "remotion";
import { PantyDeRed } from "./PantyDeRed";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="PantyDeRed"
      component={PantyDeRed}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
