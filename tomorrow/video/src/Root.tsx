import { Composition } from "remotion";
import { Film } from "./Film";

export const RemotionRoot: React.FC = () => <Composition id="Film" component={Film} durationInFrames={2160} fps={24} width={1920} height={1080} />;
