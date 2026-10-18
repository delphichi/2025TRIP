// 健身 Shorts 樣張（3D 簡化人體，可做成動畫）：灰色人體躺在地墊上做捲腹，腹直肌（8 塊）發紅光。
// frame 0–60：上身從平躺抬起到 35°，鏡頭從側面繞到斜前方；腹肌亮度跟著用力程度變化。
import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

export const A3_DUR = 90;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.inOut(Easing.cubic);
const GRAY = "#8f949c";
const mat = <meshStandardMaterial color={GRAY} roughness={0.55} metalness={0.05} />;

const Limb: React.FC<{ from: [number, number, number]; to: [number, number, number]; r: number }> = ({ from, to, r }) => {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return <mesh position={mid} quaternion={q} castShadow><capsuleGeometry args={[r, len, 8, 16]} />{mat}</mesh>;
};

const Rig: React.FC<{ f: number }> = ({ f }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const k = interpolate(f, [0, 70], [0, 1], { ...clamp, easing: ease });
  const az = (95 - 55 * k) * (Math.PI / 180);
  camera.position.set(-0.05 + Math.sin(az) * 3.4, 1.0 + 0.35 * k, Math.cos(az) * 3.4);
  camera.lookAt(-0.05, 0.22, 0);
  camera.fov = 38; camera.updateProjectionMatrix();
  return null;
};

export const Abs3D: React.FC = () => {
  const f = useCurrentFrame();
  const lift = interpolate(f, [8, 50], [0, 1], { ...clamp, easing: ease }); // 用力程度
  const ang = (35 * lift * Math.PI) / 180; // 上身抬起角度
  const glow = 0.25 + 0.75 * lift;
  // 骨盆在原點，身體沿 -x 方向躺；上身繞骨盆（z 軸）往上轉（見下方 group rotation）
  return (
    <AbsoluteFill style={{ background: "#16181c" }}>
      <ThreeCanvas width={1080} height={1920} shadows gl={{ antialias: true }} camera={{ fov: 38, position: [2.6, 1, 0] }}>
        <Rig f={f} />
        <color attach="background" args={["#16181c"]} />
        <hemisphereLight args={["#ffffff", "#2a2d33", 0.9]} />
        <directionalLight position={[2, 4, 3]} intensity={1.6} castShadow />
        <directionalLight position={[-3, 2, -2]} intensity={0.6} color="#7fb8ff" />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[12, 12]} /><meshStandardMaterial color="#202328" roughness={0.9} /></mesh>
        <mesh position={[-0.15, 0.005, 0]} receiveShadow><boxGeometry args={[1.9, 0.01, 0.62]} /><meshStandardMaterial color="#2e6f8f" roughness={0.8} /></mesh>
        {/* 骨盆＋腿（膝蓋彎、腳踩地）*/}
        <mesh position={[0, 0.12, 0]} castShadow><sphereGeometry args={[0.15, 24, 24]} />{mat}</mesh>
        {[-1, 1].map((sd) => (
          <group key={sd}>
            <Limb from={[0.02, 0.12, sd * 0.09]} to={[0.38, 0.42, sd * 0.1]} r={0.065} />
            <Limb from={[0.38, 0.42, sd * 0.1]} to={[0.62, 0.06, sd * 0.1]} r={0.05} />
            <mesh position={[0.68, 0.035, sd * 0.1]} castShadow><boxGeometry args={[0.2, 0.07, 0.09]} />{mat}</mesh>
          </group>
        ))}
        {/* 上身（繞骨盆抬起）*/}
        <group position={[0, 0.12, 0]} rotation={[0, 0, -ang]}>
          <mesh position={[-0.3, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><capsuleGeometry args={[0.15, 0.42, 8, 16]} />{mat}</mesh>
          {/* 腹直肌 8 塊：貼在上身朝上（+y）那一面 */}
          {[0, 1, 2, 3].map((i) => [-1, 1].map((sd) => (
            <mesh key={`${i}${sd}`} position={[-0.08 - i * 0.075, 0.148, sd * 0.045]}>
              <boxGeometry args={[0.065, 0.02, 0.075]} />
              <meshStandardMaterial color="#e3262d" emissive="#ff2a2a" emissiveIntensity={glow} roughness={0.4} />
            </mesh>
          )))}
          <mesh position={[-0.68, 0.02, 0]} castShadow><sphereGeometry args={[0.11, 24, 24]} />{mat}</mesh>
          {/* 手抱頭 */}
          {[-1, 1].map((sd) => (
            <group key={sd}>
              <Limb from={[-0.5, 0.05, sd * 0.17]} to={[-0.62, 0.22, sd * 0.2]} r={0.04} />
              <Limb from={[-0.62, 0.22, sd * 0.2]} to={[-0.74, 0.08, sd * 0.09]} r={0.035} />
            </group>
          ))}
        </group>
      </ThreeCanvas>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 140, fontFamily: "Montserrat, Helvetica Neue, Arial, sans-serif", color: "#fff", textAlign: "center" }}>
        <div style={{ fontSize: 92, fontWeight: 900, color: "#35d0ff" }}>CRUNCH</div>
        <div style={{ fontSize: 36, fontWeight: 600, color: "#9aa0aa" }}>捲腹（樣張：3D 簡化人體）</div>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 220, fontFamily: "Montserrat, Helvetica Neue, Arial, sans-serif" }}>
        <div style={{ fontSize: 120, fontWeight: 900, color: "#fff" }}>{Math.min(15, 1 + Math.floor(f / 6))} / 15</div>
        <div style={{ fontSize: 44, fontWeight: 800, color: lift > 0.5 ? "#35d0ff" : "#9aa0aa" }}>{lift > 0.5 ? "EXHALA · 吐氣" : "INHALA · 吸氣"}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
