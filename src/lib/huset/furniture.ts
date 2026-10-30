// Møblene fra lysplanen (GP Elektro, 21.04.22), i kartets meter (samme nullpunkt som floorplan.ts).
// Plassert etter tegningen og rettet inn mot vegger fra arkitekttegningene der de to ikke stemmer helt.
// Tegnes med lyse, tynne streker. Bare til pynt på kartet: de styrer ingenting. Rene data uten nettverk.

import { rect, type Pt } from "./floorplan";

/**
 * Hvordan et møbel tegnes: vanlig møbel, `teppe` (svak stiplet kant), `skap` (fylt), `seng`, `kar` (badekar),
 * `dusj` (stiplet), `vask` (vask/koketopp, lys fyll), `maskin` (med trommel) eller `strek` (bare en linje, f.eks. ryggen på sofaen).
 */
export type FurnitureStyle = "teppe" | "skap" | "seng" | "kar" | "dusj" | "vask" | "maskin" | "strek";

export interface Furniture {
  floor: "1" | "2" | "tak";
  name: string;
  /** Omriss (eller linje for `strek`). */
  pts?: Pt[];
  /** Ellipse: [cx, cy, rx, ry]. */
  ellipse?: [number, number, number, number];
  style?: FurnitureStyle;
  /** Tegnes tydeligere enn resten (kjøkkenøya og hylla i stua). */
  strong?: boolean;
}

export const FURNITURE: Furniture[] = [
  { floor: "1", name: "Teppe", ellipse: [4.75, 13.72, 0.59, 0.58], style: "teppe" },
  { floor: "1", name: "Bord", ellipse: [4.77, 13.69, 0.29, 0.5] },
  { floor: "1", name: "Sofa", pts: [[3.18, 12.92], [3.18, 11.94], [6.3, 11.94], [6.3, 14.79], [5.49, 14.79], [5.49, 12.92]] },
  // Barnerommene: senga langs ytterveggen i øst, pulten langs veggen i sør.
  { floor: "1", name: "Seng", pts: rect(5.55, 9.5, 6.45, 11.5), style: "seng" },
  { floor: "1", name: "Pult", pts: rect(4, 11.04, 5.4, 11.64) },
  { floor: "1", name: "Seng", pts: rect(5.55, 7.12, 6.45, 9.12), style: "seng" },
  { floor: "1", name: "Pult", pts: rect(4, 8.66, 5.4, 9.26) },
  { floor: "1", name: "Dobbeltseng", pts: rect(3.6, 0.8, 5.4, 2.8), style: "seng" },
  { floor: "1", name: "Pute", pts: rect(3.7, 2.45, 4.45, 2.72) },
  { floor: "1", name: "Pute", pts: rect(4.55, 2.45, 5.3, 2.72) },
  { floor: "1", name: "Skap", pts: rect(3.2, 2.92, 5.75, 3.45), style: "skap" },
  { floor: "1", name: "Garderobeskap", pts: rect(3.35, 4.2, 6.48, 4.81), style: "skap" },
  { floor: "1", name: "Benk", pts: rect(-5.4, 7.53, -2.75, 8.13) },
  { floor: "1", name: "Vaskemaskin", pts: rect(-5.35, 7.55, -4.77, 8.11), style: "maskin" },
  { floor: "1", name: "Benk", pts: rect(-5.4, 5.9, -3.55, 6.5) },
  { floor: "1", name: "Vask", pts: rect(-5.33, 5.96, -4.85, 6.44), style: "vask" },
  { floor: "1", name: "Tørketrommel", pts: rect(-4.75, 5.92, -4.17, 6.48), style: "maskin" },
  { floor: "1", name: "Pult", pts: rect(-5.4, 2.83, -2.85, 3.45) },
  { floor: "1", name: "Stol", pts: rect(-4.25, 3.6, -3.65, 4.08) },
  { floor: "1", name: "Hylle", pts: rect(-5.4, 5.3, -3.55, 5.8), style: "skap" },
  { floor: "1", name: "Garderobe", pts: rect(0.03, 4.28, 1.9, 4.88), style: "skap" },
  { floor: "1", name: "Badekar", pts: rect(0.15, 0.05, 1.85, 0.75), style: "kar" },
  { floor: "1", name: "Dusj", pts: rect(0, 0.85, 1.1, 2), style: "dusj" },
  { floor: "1", name: "Sluk", ellipse: [0.55, 1.45, 0.07, 0.07] },
  { floor: "1", name: "Servant", pts: rect(0, 2.05, 0.5, 3) },
  { floor: "1", name: "Vask", ellipse: [0.25, 2.3, 0.15, 0.16] },
  { floor: "1", name: "Vask", ellipse: [0.25, 2.75, 0.15, 0.16] },
  { floor: "1", name: "Toalett", pts: rect(0, 3.62, 0.17, 4.02) },
  { floor: "1", name: "Toalett", ellipse: [0.43, 3.82, 0.26, 0.18] },
  { floor: "1", name: "Toalett", pts: rect(0, 7.35, 0.17, 7.75) },
  { floor: "1", name: "Toalett", ellipse: [0.43, 7.55, 0.26, 0.18] },
  { floor: "1", name: "Vask", pts: rect(1.45, 7.08, 1.85, 7.55), style: "vask" },
  { floor: "1", name: "Toalett", pts: rect(0, 8.45, 0.17, 8.85) },
  { floor: "1", name: "Toalett", ellipse: [0.43, 8.65, 0.26, 0.18] },
  { floor: "1", name: "Vask", pts: rect(0, 9.15, 0.45, 9.6), style: "vask" },
  { floor: "1", name: "Badekar", pts: rect(0.05, 9.93, 1.8, 10.6), style: "kar" },
  { floor: "1", name: "Benk", pts: rect(1.5, 13.06, 1.9, 14.37) },
  { floor: "2", name: "Spisebord", pts: rect(1.35, 13.13, 3.88, 14.14) },
  { floor: "2", name: "Stol", pts: rect(1.57, 14.2, 2.07, 14.66) },
  { floor: "2", name: "Stol", pts: rect(1.57, 12.63, 2.07, 13.08) },
  { floor: "2", name: "Stol", pts: rect(2.43, 14.2, 2.93, 14.66) },
  { floor: "2", name: "Stol", pts: rect(2.43, 12.63, 2.93, 13.08) },
  { floor: "2", name: "Stol", pts: rect(3.27, 14.2, 3.77, 14.66) },
  { floor: "2", name: "Stol", pts: rect(3.27, 12.63, 3.77, 13.08) },
  { floor: "2", name: "Skjenk", pts: rect(3.36, 11.45, 4.57, 11.9), style: "skap" },
  { floor: "2", name: "Kjøkkenøy", pts: rect(0.95, 8.29, 1.98, 11.1), strong: true },
  { floor: "2", name: "Koketopp", pts: rect(1.35, 9.72, 1.94, 10.51), style: "vask" },
  { floor: "2", name: "Kjøkkenbenk", pts: rect(3.24, 7.08, 3.86, 11.2), style: "skap" },
  { floor: "2", name: "Hylle", pts: rect(3.96, 7.08, 4.4, 9.18), style: "skap" },
  { floor: "2", name: "Peis", pts: rect(0.66, 4.3, 2.38, 5.43), style: "skap" },
  { floor: "2", name: "Peis", pts: rect(0.96, 4.59, 2.07, 5.13), style: "vask" },
  { floor: "2", name: "Teppe", pts: rect(0.53, 0.67, 5.68, 3.76), style: "teppe" },
  { floor: "2", name: "Sofa", pts: [[2.46, 3.81], [2.46, 2.75], [5.41, 2.75], [5.41, 1.18], [6.47, 1.18], [6.47, 3.81]] },
  { floor: "2", name: "Sofa", pts: [[2.76, 3.5], [6.16, 3.5], [6.16, 1.43]], style: "strek" },
  { floor: "2", name: "Salongbord", pts: [[4.12, 2.44], [4.15, 1.65], [4.34, 1.27], [5.09, 1.74], [4.27, 2.48]] },
  { floor: "2", name: "Hylle", pts: rect(3.3, 4.33, 6.45, 4.83), style: "skap", strong: true },
];

/** Midten av et møbel. */
export function furnitureCenter(f: Furniture): Pt {
  if (f.ellipse) return [f.ellipse[0], f.ellipse[1]];
  const pts = f.pts ?? [];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}
