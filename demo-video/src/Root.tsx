import "./index.css";
import { Composition, Folder } from "remotion";
import { PipelineDemo } from "./PipelineDemo";
import { OutroScene } from "./scenes/OutroScene";
import { ShotScene } from "./scenes/ShotScene";
import { TitleScene } from "./scenes/TitleScene";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PipelineDemo"
        component={PipelineDemo}
        durationInFrames={330}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* 每個場景也單獨註冊，這樣在 Studio 裡可以雙擊時間軸跳進去單獨調整 */}
      <Folder name="PipelineDemo-Scenes">
        <Composition
          id="Scene-Title"
          component={TitleScene}
          durationInFrames={90}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Scene-ShotA"
          component={ShotScene}
          durationInFrames={105}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{
            src: "shot-a.png",
            label: "nano-banana-2",
            meta: "text-to-image · 16:9 · 1K",
            zoom: "in" as const,
          }}
        />
        <Composition
          id="Scene-ShotB"
          component={ShotScene}
          durationInFrames={105}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{
            src: "shot-b.png",
            label: "同一支技能，一行指令",
            meta: "完成檔/nano-banana-2-20260824-1708.png",
            zoom: "out" as const,
          }}
        />
        <Composition
          id="Scene-Outro"
          component={OutroScene}
          durationInFrames={75}
          fps={30}
          width={1920}
          height={1080}
        />
      </Folder>
    </>
  );
};
