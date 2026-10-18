// 5 秒 3D 運鏡測試（9:16）：程式建模的 3D 女主角（時裝人台／公仔感）穿 CK2603L 鑽石亮片網襪。
// 腿＝膚色旋轉體＋外層菱形網格貼圖（程式畫的透明 canvas）＋網格交點上輪流閃光的水鑽。
// 運鏡：從右下方低角度出發 → 繞著她往左前上方移動並推近 → 停在腿部特寫＋型號字卡。
import React, { useMemo } from "react";
import { AbsoluteFill, Audio, Easing, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

export const M3_FPS = 30;
export const M3_DUR = 150;
const W = 1080, H = 1920;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.inOut(Easing.cubic);

// 菱形網格貼圖：透明底＋黑色斜線＋交點小白點（水鑽）
const makeFishnet = () => {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(14,10,12,0.95)";
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(256, 256);
  g.moveTo(256, 0); g.lineTo(0, 256);
  g.moveTo(-128, 128); g.lineTo(128, 384); g.moveTo(128, -128); g.lineTo(384, 128);
  g.moveTo(128, -128); g.lineTo(-128, 128); g.moveTo(384, 128); g.lineTo(128, 384);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(14, 26);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

// 腿的輪廓（半徑, 高度）由腳踝到大腿根
const LEG: [number, number][] = [[0.001, 0.06], [0.034, 0.07], [0.04, 0.12], [0.05, 0.24], [0.066, 0.36], [0.06, 0.46], [0.052, 0.53], [0.066, 0.64], [0.084, 0.76], [0.092, 0.84], [0.09, 0.88], [0.001, 0.89]]; // 大腿頂端停在 0.89，整截藏在裙子裡（裙襬 0.8）;
const legGeo = (grow = 0) => new THREE.LatheGeometry(LEG.map(([r, y]) => new THREE.Vector2(r > 0.002 ? r + grow : r, y)), 48);

const SKIN = "#e8b896";
const Leg: React.FC<{ x: number; rz: number; net: THREE.Texture }> = ({ x, rz, net }) => {
  const base = useMemo(() => legGeo(0), []), mesh = useMemo(() => legGeo(0.0025), []);
  return (
    <group position={[x, 0, 0]} rotation={[0, 0, rz]}>
      <mesh geometry={base} castShadow><meshStandardMaterial color={SKIN} roughness={0.55} /></mesh>
      <mesh geometry={mesh}><meshStandardMaterial map={net} transparent alphaTest={0.3} roughness={0.35} metalness={0.2} side={THREE.DoubleSide} /></mesh>
      {/* 高跟鞋 */}
      <mesh position={[0, 0.035, 0.035]} castShadow><boxGeometry args={[0.075, 0.05, 0.16]} /><meshStandardMaterial color="#0b0b0e" roughness={0.15} metalness={0.5} /></mesh>
      <mesh position={[0, 0.03, -0.05]}><cylinderGeometry args={[0.008, 0.012, 0.07, 10]} /><meshStandardMaterial color="#0b0b0e" metalness={0.6} roughness={0.2} /></mesh>
    </group>
  );
};

// 水鑽：沿著兩條腿表面分布，各自錯開閃光
const Rhinestones: React.FC<{ f: number }> = ({ f }) => {
  const pts = useMemo(() => {
    const out: [number, number, number][] = [];
    let s = 7;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 70; i++) {
      // 只放在朝外、朝前的那半圈（不會跑到兩腿中間），並跟著腿的傾斜（Leg 的 rz）
      const y = 0.14 + rnd() * 0.64, side = rnd() > 0.5 ? 1 : -1, a = side * (rnd() * 1.6 - 0.5);
      let r = 0.05; for (let k = 0; k < LEG.length - 1; k++) if (y >= LEG[k][1] && y < LEG[k + 1][1]) r = LEG[k][0] + (LEG[k + 1][0] - LEG[k][0]) * ((y - LEG[k][1]) / (LEG[k + 1][1] - LEG[k][1]));
      const rz = side < 0 ? 0.015 : -0.025;
      const lx = Math.sin(a) * (r + 0.004), ly = y;
      out.push([side * 0.075 + lx * Math.cos(rz) - ly * Math.sin(rz), lx * Math.sin(rz) + ly * Math.cos(rz), Math.cos(a) * (r + 0.004)]);
    }
    return out;
  }, []);
  return (
    <>
      {pts.map((p, i) => {
        const tw = Math.max(0, Math.sin(f / 5 + i * 1.7));
        return (
          <mesh key={i} position={p} scale={0.0045 + 0.007 * tw ** 3} rotation={[f * 0.1, i, 0]}>
            <octahedronGeometry args={[1, 0]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        );
      })}
    </>
  );
};

const Woman: React.FC<{ f: number; net: THREE.Texture }> = ({ f, net }) => {
  const dress = useMemo(() => new THREE.LatheGeometry([[0.001, 0.8], [0.24, 0.8], [0.228, 0.9], [0.2, 0.98], [0.13, 1.08], [0.13, 1.2], [0.145, 1.3], [0.11, 1.38], [0.001, 1.39]].map(([r, y]) => new THREE.Vector2(r, y)), 48), []);
  return (
    <group>
      <Leg x={-0.075} rz={0.015} net={net} />
      <Leg x={0.075} rz={-0.025} net={net} />
      <Rhinestones f={f} />
      <mesh geometry={dress} castShadow><meshStandardMaterial color="#141218" roughness={0.25} metalness={0.55} /></mesh>
      {/* 手臂 */}
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[sd * 0.25, 1.1, 0.01]} rotation={[0, 0, sd * 0.2]} castShadow>
          <capsuleGeometry args={[0.03, 0.42, 6, 16]} /><meshStandardMaterial color={SKIN} roughness={0.55} />
        </mesh>
      ))}
      {/* 脖子、頭、鮑伯頭 */}
      <mesh position={[0, 1.42, 0]}><cylinderGeometry args={[0.035, 0.04, 0.08, 16]} /><meshStandardMaterial color={SKIN} roughness={0.55} /></mesh>
      <mesh position={[0, 1.55, 0]} castShadow><sphereGeometry args={[0.105, 32, 32]} /><meshStandardMaterial color={SKIN} roughness={0.5} /></mesh>
      <mesh position={[0, 1.57, -0.012]} scale={[1.12, 1.08, 1.1]}><sphereGeometry args={[0.105, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.55]} /><meshStandardMaterial color="#3d2418" roughness={0.45} /></mesh>
      <mesh position={[0, 1.5, -0.02]}><cylinderGeometry args={[0.122, 0.13, 0.16, 32, 1, true, Math.PI * 0.3, Math.PI * 1.4]} /><meshStandardMaterial color="#3d2418" roughness={0.45} side={THREE.DoubleSide} /></mesh>
      {[-1, 1].map((sd) => <mesh key={sd} position={[sd * 0.035, 1.56, 0.096]}><sphereGeometry args={[0.012, 12, 12]} /><meshStandardMaterial color="#1a1010" /></mesh>)}
      <mesh position={[0, 1.515, 0.1]} rotation={[0, 0, 0]}><capsuleGeometry args={[0.008, 0.022, 4, 8]} /><meshStandardMaterial color="#c0394a" /></mesh>
    </group>
  );
};

// 運鏡：繞著她（方位角）從右前方 50° 轉到左前方 -32°，距離 3.0 → 1.15，高度 0.25 → 1.15，看的點從臀部降到膝蓋上方
const camAt = (t: number) => {
  const k = interpolate(t, [0, 4.2], [0, 1], { ...clamp, easing: ease });
  const az = (50 + (-32 - 50) * k) * (Math.PI / 180);
  const r = 3.0 + (1.15 - 3.0) * k, h = 0.25 + (1.15 - 0.25) * k;
  const drift = interpolate(t, [4.2, 5], [0, 0.08], clamp); // 停下後再微推
  const lookY = 0.95 + (0.62 - 0.95) * k;
  return { pos: [Math.sin(az) * (r - drift), h, Math.cos(az) * (r - drift)] as const, look: [0, lookY, 0] as const };
};
const Rig: React.FC<{ t: number }> = ({ t }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const c = camAt(t);
  camera.position.set(...c.pos);
  camera.lookAt(...c.look);
  camera.fov = 36; camera.near = 0.02; camera.far = 40;
  camera.updateProjectionMatrix();
  return null;
};

export const Mannequin3D: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / M3_FPS;
  const net = useMemo(makeFishnet, []);
  const tag = interpolate(f, [104, 122], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ background: "#0d0b12" }}>
      <ThreeCanvas width={W} height={H} shadows gl={{ antialias: true }} camera={{ fov: 36, position: [2, 0.3, 2] }}>
        <Rig t={t} />
        <color attach="background" args={["#0d0b12"]} />
        <fog attach="fog" args={["#0d0b12", 4, 10]} />
        <hemisphereLight args={["#ffffff", "#30283a", 0.6]} />
        <spotLight position={[-1.6, 3.2, 2.4]} angle={0.5} penumbra={0.8} intensity={3.2} decay={0} castShadow color="#fff2e6" />
        <directionalLight position={[2.5, 1.8, -2]} intensity={1.6} color="#7fb8ff" />
        <pointLight position={[-2, 0.3, -2.2]} intensity={0.6} decay={0} color="#ff6aa8" />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[6, 64]} />
          <meshStandardMaterial color="#17131c" roughness={0.3} metalness={0.4} />
        </mesh>
        <Woman f={f} net={net} />
      </ThreeCanvas>
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 220, opacity: tag }}>
        <div style={{ transform: `translateY(${(1 - tag) * 30}px)`, fontFamily: "Montserrat, Helvetica Neue, Arial, sans-serif", textAlign: "center", color: "#fff" }}>
          <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: "0.25em", color: "#ffd84d" }}>ASATEX · CK2603L</div>
          <div style={{ fontSize: 72, fontWeight: 900, textShadow: "0 4px 24px rgba(0,0,0,.6)" }}>Brillos de diamante</div>
        </div>
      </AbsoluteFill>
      <Audio src={staticFile("sfx/whoosh.wav")} volume={0.4} />
      <Sequence from={80}><Audio src={staticFile("sfx/sparkle.wav")} volume={0.45} /></Sequence>
      <Sequence from={110}><Audio src={staticFile("sfx/sparkle.wav")} volume={0.3} /></Sequence>
    </AbsoluteFill>
  );
};
