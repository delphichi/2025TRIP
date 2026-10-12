// Panty de Red #CK2603L 分解說明廣告（像手機內部結構廣告）：9:16，31 秒，30 fps。
// 四個 3D 場景（主分解台、閃鑽、網格、纖維）＋第 8 格傳單照片運鏡（裝箱 3D 台保留未用），鏡頭在其間切換；標註線用 3D→螢幕投影對準真實位置。
// 聲音：scripts/score3.py → public/ck/mix.wav。分鏡來源：分鏡桌專案 ck2603l。
import React, { useMemo } from "react";
import { AbsoluteFill, Audio, Easing, Img, interpolate, random, spring, staticFile, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { loadFont } from "@remotion/fonts";
import sparkles from "../public/ck/sparkles.json";

loadFont({ family: "Montserrat", url: staticFile("showroom/Montserrat.ttf"), weight: "100 900" });
loadFont({ family: "Plex Mono", url: staticFile("showroom/PlexMono-Medium.ttf"), weight: "500" });

export const E_FPS = 30;
export const E_DUR = 930;
const W = 1080, H = 1920;
const GOLD = "#d9b26a";
const RED = "#b3141b";
const SANS = "Montserrat, Helvetica Neue, Arial, sans-serif";
const MONO = '"Plex Mono", ui-monospace, monospace';
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const fr = (s: number) => Math.round(s * E_FPS);
const deg = (d: number) => (d * Math.PI) / 180;

// 剪接表（秒），與 scripts/score3.py 相同
const T = { s2: 3.0, s3: 5.5, explode: 5.85, s4: 9.0, s5: 12.5, s6: 15.3, s7: 21.4, s8: 23.9, s9: 27.4 };
const COLORS = [
  { name: "NEGRO", c: "#151515" },
  { name: "ROJO", c: "#c0141c" },
  { name: "PIEL", c: "#c9976d" },
];

type V3 = [number, number, number];
const add = (...vs: V3[]): V3 => vs.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0] as V3);
const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// 場景位置
const MAIN: V3 = [0, 0, 0];
const GEM: V3 = [40, 0, 0];
const NET: V3 = [80, 0, 0];
const FIB: V3 = [120, 0, 0];
const PACK: V3 = [160, 0, 0];
const RC = 0.9, HC = 2.4, GAP = 3.0;

type Cam = { pos: V3; look: V3; fov: number; roll?: number; upv?: V3 };
const ease = Easing.inOut(Easing.cubic);
const local = (f: number, a: number, b: number) => ease(interpolate(f / E_FPS, [a, b], [0, 1], clamp));

const camAt = (f: number): Cam => {
  const t = f / E_FPS;
  if (t < T.s3) {
    const k = local(f, 0, T.s3);
    const a = deg(-70 + 100 * k);
    return { pos: [6.5 * Math.sin(a), 0.6, 6.5 * Math.cos(a)], look: [0, 0, 0], fov: 38 };
  }
  if (t < T.s4) {
    const k = local(f, T.s3, T.s4);
    // 往鏡頭右側看 1.2，讓分解圖落在畫面左半邊、右邊留給標註
    return { pos: mix([5.2, 0.2, 8.2], [6.4, -0.2, 10.6], k), look: [0.845 * 1.2, 0.15, -0.535 * 1.2], fov: 46 };
  }
  if (t < T.s5) {
    const k = local(f, T.s4, T.s5);
    const a = deg(60 + 50 * k), r = 2.7 - 0.8 * k;
    return { pos: add(GEM, [r * Math.cos(a), 0.55 - 0.15 * k, r * Math.sin(a)]), look: add(GEM, [0, 0.02, 0]), fov: 32 };
  }
  if (t < T.s6) {
    const k = local(f, T.s5, T.s6);
    const a = deg(-15 + 60 * k);
    return { pos: add(NET, [0, 7.5 - 3 * k, 0]), look: NET, fov: 42, upv: [Math.sin(a), 0, -Math.cos(a)] };
  }
  if (t < T.s7) {
    const k = interpolate(t, [T.s6, T.s7], [0, 1], clamp);
    const k1 = ease(interpolate(k, [0, 0.32], [0, 1], clamp));
    const k2 = ease(interpolate(k, [0.32, 0.55], [0, 1], clamp));
    const along = { pos: add(FIB, [-3.6 + 3.2 * k1, 0.18, 0.45]), look: add(FIB, [0.2 + 3 * k1, 0, 0]) };
    const side = { pos: add(FIB, [0.4, 0.9, 4.4]), look: add(FIB, [0.3, 0.35, 0]) };
    return { pos: mix(along.pos, side.pos, k2), look: mix(along.look, side.look, k2), fov: 36 };
  }
  if (t < T.s8) {
    const k = local(f, T.s7, T.s8);
    const a = deg(30 + 180 * k);
    return { pos: [9.5 * Math.sin(a), 1.2, 9.5 * Math.cos(a)], look: [0, -1.05, 0], fov: 38 };
  }
  const k = local(f, T.s8, T.s9);
  return { pos: add(PACK, [0, 9.5 + 2 * k, 8 + 2.5 * k]), look: add(PACK, [0, 0, 2.6]), fov: 46 };
};

const applyCam = (cam: THREE.PerspectiveCamera, c: Cam) => {
  cam.up.set(...(c.upv ?? [0, 1, 0]));
  cam.position.set(...c.pos);
  cam.lookAt(...c.look);
  if (c.roll) cam.rotateZ(c.roll);
  cam.fov = c.fov;
  cam.near = 0.02;
  cam.far = 300;
  cam.aspect = W / H;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
};
const projCam = new THREE.PerspectiveCamera(40, W / H, 0.02, 300);
const project = (f: number, p: V3): [number, number] => {
  applyCam(projCam, camAt(f));
  const v = new THREE.Vector3(...p).project(projCam);
  return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H];
};
const camRight = (f: number): V3 => {
  applyCam(projCam, camAt(f));
  const r = new THREE.Vector3(1, 0, 0).applyQuaternion(projCam.quaternion);
  r.y = 0;
  r.normalize();
  return [r.x, 0, r.z];
};

// 爆開程度：0＝組合、1＝分開
const explodeAt = (f: number) => {
  const out = spring({ frame: f - fr(T.explode), fps: E_FPS, config: { damping: 15, stiffness: 90 } });
  const back = spring({ frame: f - fr(T.s7), fps: E_FPS, config: { damping: 16, stiffness: 110 } });
  return f < fr(T.explode) ? 0 : Math.max(0, out - back);
};
const colorAt = (f: number) => (f < fr(22.6) ? 0 : f < fr(23.2) ? 1 : 2);

// ── 貼圖（同步畫在 canvas 上）──
const makeNetTexture = () => {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  g.strokeStyle = "#fff";
  g.lineWidth = 22;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(512, 512);
  g.moveTo(512, 0); g.lineTo(0, 512);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(14, 9);
  t.anisotropy = 8;
  return t;
};
const makeStarTexture = () => {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, "rgba(255,255,255,1)");
  rg.addColorStop(0.15, "rgba(255,250,235,.7)");
  rg.addColorStop(1, "rgba(255,240,200,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "rgba(255,255,255,.9)";
  g.fillRect(62, 0, 4, 128);
  g.fillRect(0, 62, 128, 4);
  return new THREE.CanvasTexture(c);
};
const makeBoxLabel = () => {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = "#b8895a";
  g.fillRect(0, 0, 1024, 512);
  g.fillStyle = "#f3ece2";
  g.fillRect(60, 70, 904, 372);
  g.fillStyle = "#b3141b";
  g.font = "bold 120px Helvetica, Arial";
  g.textAlign = "center";
  g.fillText("ASATEX", 512, 200);
  g.fillStyle = "#1a1a1a";
  g.font = "bold 54px Helvetica, Arial";
  g.fillText("PANTY DE RED · #CK2603L", 512, 300);
  g.font = "bold 46px Helvetica, Arial";
  g.fillText("100 DOCENAS", 512, 390);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

// 反射環境要在第一次輸出前就設好（effect 太晚，畫面不會重畫）
const Env: React.FC = () => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const env = useMemo(() => new THREE.PMREMGenerator(gl).fromScene(new RoomEnvironment(), 0.04).texture, [gl]);
  scene.environment = env;
  return null;
};

const Rig: React.FC<{ f: number }> = ({ f }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  applyCam(camera, camAt(f));
  return null;
};

// 圓柱表面上的閃鑽位置（固定種子）
const GEMS = Array.from({ length: 150 }, (_, i) => {
  const a = random(`ga${i}`) * Math.PI * 2;
  const y = (random(`gy${i}`) - 0.5) * HC * 0.95;
  return { a, y };
});

// ── 主分解台 ──
const MainSet: React.FC<{ f: number; netTex: THREE.Texture; star: THREE.Texture }> = ({ f, netTex, star }) => {
  const e = explodeAt(f);
  const ci = colorAt(f);
  const real = new THREE.Color(f >= fr(T.s7) ? COLORS[ci].c : COLORS[0].c);
  const netColor = real.clone().lerp(new THREE.Color(GOLD), e);
  const gemMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffffff", metalness: 0.6, roughness: 0.08, envMapIntensity: 2.5, emissive: new THREE.Color("#fff6e6"), emissiveIntensity: 0.55 }), []);
  const gemGeo = useMemo(() => new THREE.OctahedronGeometry(0.03, 0), []);
  const spin = f * 0.004;
  return (
    <group position={MAIN} rotation={[0, spin, 0]}>
      {/* 內層：腿型 */}
      <group position={[0, -GAP * e, 0]} rotation={[0, -e * 0.4, 0]}>
        <mesh>
          <cylinderGeometry args={[RC * 0.965, RC * 0.88, HC, 72, 1, true]} />
          <meshStandardMaterial color={f >= fr(T.s7) ? "#ece6dc" : "#c9976d"} roughness={0.55} transparent opacity={1 - 0.55 * e} side={THREE.DoubleSide} />
        </mesh>
        {e > 0.05 ? (
          <mesh>
            <cylinderGeometry args={[RC * 0.97, RC * 0.885, HC, 36, 8, true]} />
            <meshBasicMaterial color={GOLD} wireframe transparent opacity={0.35 * e} />
          </mesh>
        ) : null}
      </group>
      {/* 中層：網 */}
      <mesh rotation={[0, e * 0.25, 0]}>
        <cylinderGeometry args={[RC, RC * 0.915, HC, 96, 1, true]} />
        <meshStandardMaterial map={netTex} color={netColor} emissive={new THREE.Color(GOLD)} emissiveIntensity={0.25 * e} transparent alphaTest={0.35} side={THREE.DoubleSide} roughness={0.5} />
      </mesh>
      {/* 外層：閃鑽 */}
      <group position={[0, GAP * e, 0]} rotation={[0, e * 0.6, 0]}>
        {GEMS.map((g, i) => {
          const r = (RC - (RC * 0.085 * (g.y + HC / 2)) / HC) * 1.02;
          return <mesh key={i} geometry={gemGeo} material={gemMat} position={[r * Math.cos(g.a), g.y, r * Math.sin(g.a)]} rotation={[g.a, g.y * 3, 0]} />;
        })}
        {GEMS.slice(0, 40).map((g, i) => {
          const tw = Math.max(0, Math.sin(f * 0.22 + i * 1.7)) ** 6;
          const r = RC * 1.05;
          return (
            <sprite key={i} position={[r * Math.cos(g.a), g.y, r * Math.sin(g.a)]} scale={[0.32 * tw + 0.01, 0.32 * tw + 0.01, 1]}>
              <spriteMaterial map={star} transparent opacity={tw} blending={THREE.AdditiveBlending} depthWrite={false} />
            </sprite>
          );
        })}
      </group>
    </group>
  );
};

// ── 閃鑽特寫台 ──
const GemSet: React.FC<{ f: number; star: THREE.Texture }> = ({ f, star }) => {
  const geo = useMemo(() => {
    const pts = [[0, -0.62], [0.6, 0.0], [0.66, 0.07], [0.46, 0.27], [0.0, 0.3]].map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.LatheGeometry(pts, 16);
    return g.toNonIndexed();
  }, []);
  const threads = useMemo(() => {
    const mk = (a: V3, b: V3) => new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(...a), new THREE.Vector3(...b)), 1, 0.07, 12);
    return [mk([-3, -0.45, -3], [3, -0.45, 3]), mk([-3, -0.45, 3], [3, -0.45, -3]), mk([-3, -0.45, -1], [1, -0.45, 3]), mk([-1, -0.45, -3], [3, -0.45, 1])];
  }, []);
  const lt = f * 0.05;
  return (
    <group position={GEM}>
      <mesh geometry={geo} rotation={[0, f * 0.012, 0]} scale={0.55}>
        <meshStandardMaterial color="#ffffff" metalness={0.9} roughness={0.03} flatShading envMapIntensity={4} emissive="#cfd8ff" emissiveIntensity={0.08} />
      </mesh>
      <mesh position={[0, -0.38, 0]}>
        <torusGeometry args={[0.36, 0.06, 12, 48]} />
        <meshStandardMaterial color="#c9a45c" metalness={1} roughness={0.2} />
      </mesh>
      {threads.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial color="#1a1a1a" roughness={0.35} metalness={0.1} />
        </mesh>
      ))}
      <pointLight position={[2.2 * Math.cos(lt), 1.6, 2.2 * Math.sin(lt)]} intensity={30} color="#fff4dd" distance={8} />
      <pointLight position={[-2 * Math.cos(lt * 1.3), 1.2, -2 * Math.sin(lt * 1.3)]} intensity={18} color="#dfe8ff" distance={8} />
      {[0, 1, 2, 3, 4].map((i) => {
        const tw = Math.max(0, Math.sin(f * 0.18 + i * 2.1)) ** 8;
        const a = i * 1.3 + 0.4;
        return (
          <sprite key={i} position={[0.3 * Math.cos(a), 0.12 + 0.05 * i, 0.3 * Math.sin(a) + 0.15]} scale={[0.9 * tw + 0.01, 0.9 * tw + 0.01, 1]}>
            <spriteMaterial map={star} transparent opacity={tw} blending={THREE.AdditiveBlending} depthWrite={false} />
          </sprite>
        );
      })}
    </group>
  );
};

// ── 網格台：菱形網一條條畫出來 ──
const NetSet: React.FC<{ f: number }> = ({ f }) => {
  const lines = useMemo(() => {
    const out: THREE.TubeGeometry[] = [];
    const S = 3.4, step = 0.34;
    for (let k = -2 * S; k <= 2 * S + 1e-6; k += step) {
      for (const dir of [1, -1]) {
        // 直線 x - dir*z = k，裁在 [-S,S]² 內
        const pts: THREE.Vector3[] = [];
        for (const x of [-S, S]) { const z = (x - k) * dir; if (Math.abs(z) <= S) pts.push(new THREE.Vector3(x, 0, z)); }
        for (const z of [-S, S]) { const x = k + dir * z; if (Math.abs(x) <= S) pts.push(new THREE.Vector3(x, 0, z)); }
        if (pts.length >= 2) {
          pts.sort((a, b) => a.x - b.x);
          out.push(new THREE.TubeGeometry(new THREE.LineCurve3(pts[0], pts[pts.length - 1]), 24, 0.03, 8));
        }
      }
    }
    return out;
  }, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.8, roughness: 0.25, emissive: new THREE.Color(GOLD), emissiveIntensity: 0.2 }), []);
  const p0 = fr(T.s5);
  lines.forEach((g, i) => {
    const p = interpolate(f, [p0 + (i % 40) * 0.9, p0 + 18 + (i % 40) * 0.9], [0, 1], clamp);
    const n = g.index ? g.index.count : 0;
    g.setDrawRange(0, Math.floor((n * p) / 6) * 6);
  });
  return (
    <group position={NET}>
      {lines.map((g, i) => <mesh key={i} geometry={g} material={mat} />)}
    </group>
  );
};

// ── 纖維台：一條線拆成尼龍束＋螺旋彈性絲 ──
const FiberSet: React.FC<{ f: number }> = ({ f }) => {
  const t = f / E_FPS;
  const split = ease(interpolate(t, [T.s6 + 1.6, T.s6 + 3.0], [0, 1], clamp));
  const stretch = interpolate(t, [T.s6 + 4.2, T.s6 + 4.9, T.s6 + 5.4, T.s6 + 5.9], [1, 1.55, 0.92, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const fibers = useMemo(() => Array.from({ length: 46 }, (_, i) => {
    const a = (i / 46) * Math.PI * 2 * 3.1;
    const rr = 0.04 + 0.07 * random(`fr${i}`);
    return { a, rr };
  }), []);
  const fiberGeo = useMemo(() => new THREE.CylinderGeometry(0.011, 0.011, 5, 6, 1, true).rotateZ(Math.PI / 2), []);
  const helix = useMemo(() => {
    const pts = Array.from({ length: 700 }, (_, k) => {
      const u = k / 699, a = u * Math.PI * 2 * 14;
      return new THREE.Vector3(-2 + 4 * u, 0.07 * Math.cos(a), 0.07 * Math.sin(a));
    });
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 700, 0.016, 8);
  }, []);
  return (
    <group position={FIB}>
      <mesh rotation={[0, 0, Math.PI / 2]} visible={split < 0.98}>
        <cylinderGeometry args={[0.13, 0.13, 8, 32, 1, true]} />
        <meshStandardMaterial color="#202020" roughness={0.35} transparent opacity={1 - split} />
      </mesh>
      {fibers.map((fb, i) => {
        const r = fb.rr * (1 + 2.2 * split);
        return (
          <mesh key={i} geometry={fiberGeo} position={[0, r * Math.cos(fb.a) - 0.15 * split, r * Math.sin(fb.a)]}>
            <meshStandardMaterial color="#efe3c8" roughness={0.3} metalness={0.2} transparent opacity={split} />
          </mesh>
        );
      })}
      <group position={[0.3, 0.95 * split, 0.2 * split]} scale={[stretch, 1, 1]}>
        <mesh geometry={helix}>
          <meshStandardMaterial color="#e2483f" roughness={0.25} metalness={0.3} emissive="#e2483f" emissiveIntensity={0.25} transparent opacity={split} />
        </mesh>
      </group>
    </group>
  );
};

// ── 裝箱台 ──
const PACKS = [0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2];
const PackSet: React.FC<{ f: number; label: THREE.Texture }> = ({ f, label }) => {
  const t = f / E_FPS;
  const into = ease(interpolate(t, [T.s8 + 1.6, T.s8 + 2.4], [0, 1], clamp));
  return (
    <group position={PACK}>
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[14, 0.1, 14]} />
        <meshBasicMaterial color="#0b0c0f" />
      </mesh>
      {PACKS.map((ci, i) => {
        const col = i % 3, row = Math.floor(i / 3);
        const drop = spring({ frame: f - fr(T.s8) - i * 2, fps: E_FPS, config: { damping: 14, stiffness: 160 } });
        const home: V3 = [-1.15 + col * 1.15, 0.06 + (1 - drop) * 2.5, -2.4 + row * 1.25];
        const box: V3 = [(i % 3) * 0.05, 0.6 + i * 0.03, 3.4];
        const p = mix(home, box, into);
        return (
          <group key={i} position={p} scale={1 - 0.35 * into} visible={into < 0.99}>
            <mesh>
              <boxGeometry args={[0.9, 0.1, 1.05]} />
              <meshStandardMaterial color={COLORS[ci].c} roughness={0.45} />
            </mesh>
            <mesh position={[0, 0.052, 0.22]}>
              <boxGeometry args={[0.88, 0.005, 0.3]} />
              <meshStandardMaterial color="#f3ece2" roughness={0.6} />
            </mesh>
          </group>
        );
      })}
      <group position={[0, 0.75, 3.4]}>
        <mesh>
          <boxGeometry args={[1.9, 1.5, 1.6]} />
          <meshStandardMaterial attach="material-0" color="#b8895a" roughness={0.8} />
          <meshStandardMaterial attach="material-1" color="#b8895a" roughness={0.8} />
          <meshStandardMaterial attach="material-2" color="#c39565" roughness={0.8} />
          <meshStandardMaterial attach="material-3" color="#a87d50" roughness={0.8} />
          <meshStandardMaterial attach="material-4" map={label} roughness={0.7} />
          <meshStandardMaterial attach="material-5" color="#b8895a" roughness={0.8} />
        </mesh>
      </group>
    </group>
  );
};

const Scene: React.FC = () => {
  const f = useCurrentFrame();
  const netTex = useMemo(makeNetTexture, []);
  const star = useMemo(makeStarTexture, []);
  const label = useMemo(makeBoxLabel, []);
  return (
    <>
      <color attach="background" args={["#0b0c0f"]} />
      <Env />
      <Rig f={f} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[5, 8, 6]} intensity={2.2} color="#fff3e0" />
      <directionalLight position={[-6, 2, -4]} intensity={1.4} color="#9fb6ff" />
      <directionalLight position={[0, -5, 4]} intensity={0.4} color={GOLD} />
      <MainSet f={f} netTex={netTex} star={star} />
      <GemSet f={f} star={star} />
      <NetSet f={f} />
      <FiberSet f={f} />
      <PackSet f={f} label={label} />
    </>
  );
};

// ── 2D 疊字 ──
const Rise: React.FC<{ at: number; children: React.ReactNode; dy?: number }> = ({ at, children, dy = 30 }) => {
  const f = useCurrentFrame() - at;
  const k = spring({ frame: f, fps: E_FPS, config: { damping: 18, stiffness: 160 } });
  return <div style={{ opacity: f < 0 ? 0 : k, transform: `translateY(${(1 - k) * dy}px)` }}>{children}</div>;
};
const Big: React.FC<{ children: React.ReactNode; size?: number; color?: string; weight?: number; track?: number; align?: React.CSSProperties["textAlign"] }> = ({ children, size = 84, color = "#fff", weight = 800, track = 0.03, align = "left" }) => (
  <div style={{ fontFamily: SANS, fontWeight: weight, fontSize: size, letterSpacing: `${track}em`, color, lineHeight: 1.05, textAlign: align, textShadow: "0 4px 30px rgba(0,0,0,.6)" }}>{children}</div>
);
const Tag: React.FC<{ children: React.ReactNode; color?: string; size?: number }> = ({ children, color = GOLD, size = 26 }) => (
  <div style={{ fontFamily: MONO, fontSize: size, letterSpacing: 5, color }}>{children}</div>
);

const Opening: React.FC = () => {
  const f = useCurrentFrame();
  const z = interpolate(f, [0, fr(T.s3)], [1.0, 1.16], { ...clamp, easing: Easing.out(Easing.quad) });
  // 掃描線：3.0s→5.0s 由下往上
  const scan = interpolate(f, [fr(T.s2), fr(T.s2 + 2.0)], [H + 40, -40], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const visible = f < fr(T.s3);
  if (!visible) return null;
  return (
    <AbsoluteFill style={{ clipPath: `inset(0 0 ${Math.max(0, H - scan)}px 0)` }}>
      <AbsoluteFill style={{ transform: `scale(${z})`, transformOrigin: "62% 70%" }}>
        <Img src={staticFile("ck/legs.jpg")} style={{ width: W, height: H }} />
        <svg width={W} height={H} style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}>
          {(sparkles as number[][]).map(([x, y, s], i) => {
            const tw = Math.max(0, Math.sin(f * 0.21 + i * 2.39)) ** 10;
            if (tw < 0.05) return null;
            const r = (10 + Math.min(40, s) * 0.7) * tw;
            return (
              <g key={i} transform={`translate(${x} ${y}) rotate(${(i * 37) % 90})`} opacity={tw}>
                <circle r={r * 0.35} fill="rgba(255,250,235,.85)" />
                <rect x={-r * 2.2} y={-1.2} width={r * 4.4} height={2.4} fill="#fff" />
                <rect x={-1.2} y={-r * 2.2} width={2.4} height={r * 4.4} fill="#fff" />
              </g>
            );
          })}
        </svg>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,.35) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 62%, rgba(0,0,0,.7) 100%)" }} />
    </AbsoluteFill>
  );
};
const ScanLine: React.FC = () => {
  const f = useCurrentFrame();
  if (f < fr(T.s2) || f > fr(T.s2 + 2.05)) return null;
  const y = interpolate(f, [fr(T.s2), fr(T.s2 + 2.0)], [H + 40, -40], { ...clamp, easing: Easing.inOut(Easing.quad) });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y - 3, height: 6, background: GOLD, boxShadow: `0 0 30px 8px ${GOLD}, 0 0 90px 20px rgba(217,178,106,.45)` }} />
  );
};

const Callouts: React.FC = () => {
  const f = useCurrentFrame();
  if (f < fr(6.4) || f >= fr(T.s4)) return null;
  const rv = camRight(f);
  const e = explodeAt(f);
  const items = [
    { y: GAP * e, n: "01", t: "BRILLOS DE DIAMANTE", at: 6.6 },
    { y: 0, n: "02", t: "RED · DISEÑO ELEGANTE", at: 7.0 },
    { y: -GAP * e, n: "03", t: "98% NYLON · 2% SPANDEX", at: 7.4 },
  ];
  return (
    <AbsoluteFill>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        {items.map((it) => {
          const k = interpolate(f, [fr(it.at), fr(it.at) + 10], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
          const [ax, ay] = project(f, add([rv[0] * RC * 1.04, it.y, rv[2] * RC * 1.04]));
          const ex = 640, ey = ay;
          const mx = ax + (ex - ax) * k;
          return (
            <g key={it.n} opacity={k > 0 ? 1 : 0}>
              <circle cx={ax} cy={ay} r={9} fill="none" stroke={GOLD} strokeWidth={3} />
              <circle cx={ax} cy={ay} r={3.5} fill={GOLD} />
              <line x1={ax} y1={ay} x2={mx} y2={ey} stroke={GOLD} strokeWidth={2.5} />
              <line x1={ex} y1={ey} x2={ex + 360 * k} y2={ey} stroke={GOLD} strokeWidth={2.5} opacity={0.5} />
            </g>
          );
        })}
      </svg>
      {items.map((it) => {
        const [, ay] = project(f, add([rv[0] * RC * 1.04, it.y, rv[2] * RC * 1.04]));
        return (
          <div key={it.n} style={{ position: "absolute", left: 652, top: ay - 78, width: 400 }}>
            <Rise at={fr(it.at) + 6} dy={14}>
              <Tag size={34}>{it.n}</Tag>
              <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 32, color: "#fff", letterSpacing: "0.04em", marginTop: 4, lineHeight: 1.15 }}>{it.t}</div>
            </Rise>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const Donut: React.FC<{ k: number }> = ({ k }) => {
  const r = 120, C = 2 * Math.PI * r;
  return (
    <svg width={300} height={300} viewBox="0 0 300 300">
      <circle cx={150} cy={150} r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={34} />
      <circle cx={150} cy={150} r={r} fill="none" stroke="#efe3c8" strokeWidth={34} strokeDasharray={`${C * 0.98 * k} ${C}`} transform="rotate(-90 150 150)" />
      <circle cx={150} cy={150} r={r} fill="none" stroke="#e2483f" strokeWidth={34} strokeDasharray={`${C * 0.02 * k} ${C}`} strokeDashoffset={-C * 0.98 * k} transform="rotate(-90 150 150)" />
      <text x={150} y={142} textAnchor="middle" fontFamily={SANS} fontWeight={900} fontSize={58} fill="#fff">{Math.round(98 * k)}%</text>
      <text x={150} y={184} textAnchor="middle" fontFamily={MONO} fontSize={22} letterSpacing={4} fill="#efe3c8">NYLON</text>
    </svg>
  );
};

const Overlays: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / E_FPS;
  const inR = (a: number, b: number) => t >= a && t < b;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {inR(0, T.s2) && (
        <>
          <div style={{ position: "absolute", top: 290, left: 80 }}><Rise at={6}><Tag>PANTY DE RED · #CK2603L</Tag></Rise></div>
          <div style={{ position: "absolute", bottom: 420, left: 80, right: 80 }}><Rise at={12}><Big size={104} weight={900}>BRILLA A<br />CADA PASO.</Big></Rise></div>
        </>
      )}
      {inR(T.s2 + 0.5, T.s3) && (
        <div style={{ position: "absolute", top: 300, left: 80, right: 80 }}><Rise at={fr(T.s2 + 0.5)}><Big size={78} weight={800}>¿QUÉ HAY DETRÁS<br />DEL BRILLO?</Big></Rise></div>
      )}
      {inR(T.s3, T.s4) && (
        <div style={{ position: "absolute", top: 215, left: 90 }}><Rise at={fr(T.s3)}><Tag size={22}>VISTA EXPLOSIONADA</Tag></Rise></div>
      )}
      <Callouts />
      {inR(T.s4, T.s5) && (
        <div style={{ position: "absolute", bottom: 400, left: 80, right: 80 }}>
          <Rise at={fr(T.s4 + 0.3)}><Tag size={34}>01</Tag></Rise>
          <Rise at={fr(T.s4 + 0.45)}><Big size={92} weight={900}>BRILLOS DE<br />DIAMANTE</Big></Rise>
          <Rise at={fr(T.s4 + 0.8)}><div style={{ fontFamily: SANS, fontSize: 38, color: "rgba(255,255,255,.75)", marginTop: 16 }}>que atrapan la luz.</div></Rise>
        </div>
      )}
      {inR(T.s5, T.s6) && (
        <>
          <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
            {(() => {
              const k = interpolate(f, [fr(T.s5 + 0.8), fr(T.s5 + 1.3)], [0, 1], clamp);
              const cx = W / 2, cy = H / 2, s = 120 * (1 + 0.25 * local(f, T.s5, T.s6));
              return (
                <g opacity={k}>
                  <path d={`M${cx} ${cy - s} L${cx + s} ${cy} L${cx} ${cy + s} L${cx - s} ${cy} Z`} fill="none" stroke="#fff" strokeWidth={3} strokeDasharray="10 8" />
                  <line x1={cx + s + 20} y1={cy} x2={cx + s + 140} y2={cy} stroke="#fff" strokeWidth={2} />
                  <text x={cx + s + 150} y={cy + 9} fontFamily={MONO} fontSize={26} fill="#fff" letterSpacing={3}>ROMBO</text>
                </g>
              );
            })()}
          </svg>
          <div style={{ position: "absolute", bottom: 400, left: 80, right: 80 }}>
            <Rise at={fr(T.s5 + 0.2)}><Tag size={34}>02</Tag></Rise>
            <Rise at={fr(T.s5 + 0.35)}><Big size={92} weight={900}>DISEÑO<br />ELEGANTE</Big></Rise>
          </div>
        </>
      )}
      {inR(T.s6, T.s7) && (
        <>
          <div style={{ position: "absolute", top: 280, left: 80, right: 80 }}>
            <Rise at={fr(T.s6 + 0.2)}><Tag size={34}>03</Tag></Rise>
            <Rise at={fr(T.s6 + 0.35)}><Big size={74} weight={900}>98% NYLON<br /><span style={{ color: "#e2483f" }}>2% SPANDEX</span></Big></Rise>
          </div>
          {t > T.s6 + 2.2 && (
            <div style={{ position: "absolute", bottom: 380, left: 80 }}>
              <Rise at={fr(T.s6 + 2.2)}><div style={{ borderRadius: "50%", background: "rgba(11,12,15,.85)", boxShadow: "0 0 40px 20px rgba(11,12,15,.85)" }}><Donut k={interpolate(f, [fr(T.s6 + 2.2), fr(T.s6 + 3.4)], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) })} /></div></Rise>
            </div>
          )}
          {t > T.s6 + 4.1 && (
            <div style={{ position: "absolute", bottom: 470, right: 80, textAlign: "right" }}>
              <Rise at={fr(T.s6 + 4.1)}><Tag color="#e2483f">ELASTICIDAD</Tag><Big size={62} weight={900} align="right">AJUSTE<br />PERFECTO</Big></Rise>
            </div>
          )}
        </>
      )}
      {inR(T.s7, T.s8) && (
        <div style={{ position: "absolute", bottom: 380, left: 0, right: 0, display: "grid", justifyItems: "center", gap: 26 }}>
          <Rise at={fr(T.s7 + 0.4)}><Big size={60} weight={800} align="center">3 COLORES</Big></Rise>
          <div style={{ display: "flex", gap: 26 }}>
            {COLORS.map((c, i) => {
              const on = colorAt(f) === i && t >= T.s7 + 0.5;
              return (
                <Rise key={c.name} at={fr(T.s7 + 0.5) + i * 4}>
                  <div style={{ display: "grid", justifyItems: "center", gap: 12, opacity: on ? 1 : 0.45, transform: `scale(${on ? 1.08 : 1})` }}>
                    <div style={{ width: 150, height: 150, borderRadius: 18, background: c.c, border: `4px solid ${on ? GOLD : "rgba(255,255,255,.25)"}`, boxShadow: on ? `0 0 30px ${GOLD}66` : "none" }} />
                    <Tag color={on ? "#fff" : "rgba(255,255,255,.7)"} size={28}>{c.name}</Tag>
                  </div>
                </Rise>
              );
            })}
          </div>
        </div>
      )}
      {t >= T.s9 && <EndCard />}
    </AbsoluteFill>
  );
};


// ── 第 7 格：真人照片，三色（黑＝原圖、紅／膚＝scripts/recolor_legs.py 重新上色）用金色掃描線切換 ──
const COLOR_IMGS = ["ck/legs.jpg", "ck/legs_rojo.jpg", "ck/legs_piel.jpg"];
const COLOR_AT = [T.s7, 22.6, 23.2];
const ColorShot: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / E_FPS;
  if (t < T.s7 || t >= T.s8) return null;
  const z = interpolate(t, [T.s7, T.s8], [1.08, 1.2]);
  return (
    <AbsoluteFill style={{ background: "#0b0c0f", overflow: "hidden" }}>
      {COLOR_IMGS.map((src, i) => {
        // 新顏色由上往下掃進來（0.3 秒）
        const k = i === 0 ? 1 : interpolate(t, [COLOR_AT[i], COLOR_AT[i] + 0.3], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
        if (k <= 0) return null;
        return (
          <AbsoluteFill key={src} style={{ clipPath: `inset(0 0 ${(1 - k) * 100}% 0)` }}>
            <AbsoluteFill style={{ transform: `scale(${z})`, transformOrigin: "60% 62%" }}>
              <Img src={staticFile(src)} style={{ width: W, height: H }} />
            </AbsoluteFill>
          </AbsoluteFill>
        );
      })}
      {COLOR_AT.slice(1).map((a) => {
        const k = interpolate(t, [a, a + 0.3], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
        if (k <= 0 || k >= 1) return null;
        return <div key={a} style={{ position: "absolute", left: 0, right: 0, top: k * H - 3, height: 6, background: GOLD, boxShadow: `0 0 30px 8px ${GOLD}` }} />;
      })}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,.25) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 55%, rgba(0,0,0,.75) 100%)" }} />
    </AbsoluteFill>
  );
};

// ── 第 8 格：傳單照片上的運鏡，依旁白框出型號、配色、100 打 ──
const FLY_W = 1086, FLY_H = 1448, FK = W / FLY_W, FTOP = (H - FLY_H * FK) / 2;
const FLY_KEYS: [number, number, number, number][] = [
  // [秒（相對第 8 格）, 傳單 x, 傳單 y, 放大]
  [0, 748, 580, 2.4],
  [1.0, 752, 588, 2.2],
  [1.6, 790, 1112, 1.8],
  [2.4, 796, 1118, 1.7],
  [3.5, 543, 724, 1.0],
];
const FlyerShot: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / E_FPS;
  if (t < T.s8 || t >= T.s9) return null;
  const lt = t - T.s8;
  const ks = FLY_KEYS;
  const pick = (j: number) => interpolate(lt, ks.map((k) => k[0]), ks.map((k) => k[j]), { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const px = pick(1), py = pick(2), z = pick(3);
  const bx = px * FK, by = FTOP + py * FK;
  const tx = W / 2 - bx * z, ty = H / 2 - by * z;
  const box = (x0: number, y0: number, x1: number, y1: number, a: number, b: number) => {
    const k = interpolate(lt, [a, a + 0.35], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
    const out = interpolate(lt, [b - 0.25, b], [1, 0], clamp);
    const per = 2 * (x1 - x0 + y1 - y0);
    return (
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={14} fill="none" stroke={GOLD} strokeWidth={5}
        strokeDasharray={per} strokeDashoffset={per * (1 - k)} opacity={out} style={{ filter: `drop-shadow(0 0 10px ${GOLD})` }} />
    );
  };
  const ring = interpolate(lt, [1.75, 2.1], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const ringOut = interpolate(lt, [2.9, 3.2], [1, 0], clamp);
  const pulse = 1 + 0.06 * Math.max(0, Math.sin((lt - 1.75) * 9)) * ring;
  return (
    <AbsoluteFill style={{ background: "#0b0c0f", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: FTOP, width: W, height: FLY_H * FK, transformOrigin: `0 ${-FTOP}px`, transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
        <Img src={staticFile("ck/flyer.png")} style={{ width: W, height: FLY_H * FK, display: "block" }} />
        <svg width={W} height={FLY_H * FK} viewBox={`0 0 ${FLY_W} ${FLY_H}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {box(532, 547, 962, 612, 0.15, 1.35)}
          {box(528, 1038, 818, 1206, 1.5, 2.7)}
          <circle cx={950} cy={1118} r={112 * pulse} fill="none" stroke={GOLD} strokeWidth={6} opacity={ring * ringOut} style={{ filter: `drop-shadow(0 0 14px ${GOLD})` }} />
        </svg>
      </div>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 62%, rgba(0,0,0,.45) 100%)" }} />
    </AbsoluteFill>
  );
};

const WhatsApp: React.FC = () => (
  <svg width="50" height="50" viewBox="0 0 48 48" aria-hidden>
    <path d="M24 4C13 4 4 12.8 4 23.7c0 3.6 1 7 2.8 9.9L4 44l10.8-2.8c2.8 1.5 6 2.3 9.2 2.3 11 0 20-8.8 20-19.8S35 4 24 4z" fill="#25d366" />
    <path d="M17.5 13.8c-.5-1.1-1-1.1-1.5-1.1h-1.3c-.4 0-1.2.2-1.8.8-.6.6-2.3 2.2-2.3 5.4s2.4 6.3 2.7 6.7c.3.4 4.6 7.2 11.3 9.9 5.6 2.2 6.7 1.8 7.9 1.7 1.2-.1 3.9-1.6 4.5-3.1.6-1.5.6-2.8.4-3.1-.2-.3-.6-.4-1.3-.8-.7-.3-3.9-1.9-4.5-2.1-.6-.2-1-.3-1.5.3-.4.7-1.7 2.1-2.1 2.6-.4.4-.8.5-1.4.2-.7-.3-2.8-1-5.3-3.3-2-1.7-3.3-3.9-3.7-4.5-.4-.7 0-1 .3-1.4.3-.3.7-.8 1-1.2.3-.4.4-.7.7-1.2.2-.4.1-.9 0-1.2-.2-.4-1.4-3.6-2-4.9z" fill="#fff" />
  </svg>
);
const EndCard: React.FC = () => {
  const f = useCurrentFrame() - fr(T.s9);
  const bg = interpolate(f, [0, 12], [0, 1], clamp);
  const z = interpolate(f, [0, 108], [1.06, 1.0]);
  return (
    <AbsoluteFill style={{ opacity: bg }}>
      <AbsoluteFill style={{ background: "#0b0c0f" }} />
      <AbsoluteFill style={{ transform: `scale(${z})`, opacity: 0.32, filter: "blur(2px)" }}>
        <Img src={staticFile("ck/legs.jpg")} style={{ width: W, height: H }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(11,12,15,.6) 0%, rgba(11,12,15,.85) 55%, rgba(11,12,15,.95) 100%)" }} />
      <div style={{ position: "absolute", top: 330, left: 0, right: 0, display: "grid", justifyItems: "center", gap: 26 }}>
        <Rise at={4}><Img src={staticFile("trailer/logo.png")} style={{ width: 460 }} /></Rise>
        <Rise at={10}><Tag size={30} color={GOLD}>ELEGANCIA QUE TE ACOMPAÑA</Tag></Rise>
        <Rise at={18}><div style={{ marginTop: 40, background: RED, color: "#fff", fontFamily: SANS, fontWeight: 900, fontSize: 64, letterSpacing: "0.06em", padding: "18px 44px" }}>VENTAS POR MAYOR</div></Rise>
        <Rise at={24}><Tag size={32} color="#fff">ZOFRI · IQUIQUE · CHILE</Tag></Rise>
        <Rise at={30}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, border: `2px solid ${GOLD}`, borderRadius: 999, padding: "14px 34px", marginTop: 12 }}>
            <WhatsApp />
            <span style={{ fontFamily: MONO, fontSize: 52, color: "#fff", letterSpacing: 2 }}>+56 9 9442 7681</span>
          </div>
        </Rise>
      </div>
    </AbsoluteFill>
  );
};

const Hud: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / E_FPS;
  if (t < T.s3 || t >= T.s7) return null;
  const line = `2px solid ${GOLD}88`;
  const c = (s: React.CSSProperties) => ({ position: "absolute" as const, width: 40, height: 40, ...s });
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={c({ left: 40, top: 200, borderLeft: line, borderTop: line })} />
      <div style={c({ right: 40, top: 200, borderRight: line, borderTop: line })} />
      <div style={c({ left: 40, bottom: 300, borderLeft: line, borderBottom: line })} />
      <div style={c({ right: 40, bottom: 300, borderRight: line, borderBottom: line })} />
      <div style={{ position: "absolute", right: 90, top: 214, fontFamily: MONO, fontSize: 20, letterSpacing: 4, color: `${GOLD}cc` }}>ASATEX · CK2603L</div>
    </AbsoluteFill>
  );
};

const CutFlash: React.FC = () => {
  const f = useCurrentFrame();
  const cuts = [T.s3, T.s4, T.s5, T.s6, T.s7, T.s8].map(fr);
  let o = 0;
  for (const c of cuts) if (f >= c && f < c + 3) o = (3 - (f - c)) * 0.14;
  return <AbsoluteFill style={{ background: "#fff", opacity: o, pointerEvents: "none" }} />;
};

export const Exploded: React.FC = () => (
  <AbsoluteFill style={{ background: "#0b0c0f" }}>
    <ThreeCanvas width={W} height={H} gl={{ antialias: true }} camera={{ fov: 40, position: [0, 0, 8] }}>
      <Scene />
    </ThreeCanvas>
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,.55) 100%)", pointerEvents: "none" }} />
    <Opening />
    <ScanLine />
    <ColorShot />
    <Overlays />
    <FlyerShot />
    <Hud />
    <CutFlash />
    <Audio src={staticFile("ck/mix.wav")} />
  </AbsoluteFill>
);
