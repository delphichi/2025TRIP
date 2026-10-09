import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { Audio } from "@remotion/media";
import { shake, tween } from "../lib/anim";
import { End } from "./End";
import { Banner, Bubble, Inventory, Pickups, Sticker } from "./Hud";
import { Loot } from "./Loot";
import { Boat, Box, BOX_LAND, Cars, Clouds, Flood, Labels, MapGems, Pin, Route, Walker } from "./MapLayers";
import { G } from "./theme";
import { WORLD, camera, toScreen, walker } from "./world";

/**
 * ¿DÓNDE ESTÁ PANTY DE RED? —— 遊戲化找貨廣告，10 秒、直式。
 * 一個連續的世界：靜態城市是一張快取圖（public/city.svg），
 * 會動的東西全在上面的活動層；鏡頭是臨界阻尼彈簧（見 world.ts）。
 */
export const Game: React.FC = () => {
  const f = useCurrentFrame();
  const c = camera(f);
  const sh = shake(f, [BOX_LAND, 255], f >= 250 ? 10 : 6, 8);
  const w = walker(f);
  return (
    <AbsoluteFill style={{ background: G.paper, overflow: "hidden" }}>
      <AbsoluteFill style={{ translate: `${sh.x}px ${sh.y}px` }}>
        {/* 世界：地圖座標 → 螢幕 */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: WORLD.w,
            height: WORLD.h,
            transformOrigin: "0 0",
            transform: `translate(${540 - (c.x - WORLD.x) * c.z}px, ${960 - (c.y - WORLD.y) * c.z}px) scale(${c.z})`,
          }}
        >
          <Img src={staticFile("city.svg")} style={{ position: "absolute", left: 0, top: 0, width: WORLD.w, height: WORLD.h }} />
          <svg viewBox={`${WORLD.x} ${WORLD.y} ${WORLD.w} ${WORLD.h}`} width={WORLD.w} height={WORLD.h} style={{ position: "absolute", left: 0, top: 0 }}>
            <Labels />
            <Cars f={f} />
            <Boat f={f} />
            <Flood f={f} />
            <Route f={f} />
            <MapGems f={f} />
            <Pin f={f} />
            <Walker f={f} />
            <Box f={f} />
            <Clouds f={f} />
          </svg>
        </div>

        {/* 道具卡期間地圖壓暗 */}
        <AbsoluteFill style={{ background: G.ink, opacity: tween(f, 222, 230, 0, 0.62) * tween(f, 270, 278, 1, 0) }} />

        {/* HUD */}
        <Banner f={f} />
        <Inventory f={f} />
        <Pickups f={f} />
        <Bubble f={f} at={66} out={82} anchor={toScreen(f, [w.x, w.y - 150])} text="¡VAMOS!" />
        <Sticker f={f} at={182} out={212} x={540} y={1430} text="¡1 DOCENA!" color={G.green} />
        <Loot f={f} />
        <End f={f} />
      </AbsoluteFill>

      {/* 紙張細顆粒 */}
      <Img src={staticFile("grain.png")} style={{ position: "absolute", inset: 0, width: 1080, height: 1920, mixBlendMode: "multiply", opacity: 0.07 }} />
      <Audio src={staticFile("score_game.wav")} />
    </AbsoluteFill>
  );
};
