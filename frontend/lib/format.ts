const inrFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export const inr = (v: number) => `₹${inrFmt.format(v)}`;

/** ₹ amounts in Indian short form: 12.4k, 3.2 L, 1.45 Cr. */
export function inrShort(v: number) {
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  if (a >= 1e3) return `₹${(v / 1e3).toFixed(0)}k`;
  return `₹${v.toFixed(0)}`;
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;

export const num = (v: number) => inrFmt.format(v);
