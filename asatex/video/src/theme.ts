import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// 色票：從產品頁取樣（見 asatex/分鏡腳本.html）
export const C = {
  red: "#9c0c0c", // ASATEX 紅：型號牌、RED
  redHi: "#d81f26", // 產品紅：暗底上的紅網
  ink: "#141414",
  cream: "#f4eee2",
  gold: "#e4d2a8", // 香檳金
  goldD: "#8a6a48", // 古金：米白上的字 4.29:1
  skin: "#c39470",
  navy: "#1d2433", // 新 LOGO 的深藍
};

export const FONT = "Montserrat";

for (const w of ["300", "600", "700", "800", "900"]) {
  loadFont({
    family: FONT,
    url: staticFile(`montserrat-latin-${w}-normal.woff2`),
    weight: w,
  });
}

// 120 BPM @ 30 fps
export const BEAT = 15;
