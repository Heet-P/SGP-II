"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { blocked, FARM, ROADS, seeded, SOCIETIES, SOCIETY_HALF, v } from "./layout";
import { NOISE_GLSL, roadTexture } from "./textures";

// Linear-space colours (the shader works after sRGB decoding).
const GROUND_GLSL = /* glsl */ `
  vec2 p = vWorld.xz;
  float n = fbm(p * 0.045);
  float detail = fbm(p * 0.7 + 3.1);
  vec3 lush = vec3(0.030, 0.068, 0.012);
  vec3 fresh = vec3(0.070, 0.120, 0.022);
  vec3 dry = vec3(0.200, 0.165, 0.065);
  vec3 col = mix(lush, fresh, smoothstep(0.3, 0.72, n));
  col = mix(col, dry, smoothstep(0.55, 0.78, fbm(p * 0.016 + 7.0)) * 0.75);
  col *= 0.8 + 0.4 * detail;
  // Gravel service paths between the panel rows.
  float inFarm = step(abs(p.x), ${(FARM.cols * FARM.dx) / 2 + 1.2}) * step(abs(p.y), ${(FARM.rows * FARM.dz) / 2});
  float lane = 1.0 - smoothstep(0.07, 0.12, abs(fract(p.y / ${FARM.dz}) - 0.5));
  vec3 gravel = vec3(0.16, 0.15, 0.13) * (0.75 + 0.5 * fbm(p * 2.5));
  col = mix(col, gravel, inFarm * lane);
  diffuseColor.rgb = col;
`;

/** MeshStandardMaterial with procedural grass/soil colour from world-space noise (no tiling). */
function groundMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
      .replace("#include <fog_vertex>", "#include <fog_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vWorld;\n${NOISE_GLSL}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${GROUND_GLSL}`);
  };
  return m;
}

export function Ground() {
  const mat = useMemo(() => groundMaterial(), []);
  // Rolling hills on the horizon share the ground shader and fade into the haze.
  const hills = useMemo(() => {
    const rand = seeded(5);
    return Array.from({ length: 11 }, (_, i) => {
      const a = (i / 11) * Math.PI * 2 + rand() * 0.4;
      const r = 230 + rand() * 120;
      return { pos: v(Math.cos(a) * r, -8, Math.sin(a) * r), scale: v(70 + rand() * 80, 22 + rand() * 30, 60 + rand() * 60) };
    });
  }, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={mat}>
        <planeGeometry args={[1200, 1200, 1, 1]} />
      </mesh>
      {hills.map((h, i) => (
        <mesh key={i} position={h.pos} scale={h.scale} material={mat}>
          <sphereGeometry args={[1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      ))}
    </group>
  );
}

/** Tens of thousands of instanced blades that sway in the wind (vertex shader). */
export function Grass() {
  const COUNT = 70000;
  const time = useRef({ value: 0 });

  const geometry = useMemo(() => {
    const segs = 4;
    const pos: number[] = [];
    const h: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const w = 0.045 * (1 - t * 0.85);
      pos.push(-w, t, 0, w, t, 0);
      h.push(t, t);
    }
    const index: number[] = [];
    for (let i = 0; i < segs; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    // Upward normals light blades like the ground beneath them, avoiding dark back faces.
    g.setAttribute("normal", new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute("bladeH", new THREE.Float32BufferAttribute(h, 1));
    g.setIndex(index);
    return g;
  }, []);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85 });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time.current;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;\nattribute float bladeH;\nvarying float vH;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          vec3 root = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
          float gust = sin(uTime * 1.3 + root.x * 0.11 + root.z * 0.07) * 0.6 + 0.4;
          float sway = sin(uTime * 2.4 + root.x * 0.8 + root.z * 0.5) * 0.35 + gust;
          transformed.x += sway * 0.16 * bladeH * bladeH;
          transformed.z += sway * 0.05 * bladeH * bladeH;
          vH = bladeH;`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vH;")
        .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= mix(0.32, 1.08, vH);");
    };
    return m;
  }, []);

  const mesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const el = mesh.current;
    if (!el) return;
    const rand = seeded(21);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    let i = 0;
    while (i < COUNT) {
      // Densest where the opening shots look: around the farm's front-right corner.
      const x = -24 + rand() * 66;
      const z = -20 + rand() * 56;
      if (blocked(x, z, 0, true)) continue;
      q.setFromAxisAngle(v(0, 1, 0), rand() * Math.PI);
      const s = 0.22 + rand() * 0.3;
      m.compose(v(x, 0, z), q, v(1, s, 1));
      el.setMatrixAt(i, m);
      c.setRGB(0.04 + rand() * 0.04, 0.11 + rand() * 0.08, 0.015 + rand() * 0.02);
      if (rand() > 0.95) c.setRGB(0.17, 0.15, 0.05); // occasional dry blade
      el.setColorAt(i, c);
      i++;
    }
    el.instanceMatrix.needsUpdate = true;
    if (el.instanceColor) el.instanceColor.needsUpdate = true;
  }, []);

  useFrame((_, dt) => {
    time.current.value += dt;
  });

  return <instancedMesh ref={mesh} args={[geometry, material, COUNT]} receiveShadow frustumCulled={false} />;
}

/** Broadleaf and conifer trees, scattered in loose clumps plus a few inside each society. */
export function Trees() {
  const { broadleaf, conifer, trunk } = useMemo(() => {
    const rand = seeded(3);
    const blob = (r: number, x: number, y: number, z: number) => {
      const g = new THREE.IcosahedronGeometry(r, 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const k = 1 + (Math.sin(p.getX(i) * 4.1 + p.getY(i) * 3.3) * 0.08 + (rand() - 0.5) * 0.12);
        p.setXYZ(i, p.getX(i) * k + x, p.getY(i) * k + y, p.getZ(i) * k + z);
      }
      return g;
    };
    const broad = mergeGeometries([blob(1.5, 0, 3.4, 0), blob(1.1, 0.9, 2.9, 0.3), blob(1.15, -0.7, 3.0, -0.5), blob(0.95, 0.1, 4.4, 0.2)])!;
    broad.computeVertexNormals();
    const cone = (r: number, h: number, y: number) => new THREE.ConeGeometry(r, h, 9, 1).translate(0, y, 0);
    const con = mergeGeometries([cone(1.3, 2.4, 2.2), cone(1.0, 2.1, 3.5), cone(0.7, 1.8, 4.7)])!;
    con.computeVertexNormals();
    const tr = new THREE.CylinderGeometry(0.12, 0.2, 2.6, 6).translate(0, 1.3, 0);
    return { broadleaf: broad, conifer: con, trunk: tr };
  }, []);

  const spots = useMemo(() => {
    const rand = seeded(17);
    const out: { x: number; z: number; s: number; kind: number; rot: number }[] = [];
    let tries = 0;
    while (out.length < 420 && tries < 30000) {
      tries++;
      const a = rand() * Math.PI * 2;
      const r = 20 + Math.sqrt(rand()) * 150;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // Clumping: keep candidates where a low-frequency pattern is high.
      if (Math.sin(x * 0.07) * Math.cos(z * 0.06) + Math.sin((x + z) * 0.03) < -0.2) continue;
      if (blocked(x, z, 1.5)) continue;
      out.push({ x, z, s: 0.8 + rand() * 0.7, kind: rand() > 0.72 ? 1 : 0, rot: rand() * Math.PI * 2 });
    }
    // A few trees inside each society compound.
    SOCIETIES.forEach((soc) => {
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        out.push({ x: soc.pos.x + dx * (SOCIETY_HALF - 1.6), z: soc.pos.z + dz * (SOCIETY_HALF - 1.6), s: 0.7, kind: 0, rot: rand() * 6 });
      }
    });
    return out;
  }, []);

  const material = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }), []);
  const trunkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#4a3626", roughness: 1 }), []);
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);

  useEffect(() => {
    const rand = seeded(29);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const counters = [0, 0, 0];
    spots.forEach((t) => {
      m.compose(v(t.x, 0, t.z), new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), t.rot), v(t.s, t.s * (0.9 + rand() * 0.3), t.s));
      const canopy = refs.current[t.kind];
      const tr = refs.current[2];
      if (canopy) {
        canopy.setMatrixAt(counters[t.kind], m);
        if (t.kind === 0) c.setRGB(0.035 + rand() * 0.04, 0.075 + rand() * 0.05, 0.012 + rand() * 0.015);
        else c.setRGB(0.02 + rand() * 0.015, 0.05 + rand() * 0.025, 0.025 + rand() * 0.01);
        canopy.setColorAt(counters[t.kind], c);
        counters[t.kind]++;
      }
      if (tr) tr.setMatrixAt(counters[2]++, m);
    });
    refs.current.forEach((el, i) => {
      if (!el) return;
      el.count = counters[i];
      el.instanceMatrix.needsUpdate = true;
      if (el.instanceColor) el.instanceColor.needsUpdate = true;
    });
  }, [spots]);

  return (
    <group>
      <instancedMesh ref={(el) => { refs.current[0] = el; }} args={[broadleaf, material, spots.length]} castShadow receiveShadow />
      <instancedMesh ref={(el) => { refs.current[1] = el; }} args={[conifer, material, spots.length]} castShadow receiveShadow />
      <instancedMesh ref={(el) => { refs.current[2] = el; }} args={[trunk, trunkMat, spots.length]} castShadow />
    </group>
  );
}

export function Roads() {
  const tex = useMemo(() => roadTexture(), []);
  return (
    <group>
      {ROADS.map((r, i) => {
        const dx = r.to[0] - r.from[0];
        const dz = r.to[1] - r.from[1];
        const length = Math.hypot(dx, dz);
        const t = tex.clone();
        t.repeat.set(1, length / 14);
        return (
          <mesh key={i} position={[(r.from[0] + r.to[0]) / 2, 0.02, (r.from[1] + r.to[1]) / 2]}
            rotation={[-Math.PI / 2, 0, Math.atan2(dx, dz)]} receiveShadow>
            <planeGeometry args={[r.width, length]} />
            <meshStandardMaterial map={t} roughness={0.92} />
          </mesh>
        );
      })}
    </group>
  );
}
