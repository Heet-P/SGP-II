"use client";

/* eslint-disable react-hooks/immutability --
 * react-three-fiber animates by mutating three.js objects inside useFrame/effects, outside React's render. */

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  CABLE, conductorCurve, gridFront, HERO_PANELS, FARM, LINE_LENGTHS, ROUTES, seeded, smooth, sunDirection, sunElevation, TRUNK, v,
} from "./layout";
import { dotTexture, NOISE_GLSL } from "./textures";

const CYAN = new THREE.Color(0.35, 2.2, 4.2);

/** A cylinder from a to b, for building lattice towers. */
function strut(a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const dir = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r, r, dir.length(), 5, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), dir.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/** Steel lattice transmission tower: tapered legs, X-bracing, two cross-arms and insulators. */
function towerGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const H = 7.6;
  const corner = (y: number, sx: number, sz: number) => {
    const w = THREE.MathUtils.lerp(0.95, 0.3, y / H);
    return v(sx * w, y, sz * w);
  };
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  corners.forEach(([sx, sz]) => parts.push(strut(corner(0, sx, sz), corner(H, sx, sz), 0.05)));
  const levels = [0, 1.9, 3.8, 5.7, H];
  for (let l = 0; l < levels.length - 1; l++) {
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k];
      const [bx, bz] = corners[(k + 1) % 4];
      parts.push(strut(corner(levels[l], ax, az), corner(levels[l + 1], bx, bz), 0.025));
      parts.push(strut(corner(levels[l], bx, bz), corner(levels[l + 1], ax, az), 0.025));
      parts.push(strut(corner(levels[l + 1], ax, az), corner(levels[l + 1], bx, bz), 0.025));
    }
  }
  parts.push(new THREE.BoxGeometry(3.4, 0.14, 0.14).translate(0, 7.25, 0));
  parts.push(strut(v(-1.7, 7.25, 0), v(-0.3, H, 0), 0.03), strut(v(1.7, 7.25, 0), v(0.3, H, 0), 0.03));
  parts.push(strut(v(0, H, 0), v(0, 8.35, 0), 0.06));
  parts.push(new THREE.BoxGeometry(0.9, 0.12, 0.12).translate(0, 8.3, 0));
  // Insulator strings where the conductors hang.
  for (const [x, y] of [[-1.5, 7.25], [0, 8.3], [1.5, 7.25]]) {
    parts.push(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 8).translate(x, y - 0.22, 0));
  }
  return mergeGeometries(parts)!;
}

export function PowerGrid({ progress }: { progress: React.RefObject<number> }) {
  const tower = useMemo(() => towerGeometry(), []);
  const pylons = useMemo(() => ROUTES.flatMap((r) => r.pylons), []);
  const curves = useMemo(() => ROUTES.map((r) => [0, 1, 2].map((w) => conductorCurve(r, w))), []);
  const ends = useMemo(() => ROUTES.map((r) => r.supports[r.supports.length - 1][1]), []);

  const towers = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = new THREE.Matrix4();
    pylons.forEach((p, i) => {
      m.compose(p.pos, new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), p.yaw), v(1, 1, 1));
      towers.current?.setMatrixAt(i, m);
    });
    if (towers.current) towers.current.instanceMatrix.needsUpdate = true;
  }, [pylons]);

  // One material per line so each energises as the current front passes along it.
  const wireMats = useMemo(() => ROUTES.map(() => new THREE.MeshStandardMaterial({
    color: "#40444c", metalness: 0.85, roughness: 0.35, emissive: new THREE.Color(0.2, 0.9, 1.6), emissiveIntensity: 0,
  })), []);
  useFrame(() => {
    const front = gridFront(progress.current);
    wireMats.forEach((m) => { m.emissiveIntensity = 0.7 * smooth(0, 10, front); });
  });

  return (
    <group>
      <instancedMesh ref={towers} args={[tower, undefined, pylons.length]} castShadow receiveShadow>
        <meshStandardMaterial color="#9aa1aa" metalness={0.85} roughness={0.42} />
      </instancedMesh>
      {curves.map((wires, r) => wires.map((curve, w) => (
        <mesh key={`${r}-${w}`} material={wireMats[r]}>
          <tubeGeometry args={[curve, Math.ceil(curve.getLength() * 3), 0.028, 5]} />
        </mesh>
      )))}
      {/* Pole-mounted transformer where each line reaches its society. */}
      {ends.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <mesh position={[0, 2.4, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.16, 4.8, 8]} />
            <meshStandardMaterial color="#6d6a64" roughness={0.8} />
          </mesh>
          <mesh position={[0, 3.2, 0.32]} castShadow>
            <cylinderGeometry args={[0.32, 0.32, 0.8, 12]} />
            <meshStandardMaterial color="#8f989c" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      ))}
      <SunBeams progress={progress} />
      <LocalStream progress={progress} />
      <GridStream progress={progress} curves={curves} />
    </group>
  );
}

function usePoints(count: number) {
  return useMemo(() => ({ positions: new Float32Array(count * 3), colors: new Float32Array(count * 3) }), [count]);
}

// Night: no particles at all; the lit wires and windows show the power instead.
const nightFade = (s: number) => 1 - smooth(0.8, 0.9, s);

/**
 * Sunlight as volumetric shafts (the Tyndall effect): soft columns of lit haze along the sun's
 * direction, brightest in the core and fading at the edges and toward the sky, with slow bands
 * of light drifting down them. Dust motes drift inside the beams and catch the light.
 * Visible in the first two beats only.
 */
const BEAM_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vViewPos;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const BEAM_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uSeed;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying vec3 vViewPos;
  varying vec3 vNormal;
  ${NOISE_GLSL}
  void main() {
    // Facing ratio: the beam's core (seen straight through) is bright, its silhouette fades out.
    float facing = abs(dot(normalize(vNormal), normalize(-vViewPos)));
    float core = pow(facing, 2.2);
    // Fade in just above the panels; the beam runs back toward the sun, past the edge of the frame,
    // and only dissolves far away, so it never looks like it starts in mid-air.
    float along = smoothstep(0.0, 0.01, vUv.y) * (1.0 - smoothstep(0.82, 1.0, vUv.y));
    // Slow bands of brighter haze flowing down the beam, plus faint lengthwise striations.
    float flow = 0.55 + 0.45 * fbm(vec2(uSeed, vUv.y * 14.0 + uTime * 0.22));
    float rays = 0.8 + 0.2 * sin(vUv.x * 6.2831853 * 5.0 + uSeed * 3.0);
    float a = uIntensity * core * along * flow * rays;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// A 4 × 3 grid of overlapping shafts so sunlight falls on every row of the farm.
const BEAMS = [-11.5, -4, 3.5, 11.5].flatMap((x, i) => [-8.5, 0, 8.5].map((z, j) => ({
  at: [x + ((i + j) % 2 ? 0.8 : -0.6), z + (i % 2 ? 0.7 : -0.5)],
  r: 2.5 + ((i * 3 + j) % 4) * 0.25,
  k: 0.34 + ((i + 2 * j) % 3) * 0.06,
})));
const BEAM_LENGTH = 200;

function SunBeams({ progress }: { progress: React.RefObject<number> }) {
  // Shared by every beam material, advanced each frame.
  const time = useMemo(() => ({ value: 0 }), []);
  const beams = useMemo(() => BEAMS.map((b, i) => ({
    target: v(b.at[0], FARM.height + 0.05, b.at[1]),
    material: new THREE.ShaderMaterial({
      vertexShader: BEAM_VERTEX,
      fragmentShader: BEAM_FRAGMENT,
      uniforms: {
        uTime: time,
        uIntensity: { value: 0 },
        uSeed: { value: i * 7.3 },
        uColor: { value: new THREE.Color(1.0, 0.86, 0.62) },
      },
      transparent: true,
      depthWrite: false,
      // Haze glows in front of whatever is behind it, so the far hills don't cut the shafts off
      // and they stream all the way out of the top-left of the frame.
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
    // Slightly wider toward the sky, like light spreading through haze.
    geometry: new THREE.CylinderGeometry(b.r * 1.7, b.r, BEAM_LENGTH, 40, 1, true).translate(0, BEAM_LENGTH / 2, 0),
    strength: b.k,
  })), [time]);

  // Dust motes suspended in the lower part of each beam.
  const MOTES = 520;
  const motes = useMemo(() => {
    const rand = seeded(42);
    return {
      beam: Uint8Array.from({ length: MOTES }, () => Math.floor(rand() * BEAMS.length)),
      h: Float32Array.from({ length: MOTES }, () => rand() * 12),
      ang: Float32Array.from({ length: MOTES }, () => rand() * Math.PI * 2),
      rad: Float32Array.from({ length: MOTES }, () => Math.sqrt(rand()) * 0.85),
      phase: Float32Array.from({ length: MOTES }, () => rand() * 10),
      positions: new Float32Array(MOTES * 3),
      colors: new Float32Array(MOTES * 3),
    };
  }, []);

  const group = useRef<THREE.Group>(null);
  const moteGeom = useRef<THREE.BufferGeometry>(null);
  const tex = useMemo(() => dotTexture(), []);
  const tmp = useMemo(() => ({
    sun: new THREE.Vector3(), q: new THREE.Quaternion(), side: new THREE.Vector3(), up: new THREE.Vector3(), p: new THREE.Vector3(),
  }), []);

  useFrame(({ clock }, dt) => {
    const s = progress.current;
    time.value += dt;
    const visible = smooth(-2, 6, sunElevation(s)) * (1 - smooth(0.48, 0.66, s));
    sunDirection(s, tmp.sun);
    tmp.q.setFromUnitVectors(v(0, 1, 0), tmp.sun);

    group.current?.children.forEach((child, i) => {
      const b = beams[i];
      child.position.copy(b.target);
      child.quaternion.copy(tmp.q);
      // Each beam breathes gently, as if thin clouds were drifting past the sun.
      const breathe = 0.82 + 0.18 * Math.sin(clock.elapsedTime * 0.35 + i * 1.7);
      b.material.uniforms.uIntensity.value = 0.75 * b.strength * breathe * visible;
    });

    // Basis perpendicular to the beam axis, for placing motes around it.
    tmp.side.set(1, 0, 0).applyQuaternion(tmp.q);
    tmp.up.set(0, 0, 1).applyQuaternion(tmp.q);
    const step = Math.min(dt, 0.05);
    for (let i = 0; i < MOTES; i++) {
      const b = BEAMS[motes.beam[i]];
      let h = motes.h[i] - step * 0.35; // settle slowly down the beam
      if (h < 0) h += 12;
      motes.h[i] = h;
      const t = clock.elapsedTime * 0.3 + motes.phase[i];
      const r = motes.rad[i] * b.r;
      const a = motes.ang[i] + Math.sin(t) * 0.25;
      tmp.p.copy(beams[motes.beam[i]].target)
        .addScaledVector(tmp.sun, h)
        .addScaledVector(tmp.side, Math.cos(a) * r)
        .addScaledVector(tmp.up, Math.sin(a) * r + Math.sin(t * 1.7) * 0.05);
      const twinkle = 0.6 + 0.4 * Math.sin(t * 2.3);
      const fade = smooth(0, 1.5, h) * (1 - smooth(9, 12, h));
      const k = 1.3 * visible * twinkle * fade;
      motes.positions.set([tmp.p.x, tmp.p.y, tmp.p.z], i * 3);
      motes.colors.set([k, k * 0.88, k * 0.66], i * 3);
    }
    if (moteGeom.current) {
      moteGeom.current.attributes.position.needsUpdate = true;
      moteGeom.current.attributes.color.needsUpdate = true;
    }
  });

  return (
    <group>
      <group ref={group}>
        {beams.map((b, i) => (
          <mesh key={i} geometry={b.geometry} material={b.material} frustumCulled={false} renderOrder={10} />
        ))}
      </group>
      <points frustumCulled={false}>
        <bufferGeometry ref={moteGeom}>
          <bufferAttribute attach="attributes-position" args={[motes.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[motes.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.07} map={tex} vertexColors transparent depthWrite={false}
          blending={THREE.AdditiveBlending} sizeAttenuation />
      </points>
    </group>
  );
}

/** Current leaving the hero panels: through the combiner cable and inverter to the substation. */
function LocalStream({ progress }: { progress: React.RefObject<number> }) {
  const N = 260;
  const buf = usePoints(N);
  const sim = useMemo(() => {
    const rand = seeded(43);
    const rot = new THREE.Euler(FARM.tilt, 0, 0);
    return {
      t: Float32Array.from({ length: N }, () => rand()),
      speed: Float32Array.from({ length: N }, () => 0.12 + rand() * 0.08),
      starts: Array.from({ length: N }, () => {
        const local = v((rand() - 0.5) * 2, 0.05, (rand() - 0.5) * 1.1).applyEuler(rot);
        return HERO_PANELS[Math.floor(rand() * HERO_PANELS.length)].clone().add(local);
      }),
    };
  }, []);
  const geom = useRef<THREE.BufferGeometry>(null);
  const tex = useMemo(() => dotTexture(), []);
  const p = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const s = progress.current;
    // Appears once the beams have been striking the panels, gone by nightfall.
    const visible = smooth(0.22, 0.36, s) * nightFade(s);
    const step = Math.min(dt, 0.05);
    for (let i = 0; i < N; i++) {
      let t = sim.t[i] + step * sim.speed[i];
      if (t > 1) t -= 1;
      sim.t[i] = t;
      if (t < 0.2) p.lerpVectors(sim.starts[i], CABLE.points[0], t / 0.2);
      else if (t < 0.45) CABLE.getPointAt((t - 0.2) / 0.25, p);
      else TRUNK.getPointAt((t - 0.45) / 0.55, p);
      const b = visible * smooth(0, 0.05, t) * (1 - smooth(0.95, 1, t));
      buf.positions.set([p.x, p.y, p.z], i * 3);
      buf.colors.set([CYAN.r * b, CYAN.g * b, CYAN.b * b], i * 3);
    }
    if (geom.current) {
      geom.current.attributes.position.needsUpdate = true;
      geom.current.attributes.color.needsUpdate = true;
    }
  });

  return (
    <points frustumCulled={false}>
      <bufferGeometry ref={geom}>
        <bufferAttribute attach="attributes-position" args={[buf.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[buf.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.16} map={tex} vertexColors transparent depthWrite={false}
        blending={THREE.AdditiveBlending} toneMapped={false} sizeAttenuation />
    </points>
  );
}

/** Current pulses along every conductor: they thin out in the last beat and vanish at night. */
function GridStream({ progress, curves }: { progress: React.RefObject<number>; curves: THREE.CatmullRomCurve3[][] }) {
  const N = 720;
  const buf = usePoints(N);
  const sim = useMemo(() => {
    const rand = seeded(77);
    return {
      route: Uint8Array.from({ length: N }, (_, i) => i % ROUTES.length),
      wire: Uint8Array.from({ length: N }, (_, i) => Math.floor(i / ROUTES.length) % 3),
      d: Float32Array.from({ length: N }, () => rand() * 4),
      speed: Float32Array.from({ length: N }, () => 9 + rand() * 6),
      // Order in which particles drop out as the stream thins.
      rank: Float32Array.from({ length: N }, () => rand()),
    };
  }, []);
  const geom = useRef<THREE.BufferGeometry>(null);
  const tex = useMemo(() => dotTexture(), []);
  const p = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const s = progress.current;
    const front = gridFront(s);
    const density = 1 - 0.65 * smooth(0.64, 0.78, s);
    const fade = nightFade(s);
    const step = Math.min(dt, 0.05);
    for (let i = 0; i < N; i++) {
      const r = sim.route[i];
      const len = LINE_LENGTHS[r];
      const limit = Math.min(front, len);
      let d = sim.d[i] + step * sim.speed[i];
      if (d > limit) d = Math.random() * 2;
      sim.d[i] = d;
      curves[r][sim.wire[i]].getPointAt(THREE.MathUtils.clamp(d / len, 0, 1), p);
      const active = sim.rank[i] < density ? 1 : 0;
      const bright = limit > 0.5 ? smooth(0, 1.5, d) * active * fade : 0;
      buf.positions.set([p.x, p.y, p.z], i * 3);
      buf.colors.set([CYAN.r * bright, CYAN.g * bright, CYAN.b * bright], i * 3);
    }
    if (geom.current) {
      geom.current.attributes.position.needsUpdate = true;
      geom.current.attributes.color.needsUpdate = true;
    }
  });

  return (
    <points frustumCulled={false}>
      <bufferGeometry ref={geom}>
        <bufferAttribute attach="attributes-position" args={[buf.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[buf.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.45} map={tex} vertexColors transparent depthWrite={false}
        blending={THREE.AdditiveBlending} toneMapped={false} sizeAttenuation />
    </points>
  );
}
