import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { EXPO_OUT, IN_OUT, SLAM, tween } from "./anim";

// 主視覺 600×1256 → 高度填滿 1920 再放大 1.08，留 154px 給上搖（鞋跟 → 膝蓋）
export const IMG = { w: 600, h: 1256 };
export const K = (1920 * 1.08) / IMG.h;
export const LEFT = -70;
export const TOP0 = 1920 - IMG.h * K; // 底部對齊（看鞋跟）
export const SHOT = 60; // S3 長度

export const heroTop = (f: number) => tween(f, 0, SHOT - 1, TOP0, 0, IN_OUT);
/** 亮相：1.25 彈到 1，再全程緩推 3%。 */
export const heroScale = (f: number) => tween(f, 0, 14, 1.25, 1, SLAM) * tween(f, 0, SHOT, 1.0, 1.03, EXPO_OUT);

/** 原圖座標 → 畫面座標（含上搖與縮放，縮放中心為畫面中心）。 */
export const heroPoint = (f: number, x: number, y: number): [number, number] => {
  const s = heroScale(f);
  const px = LEFT + x * K;
  const py = heroTop(f) + y * K;
  return [540 + (px - 540) * s, 960 + (py - 960) * s];
};

export const HeroPlate: React.FC<{ f: number }> = ({ f }) => (
  <AbsoluteFill style={{ background: "linear-gradient(90deg,#efe7da,#f3ece1 60%,#f6f0e6)" }}>
    <AbsoluteFill style={{ scale: String(heroScale(f)) }}>
      <Img
        src={staticFile("hero.png")}
        style={{ position: "absolute", left: LEFT, top: heroTop(f), width: IMG.w * K, height: IMG.h * K }}
      />
    </AbsoluteFill>
  </AbsoluteFill>
);
