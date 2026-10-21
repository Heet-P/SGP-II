"use client";

/* eslint-disable react-hooks/immutability --
 * react-three-fiber animates by mutating three.js objects inside useFrame/effects, outside React's render. */

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { DAY, displayHour, farmEnergyMWh, farmPowerMW, HOLO, smooth, v } from "./layout";

/** Page elements the display writes its live numbers into (clock, current output, energy so far). */
export type Readout = React.RefObject<{ clock: HTMLElement | null; power: HTMLElement | null; energy: HTMLElement | null }>;

const { w: W, h: H } = HOLO;
// Chart area inside the display, in display-local units.
const PAD = { left: 1.7, right: 0.7, bottom: 1.1, top: 1.2 };
const CW = W - PAD.left - PAD.right;
const CH = H - PAD.bottom - PAD.top;
const OX = -W / 2 + PAD.left;
const OY = -H / 2 + PAD.bottom;
const MAX_MW = 4;
const SPAN = DAY.end - DAY.start;

const chartX = (hour: number) => OX + ((hour - DAY.start) / SPAN) * CW;
const chartY = (mw: number) => OY + (mw / MAX_MW) * CH;

const BAR_HOURS = Array.from({ length: 25 }, (_, i) => DAY.start + 0.25 + i * 0.5);

/** Grid lines, axis labels and title, drawn once on a transparent canvas laid over the backplate. */
function gridTexture() {
  const PX = 1024;
  const PY = Math.round((PX * H) / W);
  const c = document.createElement("canvas");
  c.width = PX;
  c.height = PY;
  const g = c.getContext("2d")!;
  const sx = (x: number) => ((x + W / 2) / W) * PX;
  const sy = (y: number) => ((H / 2 - y) / H) * PY;
  g.strokeStyle = "rgba(140, 200, 255, 0.22)";
  g.lineWidth = 1.5;
  g.fillStyle = "rgba(190, 225, 255, 0.85)";
  g.font = "600 22px system-ui, sans-serif";
  for (let mw = 0; mw <= MAX_MW; mw++) {
    const y = sy(chartY(mw));
    g.beginPath();
    g.moveTo(sx(OX), y);
    g.lineTo(sx(OX + CW), y);
    g.stroke();
    g.textAlign = "right";
    g.fillText(`${mw} MW`, sx(OX) - 12, y + 7);
  }
  g.textAlign = "center";
  for (const hour of [6, 9, 12, 15, 18]) {
    const x = sx(chartX(hour));
    g.beginPath();
    g.moveTo(x, sy(OY));
    g.lineTo(x, sy(OY) + 10);
    g.stroke();
    g.fillText(`${String(hour).padStart(2, "0")}:00`, x, sy(OY) + 38);
  }
  g.textAlign = "left";
  g.font = "700 24px system-ui, sans-serif";
  g.fillStyle = "rgba(255, 210, 110, 0.95)";
  g.fillText("TODAY · FARM OUTPUT", sx(OX), sy(H / 2) + 46);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const CURVE_VERTEX = /* glsl */ `
  varying float vAlong;
  void main() {
    vAlong = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const CURVE_FRAGMENT = /* glsl */ `
  uniform float uProgress;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying float vAlong;
  void main() {
    if (vAlong > uProgress) discard;
    // Brighter right at the drawing tip.
    float tip = 1.0 + 1.5 * smoothstep(uProgress - 0.04, uProgress, vAlong);
    gl_FragColor = vec4(uColor * tip, uOpacity);
  }
`;

export function EnergyDisplay({ scroll, readout }: { scroll: React.RefObject<number>; readout: Readout }) {
  const group = useRef<THREE.Group>(null);
  const bars = useRef<THREE.InstancedMesh>(null);
  const marker = useRef<THREE.Group>(null);

  const mats = useMemo(() => ({
    plate: new THREE.MeshBasicMaterial({ color: "#081322", transparent: true, opacity: 0, depthWrite: false }),
    grid: new THREE.MeshBasicMaterial({ map: gridTexture(), transparent: true, opacity: 0, depthWrite: false }),
    frame: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.6, 2.4), transparent: true, opacity: 0, toneMapped: false }),
    bar: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 0.72, 0.18), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    curve: new THREE.ShaderMaterial({
      vertexShader: CURVE_VERTEX,
      fragmentShader: CURVE_FRAGMENT,
      uniforms: { uProgress: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0.45, 2.2, 3.6) } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    marker: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.6, 2.8), transparent: true, opacity: 0, toneMapped: false }),
  }), []);

  const curve = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let h = DAY.start; h <= DAY.end + 1e-6; h += 0.1) pts.push(v(chartX(h), chartY(farmPowerMW(h)), 0.12));
    return new THREE.CatmullRomCurve3(pts);
  }, []);

  const barMatrix = useMemo(() => new THREE.Matrix4(), []);
  const barWidth = (CW / BAR_HOURS.length) * 0.62;
  const last = useRef({ clock: "", power: "", energy: "" });

  useEffect(() => {
    // Start every bar flat; useFrame grows them as the clock passes.
    BAR_HOURS.forEach((_, i) => {
      barMatrix.makeScale(barWidth, 0.0001, 0.12);
      bars.current?.setMatrixAt(i, barMatrix);
    });
    if (bars.current) bars.current.instanceMatrix.needsUpdate = true;
  }, [barMatrix, barWidth]);

  useFrame(({ clock }) => {
    const s = scroll.current;
    // Materialises as the measure section arrives, dissolves as the camera pulls away.
    const vis = smooth(0.3, 0.42, s) * (1 - smooth(0.58, 0.68, s));
    const hour = displayHour(s);
    const el = group.current;
    if (!el) return;
    el.visible = vis > 0.002;
    if (!el.visible) return;
    el.scale.set(1, 0.08 + 0.92 * smooth(0, 1, vis), 1);

    const flicker = 0.96 + 0.04 * Math.sin(clock.elapsedTime * 21);
    mats.plate.opacity = 0.62 * vis;
    mats.grid.opacity = vis;
    mats.frame.opacity = vis * flicker;
    mats.bar.opacity = 0.8 * vis;
    mats.curve.uniforms.uOpacity.value = vis;
    mats.curve.uniforms.uProgress.value = (hour - DAY.start) / SPAN;
    mats.marker.opacity = vis * smooth(DAY.start, DAY.start + 0.3, hour);

    BAR_HOURS.forEach((bh, i) => {
      const grown = smooth(bh - 0.25, bh + 0.35, hour);
      const height = Math.max(0.0001, (farmPowerMW(bh) / MAX_MW) * CH * grown);
      barMatrix.makeScale(barWidth, height, 0.12).setPosition(chartX(bh), OY + height / 2, 0);
      bars.current?.setMatrixAt(i, barMatrix);
    });
    if (bars.current) bars.current.instanceMatrix.needsUpdate = true;

    const mw = farmPowerMW(hour);
    if (marker.current) {
      marker.current.position.set(chartX(hour), chartY(mw), 0.14);
      const stem = marker.current.children[1];
      stem.scale.y = Math.max(0.001, chartY(mw) - OY);
      stem.position.y = -(chartY(mw) - OY) / 2;
    }

    // Live numbers in the page text, written only when they change.
    const r = readout.current;
    const minutes = Math.round((hour % 1) * 60) % 60;
    const text = {
      clock: `${String(Math.floor(hour)).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
      power: `${mw.toFixed(2)} MW`,
      energy: `${farmEnergyMWh(hour).toFixed(1)} MWh`,
    };
    (["clock", "power", "energy"] as const).forEach((k) => {
      if (r?.[k] && last.current[k] !== text[k]) {
        r[k]!.textContent = text[k];
        last.current[k] = text[k];
      }
    });
  });

  const frameBars: [number, number, number, number][] = [
    [0, H / 2, W, 0.05], [0, -H / 2, W, 0.05], [-W / 2, 0, 0.05, H], [W / 2, 0, 0.05, H],
  ];

  return (
    <group ref={group} position={HOLO.pos} rotation={[0, HOLO.yaw, 0]} visible={false}>
      <mesh material={mats.plate} renderOrder={5}>
        <planeGeometry args={[W, H]} />
      </mesh>
      <mesh material={mats.grid} position={[0, 0, 0.02]} renderOrder={6}>
        <planeGeometry args={[W, H]} />
      </mesh>
      {frameBars.map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, 0.03]} material={mats.frame}>
          <boxGeometry args={[w, h, 0.04]} />
        </mesh>
      ))}
      <instancedMesh ref={bars} args={[undefined, mats.bar, BAR_HOURS.length]} renderOrder={7}>
        <boxGeometry />
      </instancedMesh>
      <mesh material={mats.curve} renderOrder={8}>
        <tubeGeometry args={[curve, 240, 0.06, 8]} />
      </mesh>
      <group ref={marker}>
        <mesh material={mats.marker}>
          <sphereGeometry args={[0.16, 16, 16]} />
        </mesh>
        <mesh material={mats.marker}>
          <boxGeometry args={[0.03, 1, 0.03]} />
        </mesh>
      </group>
    </group>
  );
}
