"use client";

/* eslint-disable react-hooks/immutability --
 * react-three-fiber animates by mutating three.js objects inside useFrame/effects, outside React's render. */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, SMAA, Vignette } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";

import { PowerGrid } from "./scene/Grid";
import { EnergyDisplay, type Readout } from "./scene/EnergyDisplay";
import { KEYS, smooth, storyTime, sunDirection, sunElevation, v } from "./scene/layout";
import { Societies } from "./scene/Societies";
import { SolarFarm } from "./scene/SolarFarm";
import { Grass, Ground, Roads, Trees } from "./scene/Terrain";

/*
 * Scroll-driven story, one camera keyframe per page section:
 *   hero      afternoon sun streaming onto a solar farm, seen from a 45° elevated angle
 *   capture   close in on the panels: sunlight becomes current and runs to the substation
 *   measure   a floating display plays back the day's generation, 06:00 → 18:30
 *   transmit  pull back at dusk as current runs down six lines
 *   deliver   the societies light up as the current reaches them
 * `progress` is the page scroll (0–1) from Lenis. See scene/layout.ts for scroll vs story time.
 */

type Labels = React.RefObject<(HTMLDivElement | null)[]>;
type Ref = React.RefObject<number>;

const FOG = [new THREE.Color("#cbd9e6"), new THREE.Color("#e6b892"), new THREE.Color("#252b45")];
const SUN_WARM = new THREE.Color("#ffb46b");
const SUN_WHITE = new THREE.Color("#fff3e2");
const SHADOW_CENTER = v(8, 0, 2);

function configureSky(sky: Sky) {
  const u = sky.material.uniforms;
  u.turbidity.value = 3.4;
  u.rayleigh.value = 1.5;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.86;
}

/**
 * Physical sky, sun light, fog, exposure and the camera path.
 * Writes the eased scroll (camera, energy display) and the story time derived from it (everything else).
 */
function Atmosphere({ progress, scroll, story }: { progress: Ref; scroll: Ref; story: Ref }) {
  const { gl, scene } = useThree();
  const sky = useMemo(() => {
    const s = new Sky();
    s.scale.setScalar(1800);
    configureSky(s);
    return s;
  }, []);
  // A second sky in its own scene is baked into the environment map, so glass, metal and
  // windows reflect the actual sky. It is re-baked only when the sun has moved noticeably.
  const env = useMemo(() => {
    const envScene = new THREE.Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(900);
    configureSky(envSky);
    envScene.add(envSky);
    return { scene: envScene, sky: envSky, pmrem: new THREE.PMREMGenerator(gl), target: null as THREE.WebGLRenderTarget | null, last: 999 };
  }, [gl]);
  useEffect(() => () => {
    env.target?.dispose();
    env.pmrem.dispose();
  }, [env]);

  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const tmp = useMemo(() => ({ sun: new THREE.Vector3(), pos: new THREE.Vector3(), look: new THREE.Vector3(), color: new THREE.Color() }), []);

  useFrame(({ camera, clock }, dt) => {
    scroll.current += (progress.current - scroll.current) * (1 - Math.exp(-dt * 4));
    story.current = storyTime(scroll.current);
    const s = story.current;

    // Camera glides between the five section keyframes with a slight handheld drift.
    const seg = Math.min(scroll.current * (KEYS.length - 1), KEYS.length - 1.0001);
    const i = Math.floor(seg);
    const f = smooth(0, 1, seg - i);
    tmp.pos.lerpVectors(KEYS[i].pos, KEYS[i + 1].pos, f);
    tmp.look.lerpVectors(KEYS[i].look, KEYS[i + 1].look, f);
    const t = clock.elapsedTime * 0.2;
    tmp.pos.x += Math.sin(t) * 0.2;
    tmp.pos.y += Math.cos(t * 1.3) * 0.1;
    camera.position.copy(tmp.pos);
    camera.lookAt(tmp.look);

    const elevation = sunElevation(s);
    const dir = sunDirection(s, tmp.sun);
    sky.material.uniforms.sunPosition.value.copy(dir);
    if (Math.abs(elevation - env.last) > 0.6) {
      env.sky.material.uniforms.sunPosition.value.copy(dir);
      const next = env.pmrem.fromScene(env.scene, 0, 0.1, 2000);
      env.target?.dispose();
      env.target = next;
      scene.environment = next.texture;
      env.last = elevation;
    }

    const day = smooth(-3, 10, elevation);
    if (sun.current) {
      sun.current.position.copy(dir).multiplyScalar(140).add(SHADOW_CENTER);
      sun.current.target.position.copy(SHADOW_CENTER);
      sun.current.target.updateMatrixWorld();
      sun.current.intensity = 3.4 * smooth(-1.5, 6, elevation);
      sun.current.color.copy(SUN_WARM).lerp(SUN_WHITE, smooth(4, 16, elevation));
    }
    // Dusky blue fill keeps the ground readable once the sun has set.
    if (hemi.current) hemi.current.intensity = 0.4 - 0.1 * day;
    scene.environmentIntensity = 0.3 + 0.7 * day;
    gl.toneMappingExposure = THREE.MathUtils.lerp(1.0, 0.42, day);

    if (s < 0.45) tmp.color.copy(FOG[0]).lerp(FOG[1], smooth(0, 0.45, s));
    else tmp.color.copy(FOG[1]).lerp(FOG[2], smooth(0.45, 0.88, s));
    if (scene.fog) (scene.fog as THREE.FogExp2).color.copy(tmp.color);
  });

  return (
    <>
      <primitive object={sky} />
      <fogExp2 attach="fog" args={["#cbd9e6", 0.0038]} />
      <hemisphereLight ref={hemi} args={["#9fb4e0", "#2d3522", 0.4]} />
      <directionalLight ref={sun} castShadow intensity={3.4}
        shadow-mapSize={[4096, 4096]} shadow-camera-left={-48} shadow-camera-right={48}
        shadow-camera-top={48} shadow-camera-bottom={-48} shadow-camera-near={1} shadow-camera-far={320}
        shadow-bias={-0.00025} shadow-normalBias={0.03} />
    </>
  );
}

function World({ progress, labels, readout }: { progress: Ref; labels: Labels; readout: Readout }) {
  const scroll = useRef(0);
  const story = useRef(0);
  return (
    <>
      <Atmosphere progress={progress} scroll={scroll} story={story} />
      <Ground />
      <Roads />
      <Grass />
      <Trees />
      <SolarFarm progress={story} />
      <PowerGrid progress={story} />
      <Societies progress={story} labels={labels} />
      <EnergyDisplay scroll={scroll} readout={readout} />
    </>
  );
}

export default function Scene({ progress, labels, readout }: { progress: Ref; labels: Labels; readout: Readout }) {
  return (
    <Canvas shadows="percentage" dpr={[1, 1.5]}
      camera={{ fov: 58, near: 0.1, far: 4000, position: KEYS[0].pos.toArray() }}
      gl={{ antialias: false, powerPreference: "high-performance" }}>
      <World progress={progress} labels={labels} readout={readout} />
      <EffectComposer multisampling={0}>
        <N8AO aoRadius={1.8} intensity={2.4} distanceFalloff={1.2} halfRes quality="medium" />
        {/* High threshold: only energy particles, LEDs and lit windows glow, not the bright sky. */}
        <Bloom mipmapBlur luminanceThreshold={1.5} intensity={0.9} radius={0.6} />
        <SMAA />
        <Vignette eskil={false} offset={0.25} darkness={0.55} />
      </EffectComposer>
    </Canvas>
  );
}
