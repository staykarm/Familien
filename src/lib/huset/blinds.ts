// Solskjermingen (persiennene) på kartet: hvilket vindu hver persienne sitter i, som en strek midt i veggen
// (samme meter som floorplan.ts). Strekken går langs vinduet fra `from` til `to`.
// 1. etasje er lest av elektrotegningen (GP Elektro, 07.04.22, «SOL» ved vinduene). Kontoret har to: vinduet
// mot vest (SOL) og vinduet mot nord. 2. etasje er anslått ut fra plantegningen (terrassedørene, karnappet på
// kjøkkenet og kontoret) og rettes når vi har elektrotegningen for 2. etasje.
// Rene data og funksjoner uten nettverk.

import type { Cover } from "./home";
import type { Pt } from "./floorplan";

export interface Blind {
  /** cover.* i Home Assistant. */
  cover: string;
  floor: "1" | "2";
  from: Pt;
  to: Pt;
}

export const BLINDS: Blind[] = [
  // 1. etasje
  { cover: "cover.persienne_soverom_master", floor: "1", from: [2.05, -0.19], to: [3.15, -0.19] },
  { cover: "cover.persienne_lekerom", floor: "1", from: [4.36, 14.955], to: [5.37, 14.955] },
  { cover: "cover.persienne_vaskerom", floor: "1", from: [-5.525, 6.43], to: [-5.525, 7.52] },
  { cover: "cover.persienne_vindu_kontor_1etg_vest", floor: "1", from: [-5.525, 4.39], to: [-5.525, 4.95] },
  { cover: "cover.persienne_kontor", floor: "1", from: [-5.11, 2.705], to: [-4.19, 2.705] },
  // 2. etasje (anslått)
  { cover: "cover.persienne_stue", floor: "2", from: [0.5, -0.19], to: [6, -0.19] },
  // Terrassedørene sett innenfra mot vest: høyre er døra i nord, venstre er dobbeltdøra.
  { cover: "cover.persienne_dor_terrasse_hoyre", floor: "2", from: [-0.185, 2.81], to: [-0.185, 3.64] },
  { cover: "cover.persienne_dor_terrasse_venstre", floor: "2", from: [-0.185, 5.97], to: [-0.185, 7.6] },
  { cover: "cover.persienne_kjokken_2etg", floor: "2", from: [-0.84, 9.48], to: [-0.84, 11.09] },
  { cover: "cover.persienne_spisestue_2etg", floor: "2", from: [0.5, 14.955], to: [6, 14.955] },
  { cover: "cover.persienne_kontor_2etg", floor: "2", from: [7.335, 7.27], to: [7.335, 11.01] },
];

export interface BlindLook {
  /** 0 = oppe, 1 = helt nede. */
  down: number;
  /** Persiennen melder posisjon. */
  known: boolean;
  moving: "opening" | "closing" | null;
  available: boolean;
}

/** Hvordan en persienne ser ut nå. Ukjente persienner og persienner som ikke svarer, vises som oppe og bleke. */
export function blindLook(b: Blind, covers: Map<string, Cover>): BlindLook {
  const c = covers.get(b.cover);
  if (!c || !c.available) return { down: 0, known: false, moving: null, available: false };
  if (c.position === null) return { down: 0, known: false, moving: c.moving, available: true };
  return { down: Math.min(1, Math.max(0, 1 - c.position / 100)), known: true, moving: c.moving, available: true };
}

/** Avstand mellom lamellene på kartet (meter). */
const SLAT = 0.11;

/**
 * Lamellene som streker på tvers av vinduet: like mange som persiennen er nede (fra `from`), så halvveis nede
 * dekker halve vinduet. Hver strek er [start, slutt].
 */
export function slats(b: Blind, down: number, width = 0.26): [Pt, Pt][] {
  const [x0, y0] = b.from;
  const [x1, y1] = b.to;
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (!len || down <= 0) return [];
  const [dx, dy] = [(x1 - x0) / len, (y1 - y0) / len];
  const [nx, ny] = [-dy * (width / 2), dx * (width / 2)];
  const total = Math.max(1, Math.floor(len / SLAT));
  const shown = Math.round(total * down);
  const step = len / total;
  const out: [Pt, Pt][] = [];
  for (let i = 0; i < shown; i++) {
    const t = (i + 0.5) * step;
    const [cx, cy] = [x0 + dx * t, y0 + dy * t];
    out.push([
      [round(cx - nx), round(cy - ny)],
      [round(cx + nx), round(cy + ny)],
    ]);
  }
  return out;
}

/** Punktet så langt persiennen dekker vinduet (for den mørke streken langs vinduet). */
export function coveredTo(b: Blind, down: number): Pt {
  return [round(b.from[0] + (b.to[0] - b.from[0]) * down), round(b.from[1] + (b.to[1] - b.from[1]) * down)];
}

const round = (v: number) => Math.round(v * 1000) / 1000;
