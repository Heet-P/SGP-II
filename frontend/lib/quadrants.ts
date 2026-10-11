import type { Quadrant } from "./types";

export const QUADRANTS: Record<Exclude<Quadrant, "Ineligible">, { color: string; desc: string }> = {
  Prime: { color: "#16a34a", desc: "Low risk · high reward. Pitch first." },
  Nurture: { color: "#f59e0b", desc: "High risk · high reward. Worth the effort." },
  "Easy win": { color: "#2563eb", desc: "Low risk · low reward. Fills spare capacity." },
  Deprioritise: { color: "#94a3b8", desc: "High risk · low reward. Skip for now." },
};

export const INELIGIBLE_COLOR = "#dc2626";

export const quadrantColor = (q: Quadrant) => (q === "Ineligible" ? INELIGIBLE_COLOR : QUADRANTS[q].color);
