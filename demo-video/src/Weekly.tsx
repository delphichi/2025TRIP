import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig } from "remotion";
import { byDate, SNAPSHOTS } from "./data/scorecards";
import { AlertScene } from "./scenes/AlertScene";
import { BarRaceScene } from "./scenes/BarRaceScene";
import { HookScene } from "./scenes/HookScene";
import { ProofScene } from "./scenes/ProofScene";
import { TrendScene } from "./scenes/TrendScene";

export type WeeklyProps = {
  /** 要做哪一期，格式 yyyy-mm-dd；可用日期見 src/data/scorecards.ts */
  readonly date: string;
};

export const Weekly: React.FC<WeeklyProps> = ({ date }) => {
  const { fps } = useVideoConfig();
  const snap = byDate(date);

  // 綜合分前三名 —— 換一期資料，這三個代號就會不一樣
  const top3 = [...snap.sectors]
    .filter((s) => s.composite_rank !== null)
    .sort((a, b) => (a.composite_rank ?? 99) - (b.composite_rank ?? 99))
    .slice(0, 3)
    .map((s) => s.symbol);

  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={3 * fps} name="Hook">
        <HookScene
          date={snap.date}
          sectorCount={snap.sectors.length}
          snapshotCount={SNAPSHOTS.length}
          sourceFile={snap.file}
        />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 15 })}
      />

      <TransitionSeries.Sequence durationInFrames={8 * fps} name="Bar Race">
        <BarRaceScene date={snap.date} sectors={snap.sectors} />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: 15 })}
      />

      <TransitionSeries.Sequence durationInFrames={7 * fps} name="Trend">
        <TrendScene snapshots={SNAPSHOTS} symbols={top3} />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 15 })}
      />

      <TransitionSeries.Sequence durationInFrames={3.5 * fps} name="Alerts">
        <AlertScene sectors={snap.sectors} />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 15 })}
      />

      <TransitionSeries.Sequence durationInFrames={4 * fps} name="Proof">
        <ProofScene dates={SNAPSHOTS.map((s) => s.date)} current={snap.date} />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
