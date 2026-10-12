// 字幕：全片一份時間表（秒），和 scripts/score.py、分鏡腳本同一套時間。
import React from "react";
import { useCurrentFrame } from "remotion";
import { FPS, SERIF } from "./paper";

type Line = [number, number, string | null, string];
export const LINES: Line[] = [
  [1.0, 3.6, "小哲", "今天有點累……明天再寫吧。"],
  [4.5, 6.8, "小哲", "好！明天開始運動！"],
  [7.4, 10.2, "小哲", "英文、運動、吉他……明天全部開始！"],
  [11.8, 13.4, null, "小哲不是沒有計畫。"],
  [13.4, 15.0, null, "他的計畫，全部都在明天。"],
  [21.4, 24.0, "明天先生", "聽說，你有很多事情要交給我？"],
  [24.2, 25.4, "明天先生", "我是明天先生。"],
  [25.4, 27.5, "明天先生", "你沒做完的事，全部都交給我保管！"],
  [27.7, 29.0, "小哲", "那……明天再說好了。"],
  [29.2, 31.0, "明天先生", "是啊！而且我每天都會幫你收新的！"],
  [42.4, 44.0, "小哲", "下週……一定開始！"],
  [44.3, 46.5, "小哲", "我不是一直在計畫，怎麼反而什麼都沒做？"],
  [46.5, 48.3, "明天先生", "嗯……你交給我的工作，好像真的有點多。"],
  [50.6, 52.8, "小哲", "我不需要今天把全部事情做完。"],
  [53.0, 55.0, "小哲", "我只要先寫第一題。"],
  [64.2, 66.4, "小哲", "原來開始，沒有我想的那麼難。"],
  [66.6, 68.6, "明天先生", "那……今天是不是有一件事，不用交給我了？"],
  [68.6, 70.4, "小哲", "對。這一件，今天就做完了。"],
  [80.3, 82.0, "小哲", "你以後不用幫我保管這麼多事了。"],
  [82.1, 83.4, "明天先生", "那我以後要做什麼？"],
  [83.5, 85.8, "小哲", "你可以幫我提醒，明天還有新的事情。"],
];

/** 某一秒是不是某個角色在說話（嘴巴動）。 */
export const speaking = (who: string, sec: number) => LINES.some(([a, b, w]) => w === who && sec >= a && sec < b - 0.15);

export const Subs: React.FC = () => {
  const sec = useCurrentFrame() / FPS;
  const ln = LINES.find(([a, b]) => sec >= a && sec < b);
  if (!ln) return null;
  const [a, b, who, text] = ln;
  const k = Math.min(1, (sec - a) / 0.12, (b - sec) / 0.12);
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 64,
        transform: `translateX(-50%) translateY(${(1 - k) * 8}px)`,
        opacity: k,
        padding: "12px 34px 14px",
        background: "rgba(14,12,10,.62)",
        borderRadius: 10,
        fontFamily: SERIF,
        fontWeight: 700,
        fontSize: 44,
        lineHeight: 1.3,
        color: "#fff",
        whiteSpace: "nowrap",
        letterSpacing: "0.02em",
        fontStyle: who ? "normal" : "normal",
      }}
    >
      {who ? <span style={{ color: "#FFD58A" }}>{who}：</span> : null}
      {who ? text : <span style={{ color: "#F3EBDD" }}>{text}</span>}
    </div>
  );
};
