import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";
import "../theme"; // Montserrat（產品層）

// 遊戲層字體：Bricolage Grotesque 800（標題、對話）＋ Geist Mono（地名、HUD 數字）
loadFont({ family: "Bricolage Grotesque", url: staticFile("bricolage-grotesque-latin-800-normal.woff2"), weight: "800" });
for (const w of ["500", "600", "700"]) {
  loadFont({ family: "Geist Mono", url: staticFile(`geist-mono-latin-${w}-normal.woff2`), weight: w });
}

export const DISPLAY = "Bricolage Grotesque";
export const MONO = "Geist Mono";
export const BRAND = "Montserrat";

// 地圖色票（參考規格）＋品牌色
export const G = {
  paper: "#F4EFE6",
  sand: "#EADFCF",
  casing: "#D9CFBF",
  water: "#9CC9E6",
  park: "#BFE3C3",
  pin: "#d81f26", // 產品紅（取代參考規格的番茄紅）
  red: "#9c0c0c", // ASATEX 紅
  dolphin: "#c8161d",
  ink: "#141414",
  navy: "#1d2433",
  gold: "#e4d2a8",
  skin: "#c39470",
  kraft: "#c9a06a",
  green: "#2f9e57",
};
