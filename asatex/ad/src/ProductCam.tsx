// 5 秒 3D 商品運鏡測試（9:16）：暗色攝影棚、反光地板，兩款絲襪商品照立成 V 字展示板（CK2603L 鑽石亮片／CK4603LY 螢光）。
// 運鏡：從右下方低角度出發 → 往左前上方推近 → 停在鑽石亮片款特寫，亮片閃光＋型號字卡。聚光燈同時從右掃到左。
import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, Easing, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

export const PC3_FPS = 30;
export const PC3_DUR = 150;
const W = 1080, H = 1920;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.inOut(Easing.cubic);
type V3 = [number, number, number];

// crop＝[左, 上, 寬, 高]（0–1，圖片座標，上方為 0）
// 在 ThreeCanvas 外面載入：Image → canvas 裁切 → CanvasTexture（Showroom 驗證過；在畫布裡用 TextureLoader 貼不上去）
const useTex = (url: string, crop: [number, number, number, number] = [0, 0, 1, 1]) => {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const [handle] = useState(() => delayRender("tex " + url));
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const sx = img.width * crop[0], sy = img.height * crop[1], sw = img.width * crop[2], sh = img.height * crop[3];
      const c = document.createElement("canvas");
      c.width = Math.round(sw); c.height = Math.round(sh);
      c.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      setTex(t);
      continueRender(handle);
    };
    img.onerror = () => continueRender(handle);
    img.src = staticFile(url);
  }, [handle, url]); // eslint-disable-line react-hooks/exhaustive-deps
  return tex;
};

const Panel: React.FC<{ tex: THREE.Texture | null; pos: V3; ry: number; w: number; h: number }> = ({ tex, pos, ry, w, h }) => (
  <group position={pos} rotation={[0, ry, 0]}>
    <mesh castShadow position={[0, h / 2 + 0.12, 0]}>
      <boxGeometry args={[w + 0.06, h + 0.06, 0.05]} />
      <meshStandardMaterial color="#e9e4dc" roughness={0.6} />
    </mesh>
    {/* 圖載入後才建材質（key 換掉＝重新編譯 shader，否則 map 從空變有貼不上去）*/}
    {tex && (
      <mesh key={tex.uuid} position={[0, h / 2 + 0.12, 0.03]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex} roughness={0.45} metalness={0.05} />
      </mesh>
    )}
    <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
      <boxGeometry args={[w * 0.7, 0.12, 0.5]} />
      <meshStandardMaterial color="#1c1a22" roughness={0.3} metalness={0.6} />
    </mesh>
  </group>
);

// 運鏡關鍵格：[秒, 相機位置, 看向]
const CAM: [number, V3, V3][] = [
  [0, [2.6, 0.35, 3.6], [0.2, 1.1, 0]], // 右下方低角度、看整組
  [3.4, [-0.1, 2.0, 2.0], [-0.95, 1.4, 0.05]], // 左前上方，推近到鑽石亮片款
  [5, [-0.25, 2.05, 1.75], [-0.98, 1.4, 0.05]], // 停住、再微推
];
const lerp3 = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const camAt = (t: number) => {
  const i = t < CAM[1][0] ? 0 : 1;
  const [ta, pa, la] = CAM[i], [tb, pb, lb] = CAM[i + 1];
  const k = interpolate(t, [ta, tb], [0, 1], { ...clamp, easing: ease });
  return { pos: lerp3(pa, pb, k), look: lerp3(la, lb, k) };
};

const Rig: React.FC<{ t: number }> = ({ t }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const c = camAt(t);
  camera.position.set(...c.pos);
  camera.lookAt(...c.look);
  camera.fov = 38;
  camera.near = 0.05;
  camera.far = 60;
  camera.updateProjectionMatrix();
  return null;
};

// 鑽石亮片閃光：貼在鑽石款展示板前面的小星點，各自錯開閃
const Glints: React.FC<{ f: number }> = ({ f }) => {
  const pts: V3[] = [[-1.18, 1.95, 0.42], [-1.02, 1.62, 0.36], [-0.86, 1.3, 0.3], [-1.12, 1.18, 0.4], [-0.95, 2.1, 0.34], [-0.8, 1.72, 0.3]];
  return (
    <>
      {pts.map((p, i) => {
        const on = Math.max(0, Math.sin((f - 60 - i * 9) / 7)) * interpolate(f, [70, 90], [0, 1], clamp);
        return (
          <mesh key={i} position={p} scale={0.02 + 0.05 * on} rotation={[0, 0, f * 0.05 + i]}>
            <octahedronGeometry args={[1, 0]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={on} />
          </mesh>
        );
      })}
    </>
  );
};

const Scene: React.FC<{ f: number; diamond: THREE.Texture | null; lumin: THREE.Texture | null }> = ({ f, diamond, lumin }) => {
  const t = f / PC3_FPS;
  const sweep = interpolate(t, [0, 5], [2.4, -2.2]); // 聚光燈從右掃到左
  return (
    <>
      <Rig t={t} />
      <color attach="background" args={["#0c0a12"]} />
      <fog attach="fog" args={["#0c0a12", 7, 16]} />
      <ambientLight intensity={0.5} />
      <spotLight position={[sweep, 5, 3]} target-position={[-0.4, 1.2, 0]} angle={0.42} penumbra={0.7} intensity={2.2} decay={0} castShadow color="#fff3e0" />
      <pointLight position={[-2.5, 2.5, 2]} intensity={0.5} decay={0} color="#ff6aa8" />
      <pointLight position={[2.5, 2, 1.5]} intensity={0.5} decay={0} color="#5ab8ff" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#141018" roughness={0.25} metalness={0.4} />
      </mesh>
      <Panel tex={diamond} pos={[-0.95, 0, 0]} ry={0.38} w={1.3} h={1.95} />
      <Panel tex={lumin} pos={[0.95, 0, -0.15]} ry={-0.38} w={1.3} h={1.62} />
      <Glints f={f} />
    </>
  );
};

export const ProductCam: React.FC = () => {
  const f = useCurrentFrame();
  const diamond = useTex("fiesta/ck2603l.webp", [0, 0, 1, 0.66]); // 上 2/3：腿＋型號＋鑽石亮片標
  const lumin = useTex("fiesta/ck4603ly.webp", [0, 0, 0.5, 0.62]); // 左邊包裝，不含批發價
  const tag = interpolate(f, [100, 118], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ background: "#0c0a12" }}>
      <ThreeCanvas width={W} height={H} shadows gl={{ antialias: true }} camera={{ fov: 38, position: [2.6, 0.35, 3.6] }}>
        <Scene f={f} diamond={diamond} lumin={lumin} />
      </ThreeCanvas>
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 220, opacity: tag }}>
        <div style={{ transform: `translateY(${(1 - tag) * 30}px)`, fontFamily: "Montserrat, Helvetica Neue, Arial, sans-serif", textAlign: "center", color: "#fff" }}>
          <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: "0.25em", color: "#ffd84d" }}>CK2603L</div>
          <div style={{ fontSize: 72, fontWeight: 900, textShadow: "0 4px 24px rgba(0,0,0,.6)" }}>Brillos de diamante</div>
        </div>
      </AbsoluteFill>
      <Audio src={staticFile("sfx/whoosh.wav")} volume={0.4} />
      <Sequence from={70}><Audio src={staticFile("sfx/sparkle.wav")} volume={0.45} /></Sequence>
      <Sequence from={100}><Audio src={staticFile("sfx/sparkle.wav")} volume={0.3} /></Sequence>
    </AbsoluteFill>
  );
};
