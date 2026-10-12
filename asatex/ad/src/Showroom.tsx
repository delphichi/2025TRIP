// ASATEX 30 秒 3D 展示間廣告（西班牙文）：真 3D 場景，攝影機做遠中近景／特寫、俯仰角、推軌、環繞、升降、變焦、滑動變焦。
// 1920×1080，30 fps。配樂 scripts/score2.py，旁白 scripts/mix_vo2.py；時間表 SHOTS 是唯一的剪接依據。
import React, { useEffect, useMemo, useState } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, Easing, interpolate, spring, staticFile, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { loadFont } from "@remotion/fonts";
import { PATHS } from "./showroom/paths";

loadFont({ family: "Montserrat", url: staticFile("showroom/Montserrat.ttf"), weight: "100 900" });
loadFont({ family: "Plex Mono", url: staticFile("showroom/PlexMono-Medium.ttf"), weight: "500" });

export const S_FPS = 30;
export const S_DUR = 900;
const SHOW_HUD = true; // 角落的鏡頭術語標示；給客戶的正式版可關掉

const NAVY = "#1d2846";
const RED = "#d8343a";
const SANS = "Montserrat, Helvetica Neue, Arial, sans-serif";
const MONO = '"Plex Mono", ui-monospace, monospace';
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const PRODUCTS = [
  { k: "telas", w: "TELAS", c: "#d8343a" },
  { k: "calcetines", w: "CALCETINES", c: "#2b5fb3" },
  { k: "pantis", w: "PANTIS", c: "#1d2846" },
  { k: "ropa", w: "ROPA INTERIOR", c: "#e07a2f" },
  { k: "pijamas", w: "PIJAMAS", c: "#2b5fb3" },
  { k: "panuelos", w: "PAÑUELOS", c: "#d8343a" },
  { k: "guantes", w: "GUANTES", c: "#1d2846" },
  { k: "balones", w: "BALONES", sub: "BÁSQUETBOL · FÚTBOL", c: "#e07a2f" },
  { k: "bolsas", w: "BOLSAS", sub: "DE COMPRAS", c: "#2b5fb3" },
  { k: "cinta", w: "CINTA", sub: "DE EMBALAJE", c: "#b8862a" },
];

// ── 場景幾何 ──
type V3 = [number, number, number];
const R = 6.5; // 商品環半徑
const ICON_Y = 2.05;
const theta = (i: number) => ((i + 0.5) / PRODUCTS.length) * Math.PI * 2; // 轉半格，讓 logo 正前方空出來
const prodPos = (i: number): V3 => [R * Math.sin(theta(i)), ICON_Y, R * Math.cos(theta(i))];
const outward = (i: number): V3 => [Math.sin(theta(i)), 0, Math.cos(theta(i))];
const sideOf = (i: number): V3 => [Math.cos(theta(i)), 0, -Math.sin(theta(i))];
const add = (...vs: V3[]): V3 => vs.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0] as V3);
const mul = (v: V3, k: number): V3 => [v[0] * k, v[1] * k, v[2] * k];
const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const up = (y: number): V3 => [0, y, 0];
const deg = (d: number) => (d * Math.PI) / 180;

// ── 鏡頭表 ──
type Cam = { pos: V3; look: V3; fov: number; roll?: number; upv?: V3 };
type Shot = { start: number; dur: number; size: string; move: string; cam: (t: number) => Cam; ease?: (t: number) => number };
const inOut = Easing.inOut(Easing.cubic);
const SHOTS: Shot[] = [
  {
    start: 0, dur: 3, size: "GRAN PLANO GENERAL", move: "CENITAL · DESCENSO",
    cam: (t) => ({ pos: [0, 30 - 10 * t, 0], look: [0, 0, 0], fov: 46, upv: [Math.sin(deg(-20 + 45 * t)), 0, -Math.cos(deg(-20 + 45 * t))] }),
  },
  { start: 3, dur: 2, size: "PLANO GENERAL", move: "PICADO · TRAVELLING IN", cam: (t) => ({ pos: mix([0, 9, 18], [0, 5.5, 11.5], t), look: [0, 2, 0], fov: 40 }) },
  { start: 5, dur: 2, size: "PRIMER PLANO", move: "CONTRAPICADO · ARCO", cam: (t) => ({ pos: [2.6 * Math.cos(deg(60 + 60 * t)), 0.4, 4.8 * Math.sin(deg(60 + 60 * t))], look: [0, 2.9, 0], fov: 44 }) },
  ...PRODUCTS.map((_, i): Shot => {
    const P = prodPos(i), O = outward(i), S = sideOf(i);
    const shots: Omit<Shot, "start" | "dur">[] = [
      { size: "PRIMER PLANO", move: "TRAVELLING IN", cam: (t) => ({ pos: add(P, mul(O, 6 - 2.6 * t), up(0.25)), look: P, fov: 34 }) },
      { size: "PLANO DETALLE", move: "TRAVELLING LATERAL", cam: (t) => ({ pos: add(P, mul(O, 3.6), mul(S, 0.4 - 2.6 * t), up(0.3)), look: add(P, up(0.1)), fov: 30 }) },
      {
        size: "PLANO MEDIO", move: "ARCO 80°",
        cam: (t) => { const a = deg(-40 + 80 * t); return { pos: add(P, mul(O, 4.6 * Math.cos(a)), mul(S, 4.6 * Math.sin(a)), up(1.0)), look: P, fov: 40 }; },
      },
      { size: "PRIMER PLANO", move: "PLANO HOLANDÉS", cam: (t) => ({ pos: add(P, mul(O, 4.4 - 1.1 * t), up(0.3)), look: P, fov: 34, roll: deg(14 + 8 * t) }) },
      { size: "PLANO MEDIO", move: "CONTRAPICADO · TRAVELLING OUT", cam: (t) => ({ pos: add(P, mul(O, 2.6 + 2.2 * t), up(-1.35 + 0.25 * t)), look: add(P, up(0.2)), fov: 40 }) },
      { size: "PRIMER PLANO", move: "PICADO · GRÚA", cam: (t) => ({ pos: add(P, mul(O, 2.8), up(3.4 - 1.6 * t)), look: P, fov: 38 }) },
      { size: "PRIMER PLANO", move: "ZOOM IN", cam: (t) => ({ pos: add(P, mul(O, 6.2), up(0.3)), look: P, fov: 46 - 24 * t }) },
      {
        size: "PLANO MEDIO", move: "EFECTO VÉRTIGO",
        cam: (t) => { const d = 3.2 + 6.5 * t; const H = 2 * 3.2 * Math.tan(deg(21)); return { pos: add(P, mul(O, d), up(0.2)), look: P, fov: (2 * Math.atan(H / (2 * d)) * 180) / Math.PI }; },
      },
      { size: "PLANO MEDIO", move: "GRÚA · PICADO A NORMAL", cam: (t) => ({ pos: add(P, mul(O, 4.0), up(3.8 - 3.4 * t)), look: P, fov: 38 }) },
      { size: "PLANO DETALLE", move: "MACRO · TRAVELLING IN", cam: (t) => ({ pos: add(P, mul(O, 3.0 - 0.7 * t), mul(S, 0.35)), look: add(P, mul(S, 0.2), up(-0.15)), fov: 20 }) },
    ];
    // 攝影機往側邊挪 1.6，讓中央 logo 圖騰退到畫面一側，不要正好疊在商品後面
    const sh = shots[i];
    return { start: 7 + i, dur: 1, ...sh, cam: (t) => { const c = sh.cam(t); return { ...c, pos: add(c.pos, mul(S, 1.6)) }; } };
  }),
  {
    start: 17, dur: 4, size: "GRAN PLANO GENERAL", move: "GRÚA · TRAVELLING OUT",
    cam: (t) => { const a = deg(25 + 70 * t), r = 7 + 12 * t; return { pos: [r * Math.sin(a), 1.6 + 10 * t, r * Math.cos(a)], look: [0, 1.6, 0], fov: 40 }; },
  },
  { start: 21, dur: 5, size: "PLANO MEDIO", move: "TRAVELLING IN", cam: (t) => ({ pos: [-1.4, 2.85, 10.5 - 4 * t], look: [-2.3, 2.35, 0], fov: 32 }) },
  { start: 26, dur: 4, size: "PLANO GENERAL", move: "TRAVELLING OUT", cam: (t) => ({ pos: [0, 3.4, 10 + 1.8 * t], look: [0, 2.05, 0], fov: 30 }) },
];
const shotIndex = (f: number) => {
  const t = f / S_FPS;
  let k = 0;
  SHOTS.forEach((s, i) => { if (t >= s.start) k = i; });
  return k;
};
const focal = (fov: number) => 12 / Math.tan(deg(fov) / 2); // 全片幅等效焦距（mm）

// ── 3D 元件 ──
const useLogoTexture = () => {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const [handle] = useState(() => delayRender("logo texture"));
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 1024;
      const g = c.getContext("2d")!;
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(512, 512, 512, 0, Math.PI * 2);
      g.fill();
      const w = 930, h = (w * img.height) / img.width;
      g.drawImage(img, (1024 - w) / 2, (1024 - h) / 2 + 20, w, h);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      setTex(t);
      continueRender(handle);
    };
    img.src = staticFile("showroom/logo.png");
  }, [handle]);
  return tex;
};

const buildTubes = (paths: string[]) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">${paths.map((d) => `<path d="${d}"/>`).join("")}</svg>`;
  const data = new SVGLoader().parse(svg);
  const geos: THREE.TubeGeometry[] = [];
  for (const p of data.paths) {
    for (const sp of p.subPaths) {
      const n = Math.max(16, Math.round(sp.getLength() / 3));
      const pts = sp.getSpacedPoints(n).map((v) => new THREE.Vector3((v.x - 120) / 100, -(v.y - 120) / 100, 0));
      const cp = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 0; i < pts.length - 1; i++) if (pts[i].distanceTo(pts[i + 1]) > 1e-4) cp.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
      if (cp.curves.length) geos.push(new THREE.TubeGeometry(cp, cp.curves.length * 2, 0.04, 10, false));
    }
  }
  return geos;
};

const ProductModel: React.FC<{ i: number; f: number }> = ({ i, f }) => {
  const p = PRODUCTS[i];
  const geos = useMemo(() => buildTubes(PATHS[p.k]), [p.k]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: p.c, metalness: 0.25, roughness: 0.28, emissive: new THREE.Color(p.c), emissiveIntensity: 0.12 }), [p.c]);
  const prog = interpolate(f, [14 + i * 5, 50 + i * 5], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  for (const g of geos) {
    const count = g.index ? g.index.count : 0;
    g.setDrawRange(0, Math.floor((count * prog) / 6) * 6);
  }
  const [x, , z] = prodPos(i);
  const bob = Math.sin(f / 28 + i) * 0.04;
  return (
    <group position={[x, 0, z]} rotation={[0, theta(i), 0]}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.95, 1.02, 1, 48]} />
        <meshStandardMaterial color="#f7f8fa" roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.97, 0]}>
        <cylinderGeometry args={[0.96, 0.96, 0.07, 48, 1, true]} />
        <meshStandardMaterial color={NAVY} roughness={0.4} />
      </mesh>
      <group position={[0, ICON_Y + bob, 0]} rotation={[0, Math.sin(f / 45 + i) * 0.18, 0]} scale={0.88}>
        {geos.map((g, k) => (
          <mesh key={k} geometry={g} material={mat} castShadow />
        ))}
      </group>
    </group>
  );
};

const Totem: React.FC<{ f: number; tex: THREE.Texture }> = ({ f, tex }) => {
  const sway = Math.sin(f / 60) * 0.12 * interpolate(f, [26 * S_FPS, 26 * S_FPS + 20], [1, 0], clamp);
  return (
    <group>
      <mesh position={[0, 0.65, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.15, 1.3, 1.3, 64]} />
        <meshStandardMaterial color="#f7f8fa" roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.31, 0]}>
        <cylinderGeometry args={[1.16, 1.16, 0.08, 64]} />
        <meshStandardMaterial color={RED} roughness={0.35} />
      </mesh>
      <group position={[0, 2.95, 0]} rotation={[0, sway, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[1.55, 1.55, 0.24, 96]} />
          <meshStandardMaterial color={NAVY} metalness={0.4} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0, 0.122]}>
          <circleGeometry args={[1.48, 96]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, -0.122]} rotation={[0, Math.PI, 0]}>
          <circleGeometry args={[1.48, 96]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
        <mesh>
          <torusGeometry args={[1.56, 0.05, 16, 120]} />
          <meshStandardMaterial color={RED} metalness={0.5} roughness={0.25} />
        </mesh>
      </group>
    </group>
  );
};

const Hall: React.FC = () => (
  <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[60, 96]} />
      <meshStandardMaterial color="#e4e9f0" roughness={0.9} />
    </mesh>
    {[2.2, R - 1.35, R + 1.35, 11].map((r, k) => (
      <mesh key={k} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <ringGeometry args={[r - 0.03, r + 0.03, 128]} />
        <meshBasicMaterial color={k % 2 ? RED : NAVY} transparent opacity={0.35} />
      </mesh>
    ))}
    {Array.from({ length: 24 }, (_, k) => {
      const a = (k / 24) * Math.PI * 2;
      return (
        <mesh key={k} position={[17 * Math.sin(a), 5, 17 * Math.cos(a)]} castShadow receiveShadow>
          <cylinderGeometry args={[0.45, 0.45, 10, 24]} />
          <meshStandardMaterial color="#f4f6f9" roughness={0.6} />
        </mesh>
      );
    })}
  </group>
);

const CameraRig: React.FC<{ f: number }> = ({ f }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const sh = SHOTS[shotIndex(f)];
  const t = interpolate(f / S_FPS, [sh.start, sh.start + sh.dur], [0, 1], clamp);
  const c = sh.cam((sh.ease ?? inOut)(t));
  camera.up.set(...(c.upv ?? [0, 1, 0]));
  camera.position.set(...c.pos);
  camera.lookAt(...c.look);
  if (c.roll) camera.rotateZ(c.roll);
  camera.fov = c.fov;
  camera.near = 0.05;
  camera.far = 200;
  camera.updateProjectionMatrix();
  return null;
};

const Scene: React.FC<{ tex: THREE.Texture }> = ({ tex }) => {
  const f = useCurrentFrame();
  return (
    <>
      <color attach="background" args={["#dde4ee"]} />
      <fog attach="fog" args={["#dde4ee", 20, 55]} />
      <hemisphereLight args={["#ffffff", "#b9c4d4", 1.1]} />
      <directionalLight
        position={[9, 16, 7]}
        intensity={2.4}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-8, 6, -10]} intensity={0.7} color="#ffe2c4" />
      <CameraRig f={f} />
      <Hall />
      <Totem f={f} tex={tex} />
      {PRODUCTS.map((_, i) => (
        <ProductModel key={i} i={i} f={f} />
      ))}
    </>
  );
};

// ── 2D 疊字 ──
const Hud: React.FC = () => {
  const f = useCurrentFrame();
  const k = shotIndex(f);
  const sh = SHOTS[k];
  const t = interpolate(f / S_FPS, [sh.start, sh.start + sh.dur], [0, 1], clamp);
  const c = sh.cam(inOut(t));
  const local = f - Math.round(sh.start * S_FPS);
  const o = interpolate(local, [0, 4], [0, 1], clamp);
  const corner = (pos: React.CSSProperties, bt: string, bl: string): React.CSSProperties => ({ position: "absolute", width: 34, height: 34, borderTop: bt, borderLeft: bl, ...pos });
  const line = `2px solid rgba(29,40,70,.55)`;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={corner({ left: 44, top: 44 }, line, line)} />
      <div style={{ ...corner({ right: 44, top: 44 }, line, "none"), borderRight: line }} />
      <div style={{ ...corner({ left: 44, bottom: 44 }, "none", line), borderBottom: line }} />
      <div style={{ ...corner({ right: 44, bottom: 44 }, "none", "none"), borderRight: line, borderBottom: line }} />
      <div style={{ position: "absolute", left: 92, top: 62, fontFamily: MONO, fontSize: 22, letterSpacing: 3, color: NAVY, opacity: o, display: "flex", gap: 18, alignItems: "center" }}>
        <span style={{ width: 12, height: 12, borderRadius: 6, background: RED, opacity: 0.5 + 0.5 * Math.abs(Math.sin(f / 8)) }} />
        <span style={{ fontWeight: 500 }}>{String(k + 1).padStart(2, "0")}</span>
        <span>{sh.size}</span>
        <span style={{ opacity: 0.55 }}>{sh.move}</span>
      </div>
      <div style={{ position: "absolute", right: 92, top: 62, fontFamily: MONO, fontSize: 22, letterSpacing: 3, color: NAVY, opacity: 0.7 }}>
        {Math.round(focal(c.fov))} mm · f/2.8
      </div>
    </AbsoluteFill>
  );
};

const Reveal: React.FC<{ at: number; children: React.ReactNode; dy?: number }> = ({ at, children, dy = 40 }) => {
  const f = useCurrentFrame() - at;
  const k = spring({ frame: f, fps: S_FPS, config: { damping: 18, stiffness: 170 } });
  return <div style={{ opacity: f < 0 ? 0 : k, transform: `translateY(${(1 - k) * dy}px)`, clipPath: `inset(0 0 ${(1 - k) * 100}% 0)` }}>{children}</div>;
};

const Headline: React.FC<{ text: string; size: number; color?: string; weight?: number; track?: number }> = ({ text, size, color = NAVY, weight = 800, track = 0.02 }) => (
  <div style={{ fontFamily: SANS, fontWeight: weight, fontSize: size, letterSpacing: `${track}em`, color, lineHeight: 1.05, whiteSpace: "nowrap", textShadow: "0 2px 18px rgba(255,255,255,.55)" }}>{text}</div>
);

const Overlays: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / S_FPS;
  const fr = (s: number) => Math.round(s * S_FPS);
  const inRange = (a: number, b: number) => t >= a && t < b;
  const pIdx = Math.floor(t - 7);
  // 文字底下的淺色襯底：有字時淡入
  const scrim = (a: number, b: number) => interpolate(t, [a, a + 0.25, b - 0.25, b], [0, 1, 1, 0], clamp);
  const sL = Math.max(scrim(3, 5), scrim(7, 17), scrim(21, 26));
  const sR = scrim(5, 7);
  const sB = Math.max(scrim(0.3, 3), scrim(18, 21));
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ opacity: sL, background: "radial-gradient(ellipse 60% 55% at 12% 92%, rgba(236,241,247,.92) 0%, rgba(236,241,247,.6) 45%, rgba(236,241,247,0) 75%)" }} />
      <AbsoluteFill style={{ opacity: sR, background: "radial-gradient(ellipse 55% 55% at 88% 92%, rgba(236,241,247,.92) 0%, rgba(236,241,247,.6) 45%, rgba(236,241,247,0) 75%)" }} />
      <AbsoluteFill style={{ opacity: sB, background: "linear-gradient(0deg, rgba(236,241,247,.85) 0%, rgba(236,241,247,0) 30%, rgba(236,241,247,0) 70%, rgba(236,241,247,.85) 100%)" }} />
      {inRange(0.4, 3) && (
        <div style={{ position: "absolute", bottom: 150, width: "100%", textAlign: "center" }}>
          <Reveal at={fr(0.4)}><Headline text="ZOFRI · IQUIQUE · CHILE" size={40} weight={600} track={0.4} /></Reveal>
        </div>
      )}
      {inRange(3, 5) && (
        <div style={{ position: "absolute", left: 140, bottom: 150, display: "grid", gap: 6 }}>
          <Reveal at={fr(3.1)}><Headline text="TODO LO QUE BUSCA," size={84} weight={500} /></Reveal>
          <Reveal at={fr(3.5)}><Headline text="EN UN SOLO LUGAR." size={96} /></Reveal>
        </div>
      )}
      {inRange(5, 7) && (
        <div style={{ position: "absolute", right: 140, bottom: 150, textAlign: "right" }}>
          <Reveal at={fr(5.3)}><Headline text="ASATEX" size={150} weight={900} track={0.08} /></Reveal>
          <Reveal at={fr(5.6)}><Headline text="ASAHI LTDA" size={36} weight={600} color={RED} track={0.5} /></Reveal>
        </div>
      )}
      {pIdx >= 0 && pIdx < 10 && (
        <div key={pIdx} style={{ position: "absolute", left: 140, bottom: 140, display: "grid", gap: 4 }}>
          <Reveal at={fr(7 + pIdx)} dy={24}><div style={{ fontFamily: MONO, fontSize: 26, letterSpacing: 6, color: RED }}>{String(pIdx + 1).padStart(2, "0")} / 10</div></Reveal>
          <Reveal at={fr(7 + pIdx) + 2}><Headline text={PRODUCTS[pIdx].w} size={PRODUCTS[pIdx].w.length > 10 ? 104 : 132} weight={900} /></Reveal>
          {PRODUCTS[pIdx].sub ? <Reveal at={fr(7 + pIdx) + 5} dy={20}><Headline text={PRODUCTS[pIdx].sub!} size={38} weight={600} color={RED} track={0.25} /></Reveal> : null}
        </div>
      )}
      {inRange(18, 21) && (
        <div style={{ position: "absolute", width: "100%", bottom: 150, textAlign: "center" }}>
          <Reveal at={fr(18)}><Headline text="Y MUCHO MÁS." size={110} weight={900} /></Reveal>
        </div>
      )}
      {inRange(21, 26) && (
        <div style={{ position: "absolute", left: 140, bottom: 140, display: "grid", gap: 10 }}>
          <Reveal at={fr(21.2)}><Headline text="LO QUE USTED NECESITE," size={70} weight={500} /></Reveal>
          <Reveal at={fr(22.3)}><Headline text="LO ENCONTRAMOS." size={104} weight={900} /></Reveal>
          <Reveal at={fr(23.7)} dy={20}>
            <div style={{ display: "flex", gap: 18, alignItems: "center", marginTop: 8 }}>
              <span style={{ background: RED, color: "#fff", fontFamily: SANS, fontWeight: 800, fontSize: 36, padding: "10px 22px", letterSpacing: "0.08em" }}>PROVEEDORES DE CALIDAD</span>
              <span style={{ background: NAVY, color: "#fff", fontFamily: SANS, fontWeight: 800, fontSize: 36, padding: "10px 22px", letterSpacing: "0.08em" }}>AL MEJOR PRECIO</span>
            </div>
          </Reveal>
        </div>
      )}
      {t >= 26 && <EndCard />}
    </AbsoluteFill>
  );
};

const WhatsApp: React.FC = () => (
  <svg width="46" height="46" viewBox="0 0 48 48" aria-hidden>
    <path d="M24 4C13 4 4 12.8 4 23.7c0 3.6 1 7 2.8 9.9L4 44l10.8-2.8c2.8 1.5 6 2.3 9.2 2.3 11 0 20-8.8 20-19.8S35 4 24 4z" fill="#25d366" />
    <path d="M17.5 13.8c-.5-1.1-1-1.1-1.5-1.1h-1.3c-.4 0-1.2.2-1.8.8-.6.6-2.3 2.2-2.3 5.4s2.4 6.3 2.7 6.7c.3.4 4.6 7.2 11.3 9.9 5.6 2.2 6.7 1.8 7.9 1.7 1.2-.1 3.9-1.6 4.5-3.1.6-1.5.6-2.8.4-3.1-.2-.3-.6-.4-1.3-.8-.7-.3-3.9-1.9-4.5-2.1-.6-.2-1-.3-1.5.3-.4.7-1.7 2.1-2.1 2.6-.4.4-.8.5-1.4.2-.7-.3-2.8-1-5.3-3.3-2-1.7-3.3-3.9-3.7-4.5-.4-.7 0-1 .3-1.4.3-.3.7-.8 1-1.2.3-.4.4-.7.7-1.2.2-.4.1-.9 0-1.2-.2-.4-1.4-3.6-2-4.9z" fill="#fff" />
  </svg>
);

const EndCard: React.FC = () => {
  const f = useCurrentFrame() - 26 * S_FPS;
  const bg = interpolate(f, [0, 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 420, background: `linear-gradient(180deg, rgba(221,228,238,0) 0%, rgba(221,228,238,${0.92 * bg}) 38%)` }} />
      <div style={{ position: "absolute", bottom: 120, width: "100%", display: "grid", justifyItems: "center", gap: 14 }}>
        <Reveal at={26 * S_FPS + 6}><Headline text="¡VISÍTENOS!" size={120} weight={900} /></Reveal>
        <Reveal at={26 * S_FPS + 12} dy={20}><Headline text="ZOFRI · IQUIQUE · CHILE" size={40} weight={600} color={RED} track={0.35} /></Reveal>
        <Reveal at={26 * S_FPS + 18} dy={20}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, background: NAVY, padding: "12px 30px", borderRadius: 999, boxShadow: "0 10px 30px rgba(29,40,70,.25)" }}>
            <WhatsApp />
            <span style={{ fontFamily: MONO, fontSize: 46, letterSpacing: 2, color: "#fff" }}>+56 9 9442 7681</span>
          </div>
        </Reveal>
      </div>
    </AbsoluteFill>
  );
};

// 每次換鏡頭的極短白閃，強調剪接點
const CutFlash: React.FC = () => {
  const f = useCurrentFrame();
  const sh = SHOTS[shotIndex(f)];
  const local = f - Math.round(sh.start * S_FPS);
  const o = sh.start > 0 && local < 3 ? (3 - local) * 0.12 : 0;
  return <AbsoluteFill style={{ background: "#fff", opacity: o }} />;
};

export const Showroom: React.FC = () => {
  const tex = useLogoTexture();
  return (
  <AbsoluteFill style={{ background: "#dde4ee" }}>
    {tex ? (
      <ThreeCanvas width={1920} height={1080} shadows gl={{ antialias: true }} camera={{ fov: 40, position: [0, 20, 20] }}>
        <Scene tex={tex} />
      </ThreeCanvas>
    ) : null}
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 60%, rgba(20,30,50,.22) 100%)", pointerEvents: "none" }} />
    <Overlays />
    {SHOW_HUD ? <Hud /> : null}
    <CutFlash />
    <Audio src={staticFile("showroom/mix.wav")} />
  </AbsoluteFill>
  );
};
