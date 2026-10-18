// ASATEX Nochebuena 睡衣廣告《Este año, todos》— 開場 10 秒試片（分鏡表 v5 第 1–4 格）。
// 1080×1920 直式、30 fps。分鏡表正本：asatex/nochebuena/分鏡表.md。
// 風格：程式 3D「模型屋」公仔。字幕、字卡一律程式疊加（SOP：AI 與 3D 都不負責文字）。
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, Easing, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { loadFont } from "@remotion/fonts";

loadFont({ family: "Montserrat", url: staticFile("showroom/Montserrat.ttf"), weight: "100 900" });

export const N_FPS = 30;
export const N_DUR = 300;
const W = 1080, H = 1920;
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const ease = Easing.inOut(Easing.cubic);
export type V3 = [number, number, number];

// ── 剪接表（格數）──
const S1B = { from: 0, dur: 47 };   // 開場：睡衣口袋刺繡大特寫（真實照片）往後拉遠 0–1.57s
const S1 = { from: 39, dur: 51 };   // 交疊淡入 3D 媽媽，鏡頭從胸口繼續拉遠到講電話的近景 1.3–3.0s
const S2 = { from: 90, dur: 120 };  // 兒子接電話 3.0–7.0s
const S3 = { from: 210, dur: 54 };  // 趴桌睡著 7.0–8.8s
const S4 = { from: 264, dur: 36 };  // 夢：推開老家的門 8.8–10.0s
const VO = [
  { file: "noche/vo/mama1.wav", at: 6, end: 99, who: "Mamá", es: "¿Vienes hoy? Tu papá y yo te estamos esperando." },
  { file: "noche/vo/hijo1_f.wav", at: 96, end: 216, who: "", es: "Mamá, todavía no termino… El próximo año sí, te lo prometo." },
];

// ── 色票 ──
export const PJ = { fuxia: "#d81b72", rosado: "#f2a7c3", celeste: "#a9cbe8", plomo: "#8d8f96" };
const SKIN = "#e9b994", SUIT = "#2c3340", SHIRT = "#eef1f4", TIE = "#9e2430";

// ── 商品布紋貼圖（從 #8025 商品照取樣），在 ThreeCanvas 外載入 ──
export const FabricCtx = createContext<THREE.Texture | null>(null);
export function useFabricLoader() {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const [h] = useState(() => delayRender("fabric"));
  useEffect(() => {
    new THREE.TextureLoader().load(staticFile("noche/prod/fabric.jpg"), (t) => {
      t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.5, 1.5); t.anisotropy = 8;
      setTex(t); continueRender(h);
    });
  }, [h]);
  return tex;
}
export function Cloth({ color, rough = 0.85 }: { color: string; rough?: number }) {
  const fab = useContext(FabricCtx);
  return fab && color === PJ.fuxia ? <meshStandardMaterial map={fab} color="#ffffff" roughness={0.95} /> : <meshStandardMaterial color={color} roughness={rough} />;
}

// ── 小工具 ──
export function useCam(pos: V3, look: V3, fov: number) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  camera.position.set(...pos);
  camera.lookAt(...look);
  camera.fov = fov;
  camera.near = 0.05;
  camera.far = 100;
  camera.updateProjectionMatrix();
  return null;
}
export const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function textTexture(lines: string[], opt: { w?: number; h?: number; bg?: string; fg?: string; font?: string; size?: number } = {}) {
  const c = document.createElement("canvas");
  c.width = opt.w ?? 256; c.height = opt.h ?? 128;
  const g = c.getContext("2d")!;
  g.fillStyle = opt.bg ?? "#fffdf6"; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = opt.fg ?? "#2a2a2a";
  g.font = `${opt.size ?? 54}px ${opt.font ?? '"Bradley Hand", "Snell Roundhand", cursive'}`;
  g.textAlign = "center"; g.textBaseline = "middle";
  lines.forEach((l, i) => g.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * (opt.size ?? 54) * 1.1));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function skyTexture(top: string, bottom: string, lights = true) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 512;
  const g = c.getContext("2d")!;
  const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, top); gr.addColorStop(1, bottom);
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) {
    const x = i * 38 - 10 + rnd() * 10, w = 30 + rnd() * 26, h = 120 + rnd() * 230;
    g.fillStyle = "#1c2236"; g.fillRect(x, 512 - h, w, h);
    if (lights) for (let k = 0; k < 40; k++) { if (rnd() > 0.55) { g.fillStyle = rnd() > 0.5 ? "#ffd58a" : "#f7b267"; g.fillRect(x + 4 + (k % 3) * 9, 512 - h + 8 + Math.floor(k / 3) * 16, 5, 7); } }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ── 公仔 ──
type PersonProps = {
  pos?: V3; rotY?: number; outfit: "suit" | "pajama"; color?: string; hair: string; longHair?: boolean;
  lean?: number; headTilt?: number; eyesClosed?: number; phone?: "ear" | "shoulder" | null;
  armL?: number; armR?: number; seated?: boolean; showLegs?: boolean;
  noTie?: boolean; floral?: boolean; scale?: number; legSwing?: number; headTurn?: number; armSpread?: number;
};
export function Person(p: PersonProps) {
  const body = p.outfit === "suit" ? SUIT : (p.color ?? PJ.fuxia);
  const close = p.eyesClosed ?? 0;
  return (
    <group position={p.pos ?? [0, 0, 0]} rotation={[0, p.rotY ?? 0, 0]} scale={p.scale ?? 1}>
      {p.showLegs !== false && !p.seated && [-1, 1].map((k) => (
        <group key={k} position={[0.09 * k, 0.6, 0]} rotation={[(p.legSwing ?? 0) * k, 0, 0]}>
          <mesh position={[0, -0.28, 0]} castShadow><capsuleGeometry args={[0.075, 0.42, 8, 16]} /><Cloth color={p.outfit === "suit" ? "#232833" : body} /></mesh>
        </group>
      ))}
      {p.showLegs !== false && p.seated && [-1, 1].map((k) => (
        <group key={k} position={[0.09 * k, 0.5, 0.02]}>
          <mesh position={[0, 0, 0.22]} rotation={[Math.PI / 2, 0, 0]} castShadow><capsuleGeometry args={[0.075, 0.3, 8, 16]} /><Cloth color={p.outfit === "suit" ? "#232833" : body} /></mesh>
          <mesh position={[0, -0.22, 0.42]} castShadow><capsuleGeometry args={[0.07, 0.3, 8, 16]} /><Cloth color={p.outfit === "suit" ? "#232833" : body} /></mesh>
        </group>
      ))}
      {/* 上半身：以腰為軸前傾 */}
      <group position={[0, p.seated ? 0.5 : 0.62, 0]} rotation={[p.lean ?? 0, 0, 0]}>
        <mesh position={[0, 0.3, 0]} castShadow><capsuleGeometry args={[0.19, 0.34, 10, 20]} /><Cloth color={body} rough={p.outfit === "suit" ? 0.55 : 0.9} /></mesh>
        {p.outfit === "suit" ? (
          <>
            <mesh position={[0, 0.5, 0.15]} rotation={[0.25, 0, 0]}><boxGeometry args={[0.13, 0.12, 0.03]} /><meshStandardMaterial color={SHIRT} /></mesh>
            {!p.noTie && <mesh position={[0, 0.36, 0.185]} rotation={[0.08, 0, 0]}><boxGeometry args={[0.045, 0.24, 0.02]} /><meshStandardMaterial color={TIE} /></mesh>}
          </>
        ) : (
          <>
            {/* 白色滾邊的 V 領、口袋與花朵刺繡（#8025） */}
            <mesh position={[-0.05, 0.47, 0.168]} rotation={[0.2, 0, 0.55]}><boxGeometry args={[0.012, 0.16, 0.012]} /><meshStandardMaterial color="#ffffff" /></mesh>
            <mesh position={[0.05, 0.47, 0.168]} rotation={[0.2, 0, -0.55]}><boxGeometry args={[0.012, 0.16, 0.012]} /><meshStandardMaterial color="#ffffff" /></mesh>
            <mesh position={[0, 0.3, 0.19]}><boxGeometry args={[0.012, 0.3, 0.01]} /><meshStandardMaterial color="#ffffff" /></mesh>
            {[0.38, 0.29, 0.2].map((y) => <mesh key={y} position={[0.025, y, 0.192]}><sphereGeometry args={[0.012, 8, 8]} /><meshStandardMaterial color="#fff6e8" /></mesh>)}
            {p.floral !== false && [[0.1, 0.33], [0.12, 0.3], [0.085, 0.29], [0.13, 0.35], [-0.11, 0.12], [-0.13, 0.15]].map(([x, y], i) => (
              <mesh key={i} position={[x, y, 0.18]}><sphereGeometry args={[0.016, 8, 8]} /><meshStandardMaterial color={i % 2 ? "#ffe3ef" : "#ffffff"} /></mesh>
            ))}
          </>
        )}
        {/* 手臂 */}
        <group position={[-0.23, 0.46, 0]} rotation={[p.armL ?? 0.1, -(p.armSpread ?? 0), 0.12 + (p.armSpread ?? 0) * 0.6]}>
          <mesh position={[0, -0.2, 0]} castShadow><capsuleGeometry args={[0.06, 0.3, 8, 12]} /><Cloth color={body} /></mesh>
          <mesh position={[0, -0.4, 0]}><sphereGeometry args={[0.055, 12, 12]} /><meshStandardMaterial color={SKIN} /></mesh>
        </group>
        <group position={[0.23, 0.46, 0]} rotation={[p.armR ?? 0.1, p.armSpread ?? 0, -0.12 - (p.armSpread ?? 0) * 0.6]}>
          <mesh position={[0, -0.2, 0]} castShadow><capsuleGeometry args={[0.06, 0.3, 8, 12]} /><Cloth color={body} /></mesh>
          <mesh position={[0, -0.4, 0]}><sphereGeometry args={[0.055, 12, 12]} /><meshStandardMaterial color={SKIN} /></mesh>
          {p.phone === "ear" && <mesh position={[0.02, -0.4, 0.06]}><boxGeometry args={[0.05, 0.11, 0.012]} /><meshStandardMaterial color="#1a1a1e" /></mesh>}
        </group>
        {/* 頭 */}
        <group position={[0, 0.7, 0]} rotation={[0, p.headTurn ?? 0, p.headTilt ?? 0]}>
          <mesh castShadow><sphereGeometry args={[0.2, 32, 32]} /><meshStandardMaterial color={SKIN} roughness={0.7} /></mesh>
          <mesh position={[0, 0.045, -0.012]} scale={[1.06, 0.92, 1.06]}><sphereGeometry args={[0.2, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.55]} /><meshStandardMaterial color={p.hair} roughness={0.85} /></mesh>
          {p.longHair && <mesh position={[0, -0.08, -0.07]} scale={[1.05, 1.25, 0.8]}><sphereGeometry args={[0.2, 24, 24]} /><meshStandardMaterial color={p.hair} roughness={0.85} /></mesh>}
          {[-0.07, 0.07].map((x) => <mesh key={x} position={[x, 0.01, 0.185]} scale={[1, 1 - 0.85 * close, 1]}><sphereGeometry args={[0.022, 12, 12]} /><meshStandardMaterial color="#1d1d22" /></mesh>)}
          <mesh position={[0, -0.075, 0.18]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.035, 0.008, 6, 16, Math.PI]} /><meshStandardMaterial color="#8a4b3c" /></mesh>
          {[-0.11, 0.11].map((x) => <mesh key={x} position={[x, -0.04, 0.16]}><sphereGeometry args={[0.03, 10, 10]} /><meshStandardMaterial color="#f29a8f" transparent opacity={0.45} /></mesh>)}
          {p.phone === "shoulder" && <mesh position={[0.19, -0.1, 0.07]} rotation={[0.2, 0.5, -0.6]}><boxGeometry args={[0.07, 0.16, 0.018]} /><meshStandardMaterial color="#15151a" roughness={0.3} /></mesh>}
        </group>
      </group>
    </group>
  );
}

// 一疊摺好的睡衣，每件放名字卡
export function PajamaStack({ pos, cards }: { pos: V3; cards: string[] }) {
  const cols = [PJ.fuxia, PJ.rosado, PJ.celeste, PJ.plomo];
  const tex = useMemo(() => cards.map((n) => textTexture([n])), [cards]);
  return (
    <group position={pos}>
      {cols.map((c, i) => (
        <group key={c} position={[0, i * 0.085, 0]} rotation={[0, (i % 2 ? 0.05 : -0.04), 0]}>
          <mesh castShadow receiveShadow><boxGeometry args={[0.46, 0.075, 0.36]} /><meshStandardMaterial color={c} roughness={0.95} /></mesh>
          <mesh position={[0, 0.001, 0.181]}><boxGeometry args={[0.46, 0.012, 0.004]} /><meshStandardMaterial color="#ffffff" /></mesh>
          {[[-0.12, 0.05], [-0.15, -0.02], [-0.09, 0.0]].map(([x, z], k) => <mesh key={k} position={[x, 0.04, z]}><sphereGeometry args={[0.014, 8, 8]} /><meshStandardMaterial color="#ffe1ee" /></mesh>)}
        </group>
      ))}
      {/* 只有最上面一張卡看得到字 */}
      <mesh position={[0.07, 4 * 0.085 - 0.04, 0.02]} rotation={[-Math.PI / 2 + 0.25, 0, -0.12]}><planeGeometry args={[0.22, 0.11]} /><meshStandardMaterial map={tex[0]} /></mesh>
    </group>
  );
}

// ── 場景 1：媽媽穿睡衣在客廳打電話 ──
export function Scene1() {
  const f = useCurrentFrame();
  const pull = interpolate(f, [0, S1.dur], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  useCam(mix([0.05, 1.12, 0.75], [0, 1.42, 2.1], pull), mix([0.05, 1.0, -0.55], [0, 1.22, -0.4], pull), 34);
  const lights = useMemo(() => Array.from({ length: 13 }, (_, i) => i), []);
  return (
    <>
      <color attach="background" args={["#3a2a22"]} />
      <ambientLight intensity={0.75} color="#fff1e2" />
      <directionalLight position={[-1.5, 3, 3]} intensity={1.6} color="#fff4e8" castShadow />
      <pointLight position={[1.4, 1.6, 0.8]} intensity={2.2} color="#ffc98f" distance={6} />
      {/* 牆、窗、燈串 */}
      <mesh position={[0, 1.6, -1.2]} receiveShadow><planeGeometry args={[6, 4]} /><meshStandardMaterial color="#efe3d3" roughness={1} /></mesh>
      <mesh position={[1.05, 1.95, -1.18]}><planeGeometry args={[0.7, 0.8]} /><meshStandardMaterial color="#25304f" emissive="#1b2340" /></mesh>
      {lights.map((i) => <mesh key={i} position={[-1.6 + i * 0.27, 2.55 - Math.sin(i / 12 * Math.PI) * 0.18, -1.15]}><sphereGeometry args={[0.035, 10, 10]} /><meshStandardMaterial color="#ffd27a" emissive="#ffb84d" emissiveIntensity={2.2} /></mesh>)}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[8, 8]} /><meshStandardMaterial color="#8a5a3c" roughness={0.9} /></mesh>
      {/* 媽媽穿 #8025 講電話 */}
      <Person pos={[0, 0, -0.55]} outfit="pajama" color={PJ.fuxia} hair="#5a3b2a" longHair phone="ear" armR={-2.55 + Math.sin(f / 14) * 0.03} armL={0.2} headTilt={0.12 + Math.sin(f / 22) * 0.03} />
    </>
  );
}

// ── 場景 2：兒子在辦公室，肩膀夾電話打字 ──
export function Office({ seated = true, children }: { seated?: boolean; children?: React.ReactNode }) {
  const sky = useMemo(() => skyTexture("#3b4a7a", "#e98a5c"), []);
  const desks = [[-2.2, -2.2], [2.2, -2.2], [-2.2, -4.4], [2.2, -4.4], [0, -4.4]];
  return (
    <>
      <color attach="background" args={["#0e1522"]} />
      <ambientLight intensity={0.35} color="#9fb6e0" />
      <directionalLight position={[2, 6, 3]} intensity={0.6} color="#bcd2ff" castShadow />
      <pointLight position={[0.45, 1.25, 0.15]} intensity={5} color="#8ec5ff" distance={3.5} />
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[20, 20]} /><meshStandardMaterial color="#39465a" roughness={0.9} /></mesh>
      <mesh position={[0, 2, -6]}><planeGeometry args={[12, 4]} /><meshStandardMaterial map={sky} emissive="#ffffff" emissiveMap={sky} emissiveIntensity={0.55} /></mesh>
      {desks.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.74, 0]} castShadow><boxGeometry args={[1.5, 0.05, 0.75]} /><meshStandardMaterial color="#5b6577" /></mesh>
          <mesh position={[0, 1.02, -0.25]}><boxGeometry args={[0.55, 0.36, 0.04]} /><meshStandardMaterial color="#20252e" /></mesh>
          <mesh position={[0, 0.5, 0.55]}><boxGeometry args={[0.45, 0.06, 0.45]} /><meshStandardMaterial color="#2a303b" /></mesh>
        </group>
      ))}
      {/* 主角的桌子 */}
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow><boxGeometry args={[1.6, 0.05, 0.8]} /><meshStandardMaterial color="#6a7486" /></mesh>
      {[[-0.75, -0.35], [0.75, -0.35], [-0.75, 0.35], [0.75, 0.35]].map(([x, z], i) => <mesh key={i} position={[x, 0.36, z]}><boxGeometry args={[0.04, 0.72, 0.04]} /><meshStandardMaterial color="#4a5263" /></mesh>)}
      <mesh position={[0.55, 1.03, -0.12]} rotation={[0, -0.5, 0]}><boxGeometry args={[0.6, 0.38, 0.04]} /><meshStandardMaterial color="#1b1f27" /></mesh>
      <mesh position={[0.543, 1.03, -0.097]} rotation={[0, -0.5, 0]}><planeGeometry args={[0.56, 0.34]} /><meshStandardMaterial color="#cfe6ff" emissive="#7fb4ee" emissiveIntensity={0.7} /></mesh>
      {[[-0.55, 0.05, 9], [-0.3, -0.2, 6], [0.15, 0.22, 4]].map(([x, z, n], i) => (
        <group key={i} position={[x, 0.765, z]}>
          {Array.from({ length: n }, (_, k) => <mesh key={k} position={[Math.sin(k * 3.1 + i) * 0.015, k * 0.018, 0]} rotation={[0, Math.sin(k * 1.7 + i) * 0.12, 0]} castShadow><boxGeometry args={[0.3, 0.012, 0.21]} /><meshStandardMaterial color={k % 3 ? "#f1f1ec" : "#e2e5ea"} /></mesh>)}
        </group>
      ))}
      <mesh position={[0, 0.775, 0.18]}><boxGeometry args={[0.45, 0.02, 0.14]} /><meshStandardMaterial color="#2a2f38" /></mesh>
      {seated && <mesh position={[0, 0.45, -0.62]}><boxGeometry args={[0.5, 0.06, 0.48]} /><meshStandardMaterial color="#2a303b" /></mesh>}
      {children}
    </>
  );
}

export function Scene2() {
  const f = useCurrentFrame();
  const t = interpolate(f, [0, S2.dur], [0, 1], { ...clamp, easing: ease });
  useCam(mix([1.25, 1.42, 2.6], [0.25, 1.32, 1.85], t), [0, 1.12, -0.5], 36);
  const type = Math.sin(f * 1.3) * 0.05;
  return (
    <Office>
      <Person pos={[0, 0.0, -0.62]} rotY={0} outfit="suit" hair="#2b1f18" seated phone="shoulder" headTilt={0.3} lean={0.12} armL={-1.15 + type} armR={-1.15 - type} />
    </Office>
  );
}

// ── 場景 3：高角度推近，趴在桌上睡著 ──
export function Scene3() {
  const f = useCurrentFrame();
  const t = interpolate(f, [0, S3.dur], [0, 1], { ...clamp, easing: ease });
  const drop = interpolate(f, [4, 26], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  useCam(mix([0.55, 3.0, 1.05], [0.25, 2.0, 0.45], t), [0, 0.9, -0.35], 34);
  return (
    <Office>
      <Person pos={[0, 0.0, -0.62]} outfit="suit" hair="#2b1f18" seated lean={0.12 + drop * 0.95} headTilt={-0.1 + drop * 0.35} eyesClosed={drop} armL={-1.2 - drop * 0.25} armR={-1.2 - drop * 0.25} />
    </Office>
  );
}

// ── 場景 4：夢，老年兒子推開老家的門（滑動變焦）──
export function Scene4({ dur = S4.dur }: { dur?: number } = {}) {
  const f = useCurrentFrame();
  const t = interpolate(f, [0, dur], [0, 1], { ...clamp, easing: ease });
  const door = interpolate(f, [2, Math.min(30, dur - 6)], [0, 1.25], { ...clamp, easing: Easing.out(Easing.cubic) });
  // 滑動變焦：鏡頭往前推，同時把視角拉寬，讓主角大小不變、走廊被拉長
  const d = 3.4 - 1.5 * t, Hh = 2 * 3.4 * Math.tan((22 * Math.PI) / 180);
  const fov = (2 * Math.atan(Hh / (2 * d)) * 180) / Math.PI;
  useCam([0, 1.55, 1.2 + d], [0, 1.2, 1.2], fov);
  const lit = Array.from({ length: 12 }, (_, i) => i);
  return (
    <>
      <color attach="background" args={["#1d1a14"]} />
      <ambientLight intensity={0.5} color="#e6d7b0" />
      <pointLight position={[0, 2.4, -3]} intensity={6} color="#f0d59a" distance={9} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -2]} receiveShadow><planeGeometry args={[6, 14]} /><meshStandardMaterial color="#6d5f48" roughness={0.95} /></mesh>
      {/* 門框與牆 */}
      {[-1.6, 1.6].map((x) => <mesh key={x} position={[x, 1.6, 0.8]}><boxGeometry args={[2.0, 3.2, 0.2]} /><meshStandardMaterial color="#b8a780" roughness={1} /></mesh>)}
      <mesh position={[0, 2.85, 0.8]}><boxGeometry args={[1.2, 0.7, 0.2]} /><meshStandardMaterial color="#b8a780" /></mesh>
      <group position={[-0.58, 0, 0.72]} rotation={[0, -door, 0]}>
        <mesh position={[0.58, 1.25, 0]} castShadow><boxGeometry args={[1.16, 2.5, 0.06]} /><meshStandardMaterial color="#6b4a32" roughness={0.8} /></mesh>
        <mesh position={[1.02, 1.2, 0.05]}><sphereGeometry args={[0.04, 10, 10]} /><meshStandardMaterial color="#c9a75a" metalness={0.6} roughness={0.4} /></mesh>
      </group>
      {/* 走廊兩側與盡頭 */}
      {[-1.05, 1.05].map((x) => <mesh key={x} position={[x, 1.5, -3]} rotation={[0, x < 0 ? Math.PI / 2 : -Math.PI / 2, 0]}><planeGeometry args={[7.5, 3]} /><meshStandardMaterial color="#cbb88f" roughness={1} side={THREE.DoubleSide} /></mesh>)}
      <mesh position={[0, 1.5, -6.6]}><planeGeometry args={[2.2, 3]} /><meshStandardMaterial color="#a8946b" /></mesh>
      {lit.map((i) => <mesh key={i} position={[-0.95 + i * 0.17, 2.55 - Math.sin(i / 11 * Math.PI) * 0.15, -6.5]}><sphereGeometry args={[0.035, 10, 10]} /><meshStandardMaterial color={i % 2 ? "#7a6a4e" : "#ffe1a0"} emissive={i % 2 ? "#000000" : "#ffcc66"} emissiveIntensity={i % 2 ? 0 : 1.8} /></mesh>)}
      {/* 老年兒子：白髮、西裝，背對鏡頭 */}
      <Person pos={[0.05, 0, 1.25]} rotY={Math.PI} outfit="suit" hair="#e9e7e1" lean={0.06} armR={-0.9 - door * 0.3} />
    </>
  );
}

// ── 插入：媽媽胸口特寫（口袋刺繡、滾邊、鈕扣），品牌字卡放在畫面上，不畫在衣服上 ──
export function ChestInsert() {
  const f = useCurrentFrame(); // Sequence 內已是相對格數
  const sc = interpolate(f, [0, S1B.dur], [2.3, 1.0], { ...clamp, easing: Easing.out(Easing.cubic) });
  const bx = 0;
  const brand = interpolate(f, [18, 30], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ backgroundColor: "#7a1d45", overflow: "hidden" }}>
      <Img src={staticFile("noche/prod/chest.jpg")} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", objectPosition: "88% 50%", transform: `scale(${sc}) translateX(${bx}px)`, transformOrigin: "62% 44%" }} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(255,220,180,.12), rgba(0,0,0,0) 40%, rgba(0,0,0,.25))" }} />
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 210 }}>
        <div style={{ opacity: brand, transform: `translateY(${(1 - brand) * 24}px)`, background: "rgba(255,255,255,.94)", borderRadius: 22, padding: "18px 30px", boxShadow: "0 12px 34px rgba(0,0,0,.22)" }}>
          <Img src={staticFile("noche/prod/wordmark.png")} style={{ width: 380, display: "block" }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ── 疊加：字幕、字卡、景深與色調 ──
function Subtitle() {
  const f = useCurrentFrame();
  const cur = VO.find((v) => f >= v.at && f < v.end + 6);
  if (!cur) return null;
  const o = interpolate(f, [cur.at, cur.at + 5, cur.end, cur.end + 6], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 230, opacity: o }}>
      <div style={{ maxWidth: 900, textAlign: "center", fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: 44, lineHeight: 1.3, color: "#fff", background: "rgba(10,12,18,.62)", padding: "14px 26px", borderRadius: 18 }}>{cur.es}</div>
    </AbsoluteFill>
  );
}

function TitleCard() {
  const f = useCurrentFrame();
  const o = interpolate(f, [240, 252, 276, 288], [0, 1, 1, 0], clamp);
  const ls = interpolate(f, [240, 288], [10, 18], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: o }}>
      <div style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 300, fontSize: 64, letterSpacing: ls, color: "#efe3c4", textTransform: "uppercase" }}>40 años después</div>
    </AbsoluteFill>
  );
}

export const Shot: React.FC<{ s: { from: number; dur: number }; children: React.ReactNode; filter?: (f: number) => string; fadeIn?: number }> = ({ s, children, filter, fadeIn }) => {
  const f = useCurrentFrame();
  return (
    <Sequence from={s.from} durationInFrames={s.dur}>
      <AbsoluteFill style={{ filter: filter ? filter(f - s.from) : undefined, opacity: fadeIn ? interpolate(f - s.from, [0, fadeIn], [0, 1], clamp) : 1 }}>
        <ThreeCanvas width={W} height={H} shadows gl={{ antialias: true }} camera={{ fov: 36, position: [0, 1.5, 3] }}>
          {children}
        </ThreeCanvas>
      </AbsoluteFill>
    </Sequence>
  );
};

export const Nochebuena: React.FC = () => {
  const fabric = useFabricLoader();
  if (!fabric) return null;
  return (
  <FabricCtx.Provider value={fabric}>
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Sequence from={S1B.from} durationInFrames={S1B.dur}><ChestInsert /></Sequence>
    <Shot s={S1} fadeIn={5}><FabricCtx.Provider value={fabric}><Scene1 /></FabricCtx.Provider></Shot>
    <Shot s={S2} filter={() => "saturate(.85) contrast(1.05)"}><Scene2 /></Shot>
    <Shot s={S3} filter={(k) => `saturate(.8) blur(${interpolate(k, [26, 52], [0, 16], clamp)}px) brightness(${interpolate(k, [22, 54], [1, 0], clamp)})`}><Scene3 /></Shot>
    <Shot s={S4} fadeIn={14} filter={() => "sepia(.55) saturate(.6) contrast(.95) brightness(.95)"}><Scene4 /></Shot>
    <TitleCard />
    <Subtitle />
    {VO.map((v) => <Sequence key={v.file} from={v.at}><Audio src={staticFile(v.file)} /></Sequence>)}
    <Audio src={staticFile("noche/sfx.wav")} />
  </AbsoluteFill>
  </FabricCtx.Provider>
  );
};
