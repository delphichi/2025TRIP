// ASATEX Nochebuena 睡衣廣告《Este año, todos》— 完整 60 秒（分鏡表 v5，17 格）。
// 1080×1920 直式、30 fps。開場 10 秒沿用 Nochebuena.tsx 的場景；場景參考：nochebuena/素材/場景/老家客廳-聖誕夜-參考.webp
// 做法：劇情＝程式 3D 公仔；睡衣當主角的鏡頭＝真實商品照（方案 A）；文字一律程式疊加。
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, Easing, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import * as THREE from "three";
import {
  ChestInsert, clamp, ease, FabricCtx, mix, Office, Person, PJ, Scene1, Scene2, Scene3, Scene4, Shot, skyTexture, textTexture, useCam, useFabricLoader, V3,
} from "./Nochebuena";

export const NF_FPS = 30;
export const NF_DUR = 1800;
const SANS = "Montserrat, sans-serif";

// ── 剪接表（格數，30 fps）──
const T = {
  s1b: { from: 0, dur: 47 }, s1: { from: 39, dur: 51 }, s2: { from: 90, dur: 120 }, s3: { from: 210, dur: 54 },
  s4: { from: 264, dur: 96 }, s5: { from: 360, dur: 52 }, s5p: { from: 404, dur: 46 }, s6: { from: 450, dur: 105 },
  s7: { from: 555, dur: 75 }, s8: { from: 630, dur: 60 }, s9: { from: 690, dur: 105 }, s10: { from: 795, dur: 105 },
  s11: { from: 900, dur: 60 }, s11p: { from: 955, dur: 65 }, s12: { from: 1020, dur: 150 }, s13: { from: 1170, dur: 90 },
  s14: { from: 1260, dur: 120 }, s15: { from: 1380, dur: 135 }, s16: { from: 1515, dur: 150 }, s17p: { from: 1665, dur: 62 }, s17b: { from: 1718, dur: 82 },
};
const VO = [
  { f: "mama1.wav", at: 6, end: 99, es: "¿Vienes hoy? Tu papá y yo te estamos esperando." },
  { f: "hijo1_f.wav", at: 96, end: 216, es: "Mamá, todavía no termino… El próximo año sí, te lo prometo." },
  { f: "papa1.wav", at: 462, end: 557, es: "Antes siempre estábamos todos juntos en Navidad…" },
  { f: "hijo2.wav", at: 700, end: 806, es: "¡Mamá! ¡Voy pa' la casa! ¡Este año nos juntamos todos!" },
  { f: "hijo3.wav", at: 975, end: 1024, es: "Ahh… ¡qué cómodo!" },
  { f: "papa2.wav", at: 1185, end: 1241, es: "¡Ahora sí estamos todos!" },
  { f: "grito_todos.wav", at: 1336, end: 1377, es: "¡Estamos todos!" },
  { f: "narr1.wav", at: 1528, end: 1675, es: "A veces, solo necesitamos despertar para recordar lo que de verdad importa." },
  { f: "narr3.wav", at: 1714, end: 1799, es: "" },
];

// ── 貼圖：在 ThreeCanvas 外載好 ──
const TexCtx = createContext<Record<string, THREE.Texture>>({});
function useTextures(names: string[]) {
  const [map, setMap] = useState<Record<string, THREE.Texture> | null>(null);
  const [h] = useState(() => delayRender("textures"));
  useEffect(() => {
    const out: Record<string, THREE.Texture> = {}; let n = 0;
    names.forEach((nm) => new THREE.TextureLoader().load(staticFile(`noche/prod/${nm}`), (t) => {
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; out[nm] = t;
      if (++n === names.length) { setMap(out); continueRender(h); }
    }));
  }, [h]); // eslint-disable-line react-hooks/exhaustive-deps
  return map;
}

// ── 小道具 ──
const C = { tile: "#9a4a31", wall: "#efe2c6", wood: "#8a5a34", sofa: "#cbb790", red: "#b8322e", green: "#1f6b3a", gold: "#f2c14e" };
function bannerTexture() {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 128; const g = c.getContext("2d")!;
  const word = "FELIZ NAVIDAD".split(""); const cols = ["#c0392b", "#1e7a46", "#d9a334"];
  word.forEach((ch, i) => {
    const x = i * 78 + 4; g.fillStyle = ch === " " ? "rgba(0,0,0,0)" : cols[i % 3];
    if (ch !== " ") { g.beginPath(); g.moveTo(x, 6); g.lineTo(x + 70, 6); g.lineTo(x + 35, 120); g.closePath(); g.fill(); g.fillStyle = "#fff8e8"; g.font = "bold 44px Montserrat, sans-serif"; g.textAlign = "center"; g.fillText(ch, x + 35, 62); }
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function rugTexture(a: string, b: string) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 256; const g = c.getContext("2d")!;
  g.fillStyle = a; g.fillRect(0, 0, 256, 256); g.strokeStyle = b; g.lineWidth = 10;
  for (let i = 0; i < 4; i++) { g.strokeRect(20 + i * 22, 20 + i * 22, 216 - i * 44, 216 - i * 44); }
  g.fillStyle = b; g.beginPath(); g.moveTo(128, 70); g.lineTo(186, 128); g.lineTo(128, 186); g.lineTo(70, 128); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function StringLights({ from, to, n, sag = 0.25, half = false, t = 0 }: { from: V3; to: V3; n: number; sag?: number; half?: boolean; t?: number }) {
  const cols = ["#ffd27a", "#ff8a7a", "#9fe0ff", "#b6ff9a", "#ffd27a"];
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const u = i / (n - 1), p = mix(from, to, u); p[1] -= Math.sin(u * Math.PI) * sag;
        const off = half && i % 2 === 1; const tw = 1.4 + Math.sin(t * 0.2 + i * 1.7) * 0.5;
        return <mesh key={i} position={p}><sphereGeometry args={[0.035, 10, 10]} /><meshStandardMaterial color={off ? "#6d6252" : cols[i % 5]} emissive={off ? "#000" : cols[i % 5]} emissiveIntensity={off ? 0 : tw} /></mesh>;
      })}
    </>
  );
}
function Tree({ pos, t }: { pos: V3; t: number }) {
  const balls = useMemo(() => Array.from({ length: 34 }, (_, i) => { const h = 0.3 + (i * 37 % 100) / 100 * 1.45; const r = 0.62 * (1 - (h - 0.2) / 1.75) + 0.05; const a = i * 2.4; return [Math.cos(a) * r, h, Math.sin(a) * r] as V3; }), []);
  const cols = ["#e63b3b", "#f2c14e", "#3b7fe6", "#e6e6e6", "#e65bd0"];
  return (
    <group position={pos}>
      {[0, 1, 2].map((k) => <mesh key={k} position={[0, 0.55 + k * 0.5, 0]} castShadow><coneGeometry args={[0.72 - k * 0.2, 0.9, 20]} /><meshStandardMaterial color={C.green} roughness={0.9} /></mesh>)}
      <mesh position={[0, 0.12, 0]}><cylinderGeometry args={[0.08, 0.08, 0.25, 10]} /><meshStandardMaterial color={C.wood} /></mesh>
      {balls.map((b, i) => <mesh key={i} position={b}><sphereGeometry args={[0.04, 10, 10]} /><meshStandardMaterial color={cols[i % 5]} emissive={cols[i % 5]} emissiveIntensity={0.6 + 0.5 * Math.sin(t * 0.15 + i)} /></mesh>)}
      <mesh position={[0, 1.98, 0]}><octahedronGeometry args={[0.1, 0]} /><meshStandardMaterial color={C.gold} emissive={C.gold} emissiveIntensity={1.6} /></mesh>
      {[[-0.5, 0.42], [0.45, 0.5], [0.05, 0.75], [-0.25, 0.7], [0.6, 0.15]].map(([x, z], i) => <mesh key={i} position={[x, 0.11, z]} castShadow><boxGeometry args={[0.26, 0.22, 0.22]} /><meshStandardMaterial color={["#c0392b", "#2e86de", "#27ae60", "#f1c40f", "#8e44ad"][i]} /></mesh>)}
    </group>
  );
}

// ── 老家客廳（依參考圖：花紋沙發、聖誕樹、馬槽、彩旗、花圈、電風扇、餐桌、燈串露台）──
function LivingRoom({ dream = false, t = 0, children }: { dream?: boolean; t?: number; children?: React.ReactNode }) {
  const banner = useMemo(() => bannerTexture(), []);
  const rug = useMemo(() => rugTexture("#a8322c", "#e8c56a"), []);
  const sky = useMemo(() => skyTexture(dream ? "#5d5a6a" : "#2c3e78", dream ? "#a99b7c" : "#f08a5d", false), [dream]);
  const k = dream ? 0.55 : 1;
  return (
    <>
      <color attach="background" args={[dream ? "#2a2620" : "#2d1d16"]} />
      <ambientLight intensity={0.55 * k} color="#ffe6c8" />
      <directionalLight position={[-2, 4.5, 3]} intensity={1.1 * k} color="#fff1e0" castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[1.6, 1.4, -2.2]} intensity={(dream ? 1.2 : 4) * k} color="#ffd08a" distance={5} />
      <pointLight position={[-2.2, 2.4, -1]} intensity={3 * k} color="#ffc88f" distance={6} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[9, 9]} /><meshStandardMaterial color={C.tile} roughness={0.8} /></mesh>
      <mesh position={[0, 1.6, -3.5]} receiveShadow><planeGeometry args={[9, 3.2]} /><meshStandardMaterial color={C.wall} roughness={1} /></mesh>
      <mesh position={[-4, 1.6, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[9, 3.2]} /><meshStandardMaterial color={C.wall} roughness={1} /></mesh>
      <mesh position={[0.2, 2.7, -3.47]}><planeGeometry args={[2.6, 0.33]} /><meshStandardMaterial map={banner} transparent /></mesh>
      <mesh position={[0.9, 2.15, -3.44]}><torusGeometry args={[0.2, 0.06, 10, 24]} /><meshStandardMaterial color={C.green} /></mesh>
      {[[-1.5, 2.25], [-0.75, 2.4], [-0.75, 1.85]].map(([x, y], i) => <mesh key={i} position={[x, y, -3.46]}><boxGeometry args={[0.42, 0.32, 0.03]} /><meshStandardMaterial color={["#d9c7a0", "#cdb98f", "#d4c29a"][i]} /></mesh>)}
      <mesh position={[-0.2, 0.55, -3.2]} castShadow><boxGeometry args={[0.95, 1.1, 0.45]} /><meshStandardMaterial color={C.wood} /></mesh>
      <mesh position={[-0.2, 1.25, -3.2]}><coneGeometry args={[0.45, 0.3, 4]} /><meshStandardMaterial color="#6e4a2b" /></mesh>
      {[-0.35, -0.2, -0.05].map((x, i) => <mesh key={i} position={[x, 1.18, -3.05]}><sphereGeometry args={[0.05, 10, 10]} /><meshStandardMaterial color={["#3b6fd6", "#f2e6c9", "#a57a52"][i]} emissive="#ffd9a0" emissiveIntensity={0.2} /></mesh>)}
      <Tree pos={[1.5, 0, -2.75]} t={dream ? 0 : t} />
      {/* 花紋沙發與紅條紋毯 */}
      <group position={[-2.3, 0, -2.5]}>
        <mesh position={[0, 0.25, 0]} castShadow receiveShadow><boxGeometry args={[2.2, 0.5, 0.9]} /><meshStandardMaterial color={C.sofa} roughness={0.95} /></mesh>
        <mesh position={[0, 0.72, -0.35]} castShadow><boxGeometry args={[2.2, 0.5, 0.22]} /><meshStandardMaterial color={C.sofa} roughness={0.95} /></mesh>
        <mesh position={[0.3, 0.98, -0.32]} rotation={[0.2, 0, 0]}><boxGeometry args={[0.9, 0.04, 0.4]} /><meshStandardMaterial color={C.red} /></mesh>
        {[-1.15, 1.15].map((x) => <mesh key={x} position={[x, 0.42, 0]}><boxGeometry args={[0.18, 0.55, 0.9]} /><meshStandardMaterial color="#bba67d" /></mesh>)}
      </group>
      {/* 電風扇（智利的聖誕在夏天） */}
      <group position={[-3.5, 0, -1.2]}>
        <mesh position={[0, 0.6, 0]}><cylinderGeometry args={[0.03, 0.03, 1.2, 8]} /><meshStandardMaterial color="#e8e8e8" /></mesh>
        <mesh position={[0, 1.25, 0.05]} rotation={[0, 0.6, 0]}><cylinderGeometry args={[0.28, 0.28, 0.08, 24]} /><meshStandardMaterial color="#f4f4f4" transparent opacity={0.85} /></mesh>
      </group>
      <mesh position={[-0.3, 0.005, -0.6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[2.4, 1.6]} /><meshStandardMaterial map={rug} /></mesh>
      {/* 落地窗外的燈串露台 */}
      <mesh position={[3.9, 1.5, -0.5]} rotation={[0, -Math.PI / 2, 0]}><planeGeometry args={[5, 3]} /><meshStandardMaterial color="#cfe3ff" transparent opacity={0.12} /></mesh>
      <mesh position={[9, 2, -0.5]} rotation={[0, -Math.PI / 2, 0]}><planeGeometry args={[14, 6]} /><meshStandardMaterial map={sky} emissive="#ffffff" emissiveMap={sky} emissiveIntensity={0.5} /></mesh>
      <StringLights from={[4.1, 2.6, -2.5]} to={[4.1, 2.6, 1.8]} n={18} half={dream} t={t} />
      {[[4.6, -2], [4.8, -0.6], [4.5, 0.9]].map(([x, z], i) => <mesh key={i} position={[x, 0.45, z]}><sphereGeometry args={[0.4, 14, 14]} /><meshStandardMaterial color={dream ? "#6b6a4d" : "#3f7d3a"} /></mesh>)}
      {children}
    </>
  );
}

function DiningTable({ pos, t = 0 }: { pos: V3; t?: number }) {
  return (
    <group position={pos}>
      <mesh position={[0, 0.75, 0]} castShadow receiveShadow><boxGeometry args={[1.9, 0.06, 1.0]} /><meshStandardMaterial color="#a8703f" /></mesh>
      {[[-0.85, -0.42], [0.85, -0.42], [-0.85, 0.42], [0.85, 0.42]].map(([x, z], i) => <mesh key={i} position={[x, 0.37, z]}><boxGeometry args={[0.06, 0.74, 0.06]} /><meshStandardMaterial color="#7d5230" /></mesh>)}
      {/* pan de pascua、餅乾、酒、杯子 */}
      {[[-0.4, 0.05], [0.35, -0.15]].map(([x, z], i) => (
        <group key={i} position={[x, 0.79, z]}>
          <mesh><cylinderGeometry args={[0.2, 0.2, 0.02, 24]} /><meshStandardMaterial color="#f7f3ea" /></mesh>
          <mesh position={[0, 0.07, 0]}><cylinderGeometry args={[0.13, 0.15, 0.13, 20]} /><meshStandardMaterial color="#9c6633" roughness={0.9} /></mesh>
        </group>
      ))}
      <mesh position={[0.05, 0.92, 0.25]}><cylinderGeometry args={[0.04, 0.05, 0.3, 12]} /><meshStandardMaterial color="#3a1d12" roughness={0.3} /></mesh>
      {[[-0.7, 0.3], [0.7, 0.3], [-0.65, -0.3], [0.7, -0.32]].map(([x, z], i) => <mesh key={i} position={[x, 0.83, z]}><cylinderGeometry args={[0.035, 0.03, 0.1, 12]} /><meshStandardMaterial color="#e8f4ff" transparent opacity={0.55} /></mesh>)}
      <mesh position={[0, 0.79, -0.32]}><boxGeometry args={[0.3, 0.02, 0.2]} /><meshStandardMaterial color="#d8b07a" /></mesh>
      {t > 0 && null}
    </group>
  );
}

// ── 各場景 ──
const tt = (f: number, d: number, e = ease) => interpolate(f, [0, d], [0, 1], { ...clamp, easing: e });

function S5Parents() { // 夢：白髮父母穿睡衣坐在沙發，鏡頭往下推到那件沒拆的睡衣
  const f = useCurrentFrame(), t = tt(f, T.s5.dur);
  useCam(mix([-2.45, 1.8, 1.9], [-2.0, 1.35, 0.3], t), mix([-2.45, 0.95, -2.4], [-1.7, 0.6, -2.35], t), 44);
  return (
    <LivingRoom dream>
      <Person pos={[-2.85, 0, -2.4]} outfit="pajama" color="#6c6e74" floral={false} hair="#ecebe6" seated eyesClosed={0.3} headTilt={0.08} />
      <Person pos={[-2.05, 0, -2.4]} outfit="pajama" color={PJ.fuxia} hair="#efefea" longHair seated headTilt={-0.12} />
      <group position={[-1.45, 0.53, -2.35]} rotation={[0, 0.15, 0]}>
        <mesh castShadow><boxGeometry args={[0.46, 0.08, 0.36]} /><meshStandardMaterial color={PJ.celeste} /></mesh>
        <mesh position={[0.05, 0.05, 0.02]} rotation={[-Math.PI / 2, 0, -0.1]}><planeGeometry args={[0.2, 0.1]} /><meshStandardMaterial color="#e9d9a8" /></mesh>
      </group>
    </LivingRoom>
  );
}

function UnopenedInsert() { // 真實照片：那件寫著他名字、從沒拆過的淺藍睡衣
  const f = useCurrentFrame();
  const sc = interpolate(f, [0, T.s5p.dur], [1.0, 1.1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ backgroundColor: "#3a3226", overflow: "hidden", filter: "sepia(.45) saturate(.7) brightness(.92)" }}>
      <Img src={staticFile("noche/prod/unopened.jpg")} style={{ position: "absolute", inset: -60, width: "calc(100% + 120px)", height: "calc(100% + 120px)", objectFit: "cover", filter: "blur(30px) brightness(.6)" }} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ position: "relative", width: 980, transform: `scale(${sc})` }}>
          <Img src={staticFile("noche/prod/unopened.jpg")} style={{ width: "100%", display: "block", borderRadius: 14, boxShadow: "0 30px 70px rgba(0,0,0,.5)" }} />
          <div style={{ position: "absolute", left: "34%", top: "8%", transform: "rotate(-8deg)", background: "#e8d5a2", padding: "14px 30px", borderRadius: 5, boxShadow: "0 8px 18px rgba(0,0,0,.3)", fontFamily: '"Bradley Hand", "Snell Roundhand", cursive', fontSize: 60, color: "#6b5236" }}>Tomás</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function S6Photo() { // 夢：媽媽看著全家穿睡衣的合照（過肩推近）
  const f = useCurrentFrame(), t = tt(f, T.s6.dur), tex = useContext(TexCtx);
  useCam(mix([1.35, 1.95, 1.35], [0.95, 1.55, 0.55], t), [0.45, 1.0, -0.4], 36);
  return (
    <LivingRoom dream>
      <Person pos={[0.5, 0, 0.2]} rotY={Math.PI} outfit="pajama" color={PJ.fuxia} hair="#efefea" longHair armL={-1.25} armR={-1.25} headTilt={0.08} lean={0.1} />
      <group position={[0.45, 1.0, -0.38]} rotation={[-0.2, 0, 0]}>
        <mesh><boxGeometry args={[0.62, 0.32, 0.03]} /><meshStandardMaterial color="#6e4a2b" /></mesh>
        <mesh position={[0, 0, 0.017]}><planeGeometry args={[0.56, 0.26]} /><meshStandardMaterial map={tex["family_photo.jpg"]} /></mesh>
      </group>
    </LivingRoom>
  );
}

function S7Reach() { // 夢：他張開雙手走向父母，碰到前猛然一黑
  const f = useCurrentFrame(), t = tt(f, T.s7.dur, Easing.out(Easing.quad));
  useCam(mix([1.2, 2.05, 2.6], [0.85, 1.8, 1.7], t), [0, 0.95, -0.45], 44);
  const step = interpolate(f, [0, T.s7.dur], [0.9, 0.25], clamp);
  return (
    <LivingRoom dream>
      <Person pos={[-0.32, 0, -1.0]} outfit="pajama" color="#6c6e74" floral={false} hair="#ecebe6" armL={-0.6} armR={-0.6} />
      <Person pos={[0.32, 0, -1.0]} outfit="pajama" color={PJ.fuxia} hair="#efefea" longHair armL={-0.6} armR={-0.6} />
      <Person pos={[0, 0, step]} rotY={Math.PI} outfit="suit" hair="#e9e7e1" armL={-1.45} armR={-1.45} legSwing={Math.sin(f / 7) * 0.25} />
    </LivingRoom>
  );
}

function S8Wake() { // 驚醒：辦公桌，手機亮著 24 dic · 20:47（手持晃動）
  const f = useCurrentFrame();
  const shake: V3 = [Math.sin(f * 1.7) * 0.012, Math.sin(f * 2.3) * 0.01, 0];
  const up = interpolate(f, [0, 8], [0.9, -0.05], { ...clamp, easing: Easing.out(Easing.back(2)) });
  const scr = useMemo(() => textTexture(["24 dic", "20:47"], { w: 256, h: 512, bg: "#0d1626", fg: "#eaf2ff", font: "Montserrat, sans-serif", size: 70 }), []);
  useCam(mix([0.75, 1.75, 1.35], [0.7, 1.65, 1.15], tt(f, 60)).map((v, i) => v + shake[i]) as V3, [0.2, 0.95, -0.25], 40);
  return (
    <Office>
      <Person pos={[0, 0, -0.62]} outfit="suit" hair="#2b1f18" seated lean={up} headTilt={0.05} armL={-1.2} armR={-1.2} />
      <group position={[0.42, 0.78, 0.12]} rotation={[-Math.PI / 2, 0, 0.3]}>
        <mesh><boxGeometry args={[0.1, 0.2, 0.012]} /><meshStandardMaterial color="#111" /></mesh>
        <mesh position={[0, 0, 0.007]}><planeGeometry args={[0.09, 0.18]} /><meshStandardMaterial map={scr} emissive="#ffffff" emissiveMap={scr} emissiveIntensity={0.9} /></mesh>
      </group>
    </Office>
  );
}

function Street() { // 跑過傍晚的街道，邊跑邊打電話（跟拍）
  const f = useCurrentFrame(), t = tt(f, T.s9.dur, Easing.linear);
  const x = -3 + 6 * t;
  const sky = useMemo(() => skyTexture("#26345f", "#f0905c"), []);
  useCam([x + 0.4, 1.35, 3.0], [x + 0.3, 1.05, 0], 42);
  const bld = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ x: -7 + i * 1.1, h: 2.5 + ((i * 37) % 5) * 0.7, c: ["#33405e", "#2c3651", "#3a4766"][i % 3] })), []);
  return (
    <>
      <color attach="background" args={["#1a2238"]} />
      <ambientLight intensity={0.45} color="#c8d4ff" />
      <directionalLight position={[-3, 5, 4]} intensity={0.9} color="#ffc79a" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 1]}><planeGeometry args={[30, 10]} /><meshStandardMaterial color="#56565c" /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}><planeGeometry args={[30, 1.6]} /><meshStandardMaterial color="#8d8a84" /></mesh>
      <mesh position={[0, 3, -6]}><planeGeometry args={[30, 7]} /><meshStandardMaterial map={sky} emissive="#fff" emissiveMap={sky} emissiveIntensity={0.55} /></mesh>
      {bld.map((b, i) => (
        <group key={i} position={[b.x, b.h / 2, -1.6]}>
          <mesh><boxGeometry args={[1.0, b.h, 0.8]} /><meshStandardMaterial color={b.c} /></mesh>
          {Array.from({ length: 6 }, (_, k) => <mesh key={k} position={[-0.25 + (k % 2) * 0.5, -b.h / 2 + 0.6 + Math.floor(k / 2) * 0.7, 0.41]}><planeGeometry args={[0.22, 0.3]} /><meshStandardMaterial color="#ffd48a" emissive="#ffc46b" emissiveIntensity={(i + k) % 3 ? 1.2 : 0} /></mesh>)}
        </group>
      ))}
      {[-4, -1, 2, 5].map((lx) => <group key={lx} position={[lx, 0, -0.75]}><mesh position={[0, 1.4, 0]}><cylinderGeometry args={[0.03, 0.03, 2.8, 8]} /><meshStandardMaterial color="#2a2a30" /></mesh><mesh position={[0, 2.85, 0]}><sphereGeometry args={[0.12, 12, 12]} /><meshStandardMaterial color="#fff2c8" emissive="#ffd88a" emissiveIntensity={2} /></mesh></group>)}
      <Person pos={[x, Math.abs(Math.sin(f / 4)) * 0.05, 0]} rotY={Math.PI / 2} outfit="suit" noTie hair="#2b1f18" lean={0.18} phone="ear" armR={-2.55} armL={Math.sin(f / 4) * 0.8} legSwing={Math.sin(f / 4) * 0.7} />
    </>
  );
}

const FAMILY = [
  { key: "papa", color: "#6c6e74", hair: "#3b3b3b", floral: false },
  { key: "mama", color: PJ.fuxia, hair: "#2a1d18", long: true, floral: true },
  { key: "hermana", color: "#f2a582", hair: "#5a3a26", long: true, floral: true },
  { key: "nino", color: PJ.celeste, hair: "#2b1f18", scale: 0.62, floral: false },
  { key: "nina", color: PJ.rosado, hair: "#4a2c1e", long: true, scale: 0.6, floral: true },
];

function S10Door() { // 推開家門：全家已穿睡衣在玩 UNO，抬頭看他
  const f = useCurrentFrame(), t = tt(f, T.s10.dur), look = interpolate(f, [30, 50], [0, 1], { ...clamp, easing: ease });
  useCam(mix([0.2, 1.6, 4.4], [0.05, 1.35, 2.2], t), [-0.3, 0.6, -0.6], 42);
  const seat: [number, number, number][] = [[-1.0, -0.9, 0.9], [-0.3, -1.25, 0.0], [0.45, -0.95, -0.7], [-0.85, -0.1, 1.9], [0.35, -0.15, -2.2]];
  const cards = ["#e63b3b", "#f2c14e", "#2e9e4f", "#2e6fd6", "#e63b3b", "#2e6fd6"];
  return (
    <LivingRoom t={f}>
      <mesh position={[-0.3, 0.2, -0.6]} castShadow><boxGeometry args={[0.9, 0.4, 0.6]} /><meshStandardMaterial color="#7d5230" /></mesh>
      {cards.map((c, i) => <mesh key={i} position={[-0.55 + i * 0.1, 0.41, -0.6 + (i % 2) * 0.08]} rotation={[-Math.PI / 2, 0, i * 0.4]}><planeGeometry args={[0.08, 0.12]} /><meshStandardMaterial color={c} /></mesh>)}
      {FAMILY.map((m, i) => (
        <Person key={m.key} pos={[seat[i][0], 0, seat[i][1]]} rotY={seat[i][2] + look * 0.4} outfit="pajama" color={m.color} hair={m.hair} longHair={m.long} floral={m.floral} scale={m.scale} seated headTurn={look * (0.5 - i * 0.12)} armL={-1.0} armR={-1.0} />
      ))}
      <Person pos={[0.15, 0, 3.4]} rotY={Math.PI} outfit="suit" noTie hair="#2b1f18" />
    </LivingRoom>
  );
}

function S11Change() { // 關鍵鏡頭：換上淺藍睡衣，手摸布料，肩膀垂下
  const f = useCurrentFrame(), t = tt(f, T.s11.dur), relax = interpolate(f, [14, 44], [0, 1], { ...clamp, easing: ease });
  useCam(mix([0.0, 1.38, -0.55], [0.0, 1.35, 0.55], t), [0, 1.18, -1.6], 36);
  return (
    <LivingRoom t={f + 900}>
      <Person pos={[0, 0, -1.6]} outfit="pajama" color={PJ.celeste} floral={false} hair="#2b1f18" armL={-1.05 + relax * 0.2} armR={-1.05 + relax * 0.2} armSpread={-0.35} lean={-0.06 * relax} headTilt={0.04} eyesClosed={relax * 0.9} />
    </LivingRoom>
  );
}

function SonFabricInsert() { // 真實照片：淺藍睡衣的布料與滾邊
  const f = useCurrentFrame();
  const sc = interpolate(f, [0, T.s11p.dur], [1.25, 1.0], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#9cc4e8" }}>
      <Img src={staticFile("noche/prod/son_chest.jpg")} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", objectPosition: "60% 40%", transform: `scale(${sc})`, transformOrigin: "60% 40%" }} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(255,214,160,.16), rgba(0,0,0,0) 45%)" }} />
    </AbsoluteFill>
  );
}

function S12Snack() { // 吃消夜、聊天、大笑；穿插商品細節圓圖
  const f = useCurrentFrame(), t = tt(f, T.s12.dur);
  useCam(mix([2.3, 2.5, 3.9], [2.25, 2.2, 3.3], t), [2.2, 0.8, 1.2], 42);
  const seats: [number, number, number][] = [[1.55, 0.75, 0.25], [2.85, 0.75, -0.25], [1.55, 1.65, Math.PI - 0.25], [2.85, 1.65, Math.PI + 0.25], [2.2, 0.55, 0]];
  const all = [...FAMILY.slice(0, 3), { key: "hijo", color: PJ.celeste, hair: "#2b1f18", floral: false }, FAMILY[3]];
  return (
    <LivingRoom t={f + 1020}>
      <DiningTable pos={[2.2, 0, 1.2]} />
      {all.map((m, i) => (
        <Person key={m.key} pos={[seats[i][0], 0, seats[i][1]]} rotY={seats[i][2]} outfit="pajama" color={m.color} hair={m.hair} longHair={"long" in m ? m.long : false} floral={m.floral} scale={"scale" in m ? m.scale : 1} seated lean={-0.08 + Math.max(0, Math.sin(f / 5 + i)) * 0.12} headTilt={Math.sin(f / 4 + i * 2) * 0.12} armL={-1.1} armR={-1.1 + Math.sin(f / 6 + i) * 0.2} />
      ))}
    </LivingRoom>
  );
}

function DetailBubbles() { // 商品細節：領口、袖口、花朵刺繡（真實照片圓圖）
  const f = useCurrentFrame();
  const items = [
    { img: "d_collar.jpg", label: "Cuello clásico con vivo", at: 25, y: 360 },
    { img: "d_cuff.jpg", label: "Manga larga con vivo", at: 60, y: 760 },
    { img: "d_floral.jpg", label: "Diseño floral", at: 95, y: 1160 },
  ];
  return (
    <AbsoluteFill>
      {items.map((it, i) => {
        const s = interpolate(f, [it.at, it.at + 10], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
        const o = interpolate(f, [it.at + 40, it.at + 50], [1, 0], clamp);
        return (
          <div key={i} style={{ position: "absolute", left: i % 2 ? 560 : 120, top: it.y, display: "flex", alignItems: "center", gap: 18, transform: `scale(${s})`, opacity: o, flexDirection: i % 2 ? "row-reverse" : "row" }}>
            <Img src={staticFile(`noche/prod/${it.img}`)} style={{ width: 320, height: 320, borderRadius: "50%", objectFit: "cover", border: "8px solid #fff", boxShadow: "0 14px 40px rgba(0,0,0,.35)" }} />
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 36, color: "#fff", background: "rgba(216,27,114,.9)", padding: "10px 18px", borderRadius: 14, maxWidth: 260, lineHeight: 1.2 }}>{it.label}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

function S13Toast() { // 爸爸舉杯（略低的角度）
  const f = useCurrentFrame(), t = tt(f, T.s13.dur), raise = interpolate(f, [6, 22], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  useCam(mix([1.7, 0.95, 2.6], [1.65, 1.0, 2.15], t), [1.55, 1.3, 0.75], 40);
  return (
    <LivingRoom t={f + 1170}>
      <DiningTable pos={[2.2, 0, 1.2]} />
      <Person pos={[1.55, 0, 0.75]} rotY={0.25} outfit="pajama" color="#6c6e74" floral={false} hair="#3b3b3b" seated armR={-1.1 - raise * 1.5} armL={-1.1} headTilt={-0.05} />
      <mesh position={[1.75, 1.32 + raise * 0.32, 0.95]}><cylinderGeometry args={[0.04, 0.035, 0.12, 12]} /><meshStandardMaterial color="#f5e7c0" transparent opacity={0.8} /></mesh>
    </LivingRoom>
  );
}

function Terrace({ t, children }: { t: number; children?: React.ReactNode }) {
  return (
    <>
      <color attach="background" args={["#0b1230"]} />
      <ambientLight intensity={0.5} color="#ffd9a8" />
      <pointLight position={[0, 2.6, 0]} intensity={8} color="#ffcf8a" distance={8} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[12, 12]} /><meshStandardMaterial color="#a4553a" roughness={0.85} /></mesh>
      {[-1.5, -0.5, 0.5, 1.5].map((z) => <StringLights key={z} from={[-3, 2.7, z]} to={[3, 2.7, z + 0.3]} n={16} sag={0.3} t={t} />)}
      {[[-2.6, -2], [2.5, -2.2], [-2.8, 1.5], [2.7, 1.2]].map(([x, z], i) => <mesh key={i} position={[x, 0.45, z]}><sphereGeometry args={[0.5, 14, 14]} /><meshStandardMaterial color={["#3f7d3a", "#c2408f", "#3f7d3a", "#d65b9f"][i]} /></mesh>)}
      {Array.from({ length: 40 }, (_, i) => <mesh key={i} position={[Math.sin(i * 12.9) * 9, 4 + (i % 7) * 0.9, -8 - (i % 5)]}><sphereGeometry args={[0.03, 6, 6]} /><meshBasicMaterial color="#ffffff" /></mesh>)}
      {children}
    </>
  );
}

const CLUSTER: { pos: V3; m: (typeof FAMILY)[number] | { key: string; color: string; hair: string; floral: boolean } }[] = [
  { pos: [-0.35, 0, 0.0], m: FAMILY[0] }, { pos: [0.35, 0, 0.0], m: FAMILY[1] }, { pos: [0, 0, 0.45], m: { key: "hijo", color: PJ.celeste, hair: "#2b1f18", floral: false } },
  { pos: [-0.85, 0, 0.35], m: FAMILY[2] }, { pos: [0.8, 0, 0.45], m: FAMILY[3] }, { pos: [0.95, 0, -0.2], m: FAMILY[4] },
];

function S14Midnight() { // 院子露台：午夜，全家歡呼（拉遠＋升臂）
  const f = useCurrentFrame(), t = tt(f, T.s14.dur), jump = f > 76 ? Math.abs(Math.sin((f - 76) / 4)) * 0.12 : 0;
  useCam(mix([0, 1.9, 2.6], [0, 4.2, 5.6], t), [0, 0.9, 0], 44);
  return (
    <Terrace t={f}>
      {CLUSTER.map((c, i) => <Person key={c.m.key} pos={[c.pos[0], jump * (i % 2 ? 1 : 0.7), c.pos[2]]} outfit="pajama" color={c.m.color} hair={c.m.hair} longHair={"long" in c.m ? c.m.long : false} floral={c.m.floral} scale={"scale" in c.m ? c.m.scale : 1} armL={f > 76 ? -2.8 : -0.2} armR={f > 76 ? -2.8 : -0.2} />)}
    </Terrace>
  );
}

function S15Hug() { // 這次抱到了：慢動作 360° 環繞
  const f = useCurrentFrame(), a = interpolate(f, [0, T.s15.dur], [0.2, 0.2 + Math.PI * 2], clamp), close = interpolate(f, [0, 30], [0, 1], { ...clamp, easing: ease });
  useCam([Math.sin(a) * 2.6, 1.55, Math.cos(a) * 2.6], [0, 1.0, 0.1], 40);
  return (
    <Terrace t={f + 1380}>
      {CLUSTER.map((c, i) => {
        const p: V3 = [c.pos[0] * (1 - close * 0.35), 0, c.pos[2] * (1 - close * 0.35)];
        const toC = Math.atan2(-p[0], 0.15 - p[2]);
        return <Person key={c.m.key} pos={p} rotY={toC} outfit="pajama" color={c.m.color} hair={c.m.hair} longHair={"long" in c.m ? c.m.long : false} floral={c.m.floral} scale={"scale" in c.m ? c.m.scale : 1} armL={-1.35} armR={-1.35} armSpread={-0.3} eyesClosed={0.8} lean={0.08} />;
      })}
    </Terrace>
  );
}

function S16Sleep() { // 凌晨：全家穿睡衣東倒西歪睡在沙發（高往下推近，呼應第 3 格）
  const f = useCurrentFrame(), t = tt(f, T.s16.dur);
  useCam(mix([-1.2, 3.0, 0.6], [-1.6, 2.2, -0.6], t), [-2.25, 0.7, -2.45], 38);
  const row = [
    { x: -3.15, m: FAMILY[2], tilt: 0.35, lean: 0.1 }, { x: -2.6, m: FAMILY[0], tilt: -0.1, lean: -0.15 },
    { x: -2.05, m: { key: "hijo", color: PJ.celeste, hair: "#2b1f18", floral: false }, tilt: 0.5, lean: 0.05 }, { x: -1.5, m: FAMILY[1], tilt: -0.35, lean: -0.1 },
  ];
  return (
    <LivingRoom t={0}>
      <ambientLight intensity={-0.2} />
      {row.map((r) => <Person key={r.m.key} pos={[r.x, 0, -2.4]} outfit="pajama" color={r.m.color} hair={r.m.hair} longHair={"long" in r.m ? r.m.long : false} floral={r.m.floral} seated eyesClosed={1} headTilt={r.tilt} lean={r.lean} armL={-0.9} armR={-0.9} />)}
      <Person pos={[-1.2, 0.2, -1.6]} rotY={0.6} outfit="pajama" color={PJ.celeste} hair="#2b1f18" floral={false} scale={0.62} seated eyesClosed={1} headTilt={0.4} lean={0.3} />
    </LivingRoom>
  );
}

function EndCard() { // 花朵刺繡大特寫 → 品牌畫面
  const f = useCurrentFrame();
  const sc = interpolate(f, [0, T.s17p.dur], [1.15, 1.0], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#d81b72" }}>
      <Img src={staticFile("noche/prod/floral_macro.jpg")} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", transform: `scale(${sc})` }} />
    </AbsoluteFill>
  );
}
function BrandCard() {
  const f = useCurrentFrame();
  const a = interpolate(f, [0, 14], [0, 1], { ...clamp, easing: ease }), b = interpolate(f, [12, 28], [0, 1], clamp), c = interpolate(f, [24, 40], [0, 1], clamp);
  const sw = [["Fuxia", PJ.fuxia], ["Rosado claro", PJ.rosado], ["Celeste", PJ.celeste], ["Plomo", PJ.plomo]];
  return (
    <AbsoluteFill style={{ opacity: a, background: "radial-gradient(ellipse at 50% 40%, #fff6ef, #f6dfe8 70%)", justifyContent: "center", alignItems: "center", gap: 46, flexDirection: "column" }}>
      <Img src={staticFile("noche/prod/wordmark.png")} style={{ width: 640, transform: `translateY(${(1 - a) * 30}px)` }} />
      <div style={{ opacity: b, fontFamily: SANS, fontWeight: 800, fontSize: 60, color: "#2a2340", textAlign: "center", lineHeight: 1.25 }}>Asatex te acompaña<br />en todos tus momentos.</div>
      <div style={{ opacity: c, display: "flex", gap: 30 }}>
        {sw.map(([n, col]) => <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}><div style={{ width: 86, height: 86, borderRadius: "50%", background: col, border: "5px solid #fff", boxShadow: "0 6px 16px rgba(0,0,0,.18)" }} /><span style={{ fontFamily: SANS, fontSize: 24, color: "#4a4058", fontWeight: 600 }}>{n}</span></div>)}
      </div>
      <div style={{ opacity: c, fontFamily: SANS, fontSize: 28, color: "#6b6178", letterSpacing: 2 }}>Pijama Asatex · Código #8025</div>
    </AbsoluteFill>
  );
}

// ── 疊加：字幕、字卡 ──
function Subtitles() {
  const f = useCurrentFrame();
  const cur = VO.find((v) => v.es && f >= v.at && f < v.end + 6);
  if (!cur) return null;
  const o = interpolate(f, [cur.at, cur.at + 5, cur.end, cur.end + 6], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 230, opacity: o }}>
      <div style={{ maxWidth: 900, textAlign: "center", fontFamily: SANS, fontWeight: 600, fontSize: 44, lineHeight: 1.3, color: "#fff", background: "rgba(10,12,18,.62)", padding: "14px 26px", borderRadius: 18 }}>{cur.es}</div>
    </AbsoluteFill>
  );
}
function Caption({ at, end, text, size = 64, top }: { at: number; end: number; text: string; size?: number; top?: number }) {
  const f = useCurrentFrame();
  const o = interpolate(f, [at, at + 10, end - 10, end], [0, 1, 1, 0], clamp);
  if (o <= 0) return null;
  return (
    <AbsoluteFill style={{ justifyContent: top ? "flex-start" : "center", paddingTop: top ?? 0, alignItems: "center", opacity: o }}>
      <div style={{ fontFamily: SANS, fontWeight: 300, fontSize: size, letterSpacing: 14, color: "#f4ead2", textTransform: "uppercase", textShadow: "0 2px 20px rgba(0,0,0,.6)" }}>{text}</div>
    </AbsoluteFill>
  );
}
function Clock() { // 23:59 → 00:00
  const f = useCurrentFrame();
  if (f < T.s14.from + 6 || f > T.s14.from + 82) return null;
  const k = f - T.s14.from; const sec = Math.min(60, Math.floor(interpolate(k, [6, 72], [55, 60], clamp)));
  const txt = sec >= 60 ? "00:00" : `23:59:${String(sec).padStart(2, "0")}`;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 300 }}>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: sec >= 60 ? 150 : 110, color: "#fff4d6", textShadow: "0 0 30px rgba(255,190,90,.8)" }}>{txt}</div>
    </AbsoluteFill>
  );
}

const TEX = ["family_photo.jpg"];
export const NochebuenaFull: React.FC = () => {
  const fabric = useFabricLoader();
  const tex = useTextures(TEX);
  if (!fabric || !tex) return null;
  const dream = () => "sepia(.55) saturate(.6) contrast(.95) brightness(.95)";
  const P = ({ s, children }: { s: { from: number; dur: number }; children: React.ReactNode }) => <Sequence from={s.from} durationInFrames={s.dur}>{children}</Sequence>;
  const wrap = (el: React.ReactNode) => <FabricCtx.Provider value={fabric}><TexCtx.Provider value={tex}>{el}</TexCtx.Provider></FabricCtx.Provider>;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* 第一幕 */}
      <P s={T.s1b}><ChestInsert /></P>
      <Shot s={T.s1} fadeIn={5}>{wrap(<Scene1 />)}</Shot>
      <Shot s={T.s2} filter={() => "saturate(.85) contrast(1.05)"}><Scene2 /></Shot>
      <Shot s={T.s3} filter={(k) => `saturate(.8) blur(${interpolate(k, [26, 52], [0, 16], clamp)}px) brightness(${interpolate(k, [22, 54], [1, 0], clamp)})`}><Scene3 /></Shot>
      {/* 第二幕：夢 */}
      <Shot s={T.s4} fadeIn={14} filter={dream}><Scene4 dur={T.s4.dur} /></Shot>
      <Shot s={T.s5} filter={dream}>{wrap(<S5Parents />)}</Shot>
      <Sequence from={T.s5p.from} durationInFrames={T.s5p.dur}><AbsoluteFill style={{ opacity: 1 }}><UnopenedInsert /></AbsoluteFill></Sequence>
      <Shot s={T.s6} filter={dream}>{wrap(<S6Photo />)}</Shot>
      <Shot s={T.s7} filter={(k) => `${dream()} brightness(${k > T.s7.dur - 6 ? 0 : 1})`}>{wrap(<S7Reach />)}</Shot>
      {/* 第三幕：驚醒 */}
      <Shot s={T.s8} filter={() => "saturate(.85) contrast(1.1)"}><S8Wake /></Shot>
      {/* 第四幕：回家 */}
      <Shot s={T.s9}><Street /></Shot>
      <Shot s={T.s10}>{wrap(<S10Door />)}</Shot>
      <Shot s={T.s11}>{wrap(<S11Change />)}</Shot>
      <P s={T.s11p}><SonFabricInsert /></P>
      <Shot s={T.s12}>{wrap(<S12Snack />)}</Shot>
      <P s={T.s12}><DetailBubbles /></P>
      <Shot s={T.s13}>{wrap(<S13Toast />)}</Shot>
      {/* 第五幕：午夜 */}
      <Shot s={T.s14}>{wrap(<S14Midnight />)}</Shot>
      <Shot s={T.s15}>{wrap(<S15Hug />)}</Shot>
      {/* 第六幕 */}
      <Shot s={T.s16} filter={() => "brightness(.8) sepia(.15)"}>{wrap(<S16Sleep />)}</Shot>
      <P s={T.s17p}><EndCard /></P>
      <P s={T.s17b}><BrandCard /></P>
      <Caption at={240} end={288} text="40 años después" />
      <Caption at={636} end={688} text="24 dic · 20:47" size={72} top={300} />
      <Clock />
      <Subtitles />
      {VO.map((v) => <Sequence key={v.f} from={v.at}><Audio src={staticFile(`noche/vo/${v.f}`)} /></Sequence>)}
      <Audio src={staticFile("noche/full_mix.wav")} />
    </AbsoluteFill>
  );
};
