import * as THREE from "three";

import { seeded } from "./layout";

/*
 * Procedural textures drawn on canvases, so the scene needs no image downloads.
 */

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

function texture(c: HTMLCanvasElement, srgb: boolean) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Monocrystalline panel: 6 × 12 cells with silver busbars. Returns colour, roughness and glow maps. */
export function panelTextures() {
  const W = 384;
  const H = 768;
  const cols = 6;
  const rows = 12;
  const cw = W / cols;
  const ch = H / rows;
  const color = canvas(W, H);
  const rough = canvas(W, H);
  const glow = canvas(W, H);
  color.g.fillStyle = "#d9dde3"; // backsheet showing between cells
  color.g.fillRect(0, 0, W, H);
  rough.g.fillStyle = "#9a9a9a";
  rough.g.fillRect(0, 0, W, H);
  glow.g.fillStyle = "#000";
  glow.g.fillRect(0, 0, W, H);
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const px = x * cw + 2;
      const py = y * ch + 2;
      const grad = color.g.createLinearGradient(px, py, px + cw, py + ch);
      grad.addColorStop(0, "#0f1d3d");
      grad.addColorStop(1, "#16274f");
      color.g.fillStyle = grad;
      color.g.fillRect(px, py, cw - 4, ch - 4);
      // Clipped corners of mono cells.
      color.g.fillStyle = "#d9dde3";
      for (const [cx, cy] of [[px, py], [px + cw - 4, py], [px, py + ch - 4], [px + cw - 4, py + ch - 4]]) {
        color.g.beginPath();
        color.g.arc(cx, cy, 5, 0, Math.PI * 2);
        color.g.fill();
      }
      rough.g.fillStyle = "#1a1a1a";
      rough.g.fillRect(px, py, cw - 4, ch - 4);
      glow.g.fillStyle = "#4fb4ff";
      glow.g.fillRect(px + 3, py + 3, cw - 10, ch - 10);
    }
  }
  // Busbars.
  color.g.fillStyle = "#aeb6c2";
  for (let x = 0; x < cols; x++) {
    for (const f of [0.3, 0.7]) color.g.fillRect(x * cw + cw * f - 1, 0, 2, H);
  }
  return { map: texture(color.c, true), roughnessMap: texture(rough.c, false), emissiveMap: texture(glow.c, true) };
}

/**
 * Apartment façade tile: 2 window columns × 4 floors with balconies. The shader repeats it
 * vertically by each tower's floor count. Returns colour, roughness (glass is smooth) and lit-window maps.
 */
export function facadeTextures() {
  const W = 256;
  const H = 512;
  const floors = 4;
  const fh = H / floors;
  const rand = seeded(7);
  const color = canvas(W, H);
  const rough = canvas(W, H);
  const lit = canvas(W, H);
  color.g.fillStyle = "#e9e3d6";
  color.g.fillRect(0, 0, W, H);
  rough.g.fillStyle = "#e0e0e0";
  rough.g.fillRect(0, 0, W, H);
  lit.g.fillStyle = "#000";
  lit.g.fillRect(0, 0, W, H);
  for (let f = 0; f < floors; f++) {
    const y = f * fh;
    // Floor slab line.
    color.g.fillStyle = "#cfc7b6";
    color.g.fillRect(0, y + fh - 10, W, 10);
    for (let c = 0; c < 2; c++) {
      const x = c * 128 + 22;
      color.g.fillStyle = "#3a4a5c";
      color.g.fillRect(x, y + 26, 84, 70);
      color.g.fillStyle = "#9aa7b3"; // mullion
      color.g.fillRect(x + 41, y + 26, 3, 70);
      color.g.fillStyle = "#bdb5a4"; // balcony rail
      color.g.fillRect(x - 6, y + 92, 96, 8);
      rough.g.fillStyle = "#202020";
      rough.g.fillRect(x, y + 26, 84, 70);
      if (rand() > 0.28) {
        lit.g.fillStyle = rand() > 0.5 ? "#ffd38a" : "#ffe7b8";
        lit.g.fillRect(x + 2, y + 28, 80, 66);
      }
    }
  }
  const make = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = texture(c, srgb);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  return { map: make(color.c, true), roughnessMap: make(rough.c, false), emissiveMap: make(lit.c, true) };
}

/** Asphalt with a dashed centre line, tiled along the road's length. */
export function roadTexture() {
  const { c, g } = canvas(128, 512);
  g.fillStyle = "#3b3d42";
  g.fillRect(0, 0, 128, 512);
  const rand = seeded(11);
  for (let i = 0; i < 2500; i++) {
    const l = 50 + rand() * 30;
    g.fillStyle = `rgb(${l},${l},${l + 4})`;
    g.fillRect(rand() * 128, rand() * 512, 1.5, 1.5);
  }
  g.fillStyle = "#e9e4d4";
  g.fillRect(61, 0, 6, 220);
  g.fillStyle = "#d8d3c4";
  g.fillRect(4, 0, 3, 512);
  g.fillRect(121, 0, 3, 512);
  const t = texture(c, true);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Soft round sprite for the energy particles. */
export function dotTexture() {
  const { c, g } = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.3, "rgba(255,255,255,0.65)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Value-noise fBm in GLSL, shared by the ground, hill and grass shaders. */
export const NOISE_GLSL = /* glsl */ `
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * vnoise(p);
      p = p * 2.03 + vec2(17.1, 9.2);
      a *= 0.5;
    }
    return v;
  }
`;
