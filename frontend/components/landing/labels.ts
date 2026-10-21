// The six housing societies in the landing scene: the project dataset's first six rows.
// Kept free of three.js so the page can render the label markup without loading the 3D bundle;
// scene/layout.ts adds their positions in the same order.
export const SOCIETY_LABELS = [
  { name: "Shanti CHS", detail: "383 flats · Thane" },
  { name: "Lotus Heights 6", detail: "221 flats · Ahmednagar" },
  { name: "Maple Heights 2", detail: "321 flats · Latur" },
  { name: "Vasant Vihar Park", detail: "434 flats · Amravati" },
  { name: "Riverside Heights", detail: "50 flats · Amravati" },
  { name: "Crystal Residency 2", detail: "76 flats · Navi Mumbai" },
] as const;
