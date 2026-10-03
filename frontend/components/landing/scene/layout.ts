import * as THREE from "three";

import { SOCIETY_LABELS } from "../labels";

/*
 * World layout for the landing scene (1 unit ≈ 1 m, loosely). The solar farm sits at the
 * origin, a substation on its east side, and power lines run out in six directions to
 * six housing societies. Everything that has to line up across components lives here.
 */

export const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Small seeded PRNG (mulberry32): deterministic layouts keep render pure. */
export function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const smooth = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------ solar farm

export const FARM = { rows: 9, cols: 14, dx: 2.35, dz: 3.1, tilt: 0.5, height: 1.05 };
export const FARM_HALF = { x: ((FARM.cols - 1) * FARM.dx) / 2 + 1.6, z: ((FARM.rows - 1) * FARM.dz) / 2 + 1.6 };

export const PANELS: THREE.Vector3[] = [];
for (let r = 0; r < FARM.rows; r++) {
  for (let c = 0; c < FARM.cols; c++) {
    PANELS.push(v((c - (FARM.cols - 1) / 2) * FARM.dx, FARM.height, (r - (FARM.rows - 1) / 2) * FARM.dz));
  }
}
/** Front-right corner of the farm, where the camera watches light turn into current. */
export const HERO_PANELS = PANELS.filter((p) => p.x > 9 && p.z > 5);

export const INVERTER = v(17.6, 0, 13.6);
export const SUBSTATION = v(25, 0, 0);

/** Combiner cable from the hero panels to the inverter, then the trunk cable to the substation. */
export const CABLE = new THREE.CatmullRomCurve3([v(15.4, 0.75, 12.6), v(16.5, 0.12, 13.2), v(17.4, 0.9, 13.2)]);
export const TRUNK = new THREE.CatmullRomCurve3([v(17.6, 0.6, 13.1), v(19.5, 0.08, 10), v(22.5, 0.08, 3), v(23.3, 1.3, -0.6)]);

// ------------------------------------------------------------------ societies and power lines

// Real societies from the project dataset (names live in ../labels.ts, in this order).
const SOCIETY_SPOTS = [
  { pos: v(54, 0, 2), towers: 6 },
  { pos: v(48, 0, -34), towers: 4 },
  { pos: v(6, 0, -46), towers: 5 },
  { pos: v(52, 0, 40), towers: 6 },
  { pos: v(20, 0, 52), towers: 3 },
  { pos: v(-46, 0, -4), towers: 4 },
];
export const SOCIETIES = SOCIETY_LABELS.map((label, i) => ({ ...label, ...SOCIETY_SPOTS[i] }));
export const SOCIETY_HALF = 8;

/** Ground-level waypoints (x, z) of each line, from the substation gantry to a society. */
// Each line ends just outside its society's compound wall (societies are 16 × 16 compounds).
// Lines leave from the substation gantry (x ≈ 26.5).
const ROUTE_WAYPOINTS: [number, number][][] = [
  [[26.5, 0.5], [45, 1.5]],
  [[26.5, -1.5], [39, -25]],
  [[26.5, -2.5], [21, -19], [9, -37]],
  [[26.5, 1.8], [43.5, 31.5]],
  [[26.5, 2.5], [28, 26], [21, 43]],
  [[26.5, -2.5], [24, -17], [-22, -18], [-37, -5]],
];

export interface Pylon {
  pos: THREE.Vector3;
  yaw: number;
}

export interface Route {
  /** Pylons along the line (excluding the substation gantry and the society transformer). */
  pylons: Pylon[];
  /** Three conductor attach points per support, start to end. */
  supports: THREE.Vector3[][];
  society: number;
}

const ATTACH = [v(-1.5, 7.1, 0), v(0, 8.1, 0), v(1.5, 7.1, 0)];
const SPAN = 11;

function sampleRoute(points: [number, number][]) {
  const pts = points.map(([x, z]) => new THREE.Vector2(x, z));
  const lengths = pts.slice(1).map((p, i) => p.distanceTo(pts[i]));
  const total = lengths.reduce((a, b) => a + b, 0);
  const count = Math.max(1, Math.round(total / SPAN));
  const at = (d: number) => {
    let acc = 0;
    for (let i = 0; i < lengths.length; i++) {
      if (d <= acc + lengths[i] || i === lengths.length - 1) {
        const t = (d - acc) / lengths[i];
        return { p: pts[i].clone().lerp(pts[i + 1], t), dir: pts[i + 1].clone().sub(pts[i]).normalize() };
      }
      acc += lengths[i];
    }
    return { p: pts[pts.length - 1], dir: new THREE.Vector2(1, 0) };
  };
  return Array.from({ length: count + 1 }, (_, i) => at((i / count) * total));
}

export const ROUTES: Route[] = ROUTE_WAYPOINTS.map((wp, society) => {
  const samples = sampleRoute(wp);
  const pylons: Pylon[] = samples.slice(1, -1).map(({ p, dir }) => ({
    pos: v(p.x, 0, p.y),
    // Rotating local X by this yaw makes the cross-arm perpendicular to the line.
    yaw: Math.atan2(dir.x, dir.y),
  }));
  const supports = samples.map(({ p, dir }, i) => {
    const yaw = Math.atan2(dir.x, dir.y);
    const isEnd = i === 0 || i === samples.length - 1;
    // The substation gantry and society transformers carry the wires lower than the towers.
    return ATTACH.map((a) => a.clone().multiplyScalar(isEnd ? 0.55 : 1).applyAxisAngle(v(0, 1, 0), yaw).add(v(p.x, 0, p.y)));
  });
  return { pylons, supports, society };
});

/** A sagging conductor between consecutive supports. */
export function conductorCurve(route: Route, wire: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < route.supports.length - 1; i++) {
    const a = route.supports[i][wire];
    const b = route.supports[i + 1][wire];
    const span = a.distanceTo(b);
    for (let k = 0; k < 8; k++) {
      const t = k / 8;
      const p = a.clone().lerp(b, t);
      p.y -= Math.sin(Math.PI * t) * span * 0.045;
      pts.push(p);
    }
  }
  pts.push(route.supports[route.supports.length - 1][wire].clone());
  return new THREE.CatmullRomCurve3(pts);
}

// ------------------------------------------------------------------ roads and clearances

export const ROADS = [
  { from: [-160, 19], to: [180, 19], width: 6 },
  { from: [-60, -140], to: [-60, 140], width: 6 },
];

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = THREE.MathUtils.clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/**
 * True where scenery shouldn't go: farm, substation, roads, societies, line corridors.
 * Grass passes `open: true`: it may grow under the panels and along the corridors.
 */
export function blocked(x: number, z: number, margin = 0, open = false) {
  if (!open && Math.abs(x) < FARM_HALF.x + margin && Math.abs(z) < FARM_HALF.z + margin) return true;
  if (Math.abs(x - SUBSTATION.x) < 5 + margin && Math.abs(z - SUBSTATION.z) < 5 + margin) return true;
  if (ROADS.some((r) => distToSegment(x, z, r.from[0], r.from[1], r.to[0], r.to[1]) < r.width / 2 + 1 + margin)) return true;
  if (SOCIETIES.some((s) => Math.abs(x - s.pos.x) < SOCIETY_HALF + 1 + margin && Math.abs(z - s.pos.z) < SOCIETY_HALF + 1 + margin)) return true;
  return !open && ROUTE_WAYPOINTS.some((wp) => wp.slice(1).some((b, i) => distToSegment(x, z, wp[i][0], wp[i][1], b[0], b[1]) < 2.5 + margin));
}

// ------------------------------------------------------------------ story: camera and sun

/*
 * Two clocks drive the scene:
 *   scroll (0–1): one camera keyframe per page section — hero, capture, measure, transmit, deliver.
 *   story  (0–1): the sun, beams, current and lights. It barely moves during the measure section,
 *                 so the day only winds a little toward golden hour while the chart plays.
 * Everything except the camera and the energy display animates on story time.
 */

/** Camera keyframes at scroll 0, 0.25, 0.5, 0.75 and 1. */
export const KEYS = [
  { pos: v(12, 11, 33), look: v(6, 1.5, 4) },
  { pos: v(19.5, 2.6, 17.5), look: v(14.5, 1, 11.5) },
  { pos: v(2, 7.6, 28), look: v(8, 6.2, 9) },
  { pos: v(-8, 42, 62), look: v(18, 0, 2) },
  { pos: v(80, 18, 34), look: v(46, 4, 4) },
];

const STORY = [[0, 0], [0.25, 1 / 3], [0.5, 0.42], [0.75, 2 / 3], [1, 1]];

/** Maps page scroll to story time (piecewise linear through STORY). */
export function storyTime(scroll: number) {
  for (let i = 1; i < STORY.length; i++) {
    if (scroll <= STORY[i][0]) {
      const [s0, t0] = STORY[i - 1];
      const [s1, t1] = STORY[i];
      return t0 + ((scroll - s0) / (s1 - s0)) * (t1 - t0);
    }
  }
  return 1;
}

// ------------------------------------------------------------------ energy display (measure section)

/** Floating energy display above the farm, facing the measure camera (which looks away from the sun). */
export const HOLO = { pos: v(12, 6.6, 9), yaw: Math.atan2(-10, 19), w: 15, h: 7.5 };

export const DAY = { start: 6, end: 18.5 };
const PEAK_MW = 3.6;

/** Farm output (MW) at a given hour on a clear day: a sine-shaped arc from sunrise to sunset. */
export function farmPowerMW(hour: number) {
  const x = (hour - DAY.start) / (DAY.end - DAY.start);
  return x <= 0 || x >= 1 ? 0 : PEAK_MW * Math.pow(Math.sin(Math.PI * x), 1.1);
}

/** Energy (MWh) generated from sunrise up to the given hour, by numeric integration. */
export function farmEnergyMWh(hour: number) {
  const steps = 120;
  const end = Math.min(Math.max(hour, DAY.start), DAY.end);
  const dh = (end - DAY.start) / steps;
  let sum = 0;
  for (let i = 0; i < steps; i++) sum += farmPowerMW(DAY.start + (i + 0.5) * dh) * dh;
  return sum;
}

/** Hour shown by the display at scroll position s: plays 06:00 → 18:30 while the section is on screen. */
export function displayHour(scroll: number) {
  return DAY.start + smooth(0.38, 0.58, scroll) * (DAY.end - DAY.start);
}

/** Sun elevation (degrees) over the story: afternoon → golden hour → just after sunset. */
export function sunElevation(s: number) {
  if (s < 0.45) return THREE.MathUtils.lerp(21, 7, smooth(0, 0.45, s));
  return THREE.MathUtils.lerp(7, -4, smooth(0.45, 0.88, s));
}

const SUN_AZIMUTH = new THREE.Vector2(-0.93, -0.36).normalize();

export function sunDirection(s: number, out = new THREE.Vector3()) {
  const e = THREE.MathUtils.degToRad(sunElevation(s));
  return out.set(SUN_AZIMUTH.x * Math.cos(e), Math.sin(e), SUN_AZIMUTH.y * Math.cos(e));
}

/** Length of each line's middle conductor, used to time when current reaches each society. */
export const LINE_LENGTHS = ROUTES.map((r) => conductorCurve(r, 1).getLength());
const LONGEST = Math.max(...LINE_LENGTHS);

/** Distance (along the lines) the current has travelled from the substation at scroll s. */
export function gridFront(s: number) {
  return smooth(0.55, 0.88, s) * (LONGEST + 6);
}

/** 0 → 1 as the current arrives at society i. */
export function societyPower(i: number, s: number) {
  return smooth(LINE_LENGTHS[i] - 2, LINE_LENGTHS[i] + 6, gridFront(s));
}
