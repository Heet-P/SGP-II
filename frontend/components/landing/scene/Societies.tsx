"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { seeded, SOCIETIES, SOCIETY_HALF, societyPower, v } from "./layout";
import { facadeTextures } from "./textures";

const FLOOR = 0.72;
const TILE_FLOORS = 4;

interface Tower {
  x: number;
  z: number;
  w: number;
  d: number;
  floors: number;
}

/** Tower footprints for each society, arranged in a grid inside its compound. */
function planTowers() {
  const rand = seeded(13);
  return SOCIETIES.map((soc) => {
    const cols = soc.towers > 4 ? 3 : 2;
    const rows = Math.ceil(soc.towers / cols);
    const towers: Tower[] = [];
    for (let i = 0; i < soc.towers; i++) {
      const cx = (i % cols) - (cols - 1) / 2;
      const cz = Math.floor(i / cols) - (rows - 1) / 2;
      towers.push({
        x: soc.pos.x + cx * 4.8,
        z: soc.pos.z + cz * 6.2,
        w: 3.6,
        d: 3.6 + rand() * 0.8,
        floors: 7 + Math.floor(rand() * 9),
      });
    }
    return towers;
  });
}

/** Façade material: the window tile repeats by floor count; roofs sample plain wall. */
function facadeMaterial(tex: ReturnType<typeof facadeTextures>) {
  const m = new THREE.MeshStandardMaterial({
    ...tex,
    roughness: 1,
    metalness: 0,
    emissive: new THREE.Color("#ffc977"),
    emissiveIntensity: 0,
    envMapIntensity: 1.1,
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aRepeat;")
      .replace("#include <uv_vertex>", `#include <uv_vertex>
        if (abs(normal.y) > 0.5) {
          vMapUv = vec2(0.04, 0.985);
        } else {
          vMapUv *= aRepeat;
        }
        vRoughnessMapUv = vMapUv;
        vEmissiveMapUv = vMapUv;`);
  };
  m.customProgramCacheKey = () => "facade";
  return m;
}

export function Societies({ progress, labels }: {
  progress: React.RefObject<number>;
  labels: React.RefObject<(HTMLDivElement | null)[]>;
}) {
  const plans = useMemo(() => planTowers(), []);
  const tex = useMemo(() => facadeTextures(), []);
  const mats = useMemo(() => SOCIETIES.map(() => facadeMaterial(tex)), [tex]);
  const geometries = useMemo(() => plans.map((towers) => {
    const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const repeat = new Float32Array(towers.length * 2);
    towers.forEach((t, i) => repeat.set([1, t.floors / TILE_FLOORS], i * 2));
    g.setAttribute("aRepeat", new THREE.InstancedBufferAttribute(repeat, 2));
    return g;
  }), [plans]);

  const towerRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const tanks = useRef<THREE.InstancedMesh>(null);
  const roofs = useRef<THREE.InstancedMesh>(null);
  const allTowers = useMemo(() => plans.flat(), [plans]);

  useEffect(() => {
    const rand = seeded(31);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const tints = ["#ffffff", "#f6e7d7", "#e8ecef", "#f2ead2"];
    plans.forEach((towers, s) => {
      const mesh = towerRefs.current[s];
      if (!mesh) return;
      towers.forEach((t, i) => {
        m.compose(v(t.x, 0, t.z), new THREE.Quaternion(), v(t.w, t.floors * FLOOR, t.d));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, c.set(tints[Math.floor(rand() * tints.length)]));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    allTowers.forEach((t, i) => {
      const top = t.floors * FLOOR;
      m.makeTranslation(t.x + 0.8, top + 0.45, t.z - 0.6);
      tanks.current?.setMatrixAt(i, m);
      m.makeTranslation(t.x - 0.6, top + 0.5, t.z + 0.4);
      roofs.current?.setMatrixAt(i, m);
    });
    if (tanks.current) tanks.current.instanceMatrix.needsUpdate = true;
    if (roofs.current) roofs.current.instanceMatrix.needsUpdate = true;
  }, [plans, allTowers]);

  const labelPoint = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    const s = progress.current;
    SOCIETIES.forEach((soc, i) => {
      const power = societyPower(i, s);
      mats[i].emissiveIntensity = 2.4 * power;
      const el = labels.current[i];
      if (!el) return;
      const top = Math.max(...plans[i].map((t) => t.floors)) * FLOOR + 2.5;
      labelPoint.set(soc.pos.x, top, soc.pos.z).project(camera);
      const visible = labelPoint.z < 1 && Math.abs(labelPoint.x) < 1.1 && Math.abs(labelPoint.y) < 1.1;
      el.style.transform = `translate(${(labelPoint.x * 0.5 + 0.5) * size.width}px, ${(-labelPoint.y * 0.5 + 0.5) * size.height}px) translate(-50%, -100%)`;
      el.style.opacity = String(visible ? smooth01(power) : 0);
    });
  });

  return (
    <group>
      {plans.map((towers, i) => (
        <instancedMesh key={i} ref={(el) => { towerRefs.current[i] = el; }}
          args={[geometries[i], mats[i], towers.length]} castShadow receiveShadow />
      ))}
      <instancedMesh ref={tanks} args={[undefined, undefined, allTowers.length]} castShadow>
        <cylinderGeometry args={[0.45, 0.45, 0.9, 12]} />
        <meshStandardMaterial color="#2f3a4a" roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={roofs} args={[undefined, undefined, allTowers.length]} castShadow>
        <boxGeometry args={[1.2, 1, 1.2]} />
        <meshStandardMaterial color="#d9d3c6" roughness={0.9} />
      </instancedMesh>
      {SOCIETIES.map((soc) => (
        <group key={soc.name} position={soc.pos}>
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[SOCIETY_HALF * 2, SOCIETY_HALF * 2]} />
            <meshStandardMaterial color="#b8b3a8" roughness={0.95} />
          </mesh>
          {[[0, -SOCIETY_HALF, SOCIETY_HALF * 2, 0.25], [0, SOCIETY_HALF, SOCIETY_HALF * 2, 0.25],
            [-SOCIETY_HALF, 0, 0.25, SOCIETY_HALF * 2], [SOCIETY_HALF, 0, 0.25, SOCIETY_HALF * 2]].map(([x, z, w, d], k) => (
            <mesh key={k} position={[x, 0.65, z]} castShadow receiveShadow>
              <boxGeometry args={[w, 1.3, d]} />
              <meshStandardMaterial color="#e3dccb" roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

const smooth01 = (x: number) => x * x * (3 - 2 * x);
