"use client";

/* eslint-disable react-hooks/immutability --
 * react-three-fiber animates by mutating three.js objects inside useFrame/effects, outside React's render. */

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { CABLE, FARM, FARM_HALF, INVERTER, PANELS, smooth, SUBSTATION, TRUNK, v } from "./layout";
import { panelTextures } from "./textures";

const ALUMINIUM = { color: "#c9ced6", metalness: 1, roughness: 0.32 };
const STEEL = { color: "#8d939c", metalness: 0.9, roughness: 0.45 };

export function SolarFarm({ progress }: { progress: React.RefObject<number> }) {
  const tex = useMemo(() => panelTextures(), []);
  const glass = useMemo(() => new THREE.MeshPhysicalMaterial({
    ...tex,
    roughness: 1, // scaled by roughnessMap: glass over cells is smooth, the backsheet gaps matte
    metalness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.4,
    emissive: new THREE.Color("#2f8cff"),
    emissiveIntensity: 0,
  }), [tex]);

  const panels = useRef<THREE.InstancedMesh>(null);
  const frames = useRef<THREE.InstancedMesh>(null);
  const posts = useRef<THREE.InstancedMesh>(null);

  // Two posts per panel pair; panel tilt about X faces the cells south-up toward the camera.
  const postSpots = useMemo(
    () => PANELS.filter((_, i) => i % 2 === 0).map((p) => v(p.x + FARM.dx / 2, 0, p.z)),
    [],
  );

  useEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(FARM.tilt, 0, 0));
    PANELS.forEach((p, i) => {
      m.compose(p, q, v(1, 1, 1));
      panels.current?.setMatrixAt(i, m);
      frames.current?.setMatrixAt(i, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.03, 0)));
    });
    postSpots.forEach((p, i) => {
      m.compose(v(p.x, FARM.height / 2 - 0.1, p.z), new THREE.Quaternion(), v(1, 1, 1));
      posts.current?.setMatrixAt(i, m);
    });
    [panels, frames, posts].forEach((r) => { if (r.current) r.current.instanceMatrix.needsUpdate = true; });
  }, [postSpots]);

  useFrame(() => {
    // Cells pulse faintly blue while light is being converted (the "morph" beat).
    const s = progress.current;
    glass.emissiveIntensity = 0.55 * smooth(0.22, 0.42, s) * (1 - smooth(0.6, 0.8, s));
  });

  const rowLength = FARM.cols * FARM.dx;
  const rows = Array.from({ length: FARM.rows }, (_, r) => (r - (FARM.rows - 1) / 2) * FARM.dz);

  return (
    <group>
      <instancedMesh ref={panels} args={[undefined, glass, PANELS.length]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.04, 1.25]} />
      </instancedMesh>
      <instancedMesh ref={frames} args={[undefined, undefined, PANELS.length]} castShadow>
        <boxGeometry args={[2.26, 0.04, 1.31]} />
        <meshStandardMaterial {...ALUMINIUM} />
      </instancedMesh>
      <instancedMesh ref={posts} args={[undefined, undefined, postSpots.length]} castShadow>
        <cylinderGeometry args={[0.055, 0.07, FARM.height - 0.1, 8]} />
        <meshStandardMaterial {...STEEL} />
      </instancedMesh>
      {/* Torque tube under each row. */}
      {rows.map((z) => (
        <mesh key={z} position={[0, FARM.height - 0.08, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, rowLength, 8]} />
          <meshStandardMaterial {...STEEL} />
        </mesh>
      ))}
      {/* String inverters at the east end of each row. */}
      {rows.map((z) => (
        <mesh key={`inv${z}`} position={[FARM_HALF.x - 0.6, 0.5, z + 0.9]} castShadow>
          <boxGeometry args={[0.7, 1, 0.45]} />
          <meshStandardMaterial color="#e7e9ed" roughness={0.45} metalness={0.2} />
        </mesh>
      ))}
      <Fence halfX={FARM_HALF.x + 1.5} halfZ={FARM_HALF.z + 1.5} />
      <Station progress={progress} />
    </group>
  );
}

/** Central inverter, cables and the substation that feeds every line. */
function Station({ progress }: { progress: React.RefObject<number> }) {
  const led = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (led.current) {
      const on = smooth(0.3, 0.4, progress.current);
      led.current.color.setRGB(0.3 * on, (1.5 + Math.sin(clock.elapsedTime * 6) * 0.8) * on + 0.2, 0.6 * on);
    }
  });
  return (
    <group>
      <mesh position={[INVERTER.x, 0.8, INVERTER.z]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 1.6, 1]} />
        <meshStandardMaterial color="#f1f2f4" roughness={0.4} metalness={0.25} />
      </mesh>
      <mesh position={[INVERTER.x - 0.5, 1.3, INVERTER.z + 0.51]}>
        <boxGeometry args={[0.12, 0.06, 0.02]} />
        <meshBasicMaterial ref={led} color="#1a3" toneMapped={false} />
      </mesh>
      {[CABLE, TRUNK].map((curve, i) => (
        <mesh key={i} castShadow>
          <tubeGeometry args={[curve, 60, 0.045, 8]} />
          <meshStandardMaterial color="#17191d" roughness={0.6} />
        </mesh>
      ))}

      <group position={SUBSTATION}>
        <mesh position={[0, 0.1, 0]} receiveShadow>
          <boxGeometry args={[10, 0.2, 10]} />
          <meshStandardMaterial color="#a9a69e" roughness={0.95} />
        </mesh>
        {[-2, 1.5].map((x) => (
          <group key={x} position={[x, 0.2, -1.5]}>
            <mesh position={[0, 1.1, 0]} castShadow receiveShadow>
              <boxGeometry args={[2, 2.2, 1.6]} />
              <meshStandardMaterial color="#7f8b84" roughness={0.55} metalness={0.4} />
            </mesh>
            {/* Radiator fins. */}
            {[-0.6, -0.2, 0.2, 0.6].map((f) => (
              <mesh key={f} position={[f, 1, 0.95]} castShadow>
                <boxGeometry args={[0.08, 1.6, 0.35]} />
                <meshStandardMaterial color="#77837c" roughness={0.5} metalness={0.5} />
              </mesh>
            ))}
            {[-0.5, 0, 0.5].map((b) => (
              <mesh key={b} position={[b, 2.65, 0]}>
                <cylinderGeometry args={[0.07, 0.09, 0.7, 8]} />
                <meshStandardMaterial color="#b9563c" roughness={0.4} />
              </mesh>
            ))}
          </group>
        ))}
        {/* Gantry the outgoing lines start from. */}
        {[-3.2, 3.2].map((z) => (
          <mesh key={z} position={[1.5, 2.6, z]} castShadow>
            <boxGeometry args={[0.25, 5.2, 0.25]} />
            <meshStandardMaterial {...STEEL} />
          </mesh>
        ))}
        <mesh position={[1.5, 5.1, 0]} castShadow>
          <boxGeometry args={[0.25, 0.25, 6.6]} />
          <meshStandardMaterial {...STEEL} />
        </mesh>
        <Fence halfX={5} halfZ={5} />
      </group>
    </group>
  );
}

/** Chain-link style fence: instanced posts and three wire rails. */
function Fence({ halfX, halfZ }: { halfX: number; halfZ: number }) {
  const spots = useMemo(() => {
    const out: THREE.Vector3[] = [];
    const step = 2.5;
    for (let x = -halfX; x <= halfX + 0.01; x += step) out.push(v(x, 0, -halfZ), v(x, 0, halfZ));
    for (let z = -halfZ + step; z < halfZ; z += step) out.push(v(-halfX, 0, z), v(halfX, 0, z));
    return out;
  }, [halfX, halfZ]);
  const posts = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = new THREE.Matrix4();
    spots.forEach((p, i) => {
      m.makeTranslation(p.x, 0.9, p.z);
      posts.current?.setMatrixAt(i, m);
    });
    if (posts.current) posts.current.instanceMatrix.needsUpdate = true;
  }, [spots]);
  const rails = [0.4, 1.1, 1.75];
  return (
    <group>
      <instancedMesh ref={posts} args={[undefined, undefined, spots.length]} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 1.8, 6]} />
        <meshStandardMaterial {...STEEL} />
      </instancedMesh>
      {rails.map((y) => (
        <group key={y}>
          {[-halfZ, halfZ].map((z) => (
            <mesh key={z} position={[0, y, z]}>
              <boxGeometry args={[halfX * 2, 0.02, 0.02]} />
              <meshStandardMaterial {...STEEL} />
            </mesh>
          ))}
          {[-halfX, halfX].map((x) => (
            <mesh key={x} position={[x, y, 0]}>
              <boxGeometry args={[0.02, 0.02, halfZ * 2]} />
              <meshStandardMaterial {...STEEL} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
