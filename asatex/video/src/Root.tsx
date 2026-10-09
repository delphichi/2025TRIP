import { Composition } from "remotion";
import { PantyDeRed } from "./PantyDeRed";
import { Game } from "./game/Game";
import "./game/theme";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="PantyDeRed" component={PantyDeRed} durationInFrames={300} fps={30} width={1080} height={1920} />
      {/* 遊戲版：¿DÓNDE ESTÁ PANTY DE RED? */}
      <Composition id="BuscaPantyDeRed" component={Game} durationInFrames={300} fps={30} width={1080} height={1920} />
    </>
  );
};
