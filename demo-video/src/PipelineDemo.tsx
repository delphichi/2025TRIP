import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig } from "remotion";
import { OutroScene } from "./scenes/OutroScene";
import { ShotScene } from "./scenes/ShotScene";
import { TitleScene } from "./scenes/TitleScene";

export const PipelineDemo: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={3 * fps} name="Title">
        <TitleScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 15 })}
      />

      <TransitionSeries.Sequence durationInFrames={3.5 * fps} name="Shot A">
        <ShotScene
          src="shot-a.png"
          label="nano-banana-2"
          meta="text-to-image · 16:9 · 1K"
          zoom="in"
        />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: 15 })}
      />

      <TransitionSeries.Sequence durationInFrames={3.5 * fps} name="Shot B">
        <ShotScene
          src="shot-b.png"
          label="同一支技能，一行指令"
          meta="完成檔/nano-banana-2-20260824-1708.png"
          zoom="out"
        />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 15 })}
      />

      <TransitionSeries.Sequence durationInFrames={2.5 * fps} name="Outro">
        <OutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
