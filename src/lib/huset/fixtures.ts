// Lyspunktene i huset, lest av elektrotegningene (GP Elektro, 21.04.22) og regnet om til kartets meter
// (samme nullpunkt som floorplan.ts). Hvert punkt hører til ett lys i Home Assistant (`light`), eller er
// ennå ikke koblet (`null`). Grågrønne og oransje prikker på tegningen er to spottetyper; pendler og
// lamper er egne punkter. Koblingen rettes i koblingsrunden («Vis lyspunktene med nummer» på kartet).
// Rene data og funksjoner uten nettverk.

import type { Light } from "./home";

export type FixtureKind = "spot" | "pendel" | "lampe";

export interface Fixture {
  /** Nummeret som vises i koblingsvisningen (unikt per etasje). */
  n: number;
  floor: "1" | "2" | "tak";
  x: number;
  y: number;
  kind: FixtureKind;
  /** light.* i Home Assistant, eller null hvis ikke koblet ennå. */
  light: string | null;
}

/** Kort vei til et punkt: [nr, x, y, type, lys]. */
type Row = [number, number, number, FixtureKind, string | null];

const floor2: Row[] = [
  // Stue
  [1, 0.47, 1.34, "spot", "light.stue_kap"],
  [2, 0.47, 1.54, "spot", "light.stue_kap"],
  [3, 5.95, 1.34, "spot", "light.stue_kap"],
  [4, 5.95, 1.54, "spot", "light.stue_kap"],
  [5, 2.57, 4.11, "spot", "light.stue_kap"],
  [6, 4.19, 4.11, "spot", "light.stue_kap"],
  [7, 0.47, 4.11, "spot", "light.stue_ut"],
  [8, 0.67, 4.11, "spot", "light.stue_ut"],
  [9, 5.76, 4.11, "spot", "light.stue_ut"],
  [10, 5.96, 4.11, "spot", "light.stue_ut"],
  [11, 2.57, 0.85, "spot", "light.stue_ut_hjorne"],
  [12, 2.76, 0.85, "spot", "light.stue_ut_hjorne"],
  // Kjøkken
  [14, 0.47, 5.94, "spot", "light.kjokken_kap_peis"],
  [15, 0.47, 6.13, "spot", "light.kjokken_kap_peis"],
  [16, 2.57, 5.94, "spot", "light.kjokken_kap_peis"],
  [17, 2.57, 6.13, "spot", "light.kjokken_kap_peis"],
  [18, 0.47, 8.69, "spot", "light.kjokken_kap"],
  [19, 0.47, 8.88, "spot", "light.kjokken_kap"],
  [20, 2.57, 10.73, "spot", "light.kjokken_kap"],
  [21, 1.45, 8.69, "spot", "light.kjokken_ut_oy"],
  [22, 1.45, 8.89, "spot", "light.kjokken_ut_oy"],
  [23, 1.45, 10.74, "spot", "light.kjokken_ut_oy"],
  // Spisestue
  [24, 0.47, 11.88, "spot", "light.spisestue_kap"],
  [25, 0.47, 14.15, "spot", "light.spisestue_kap"],
  [26, 0.47, 14.35, "spot", "light.spisestue_kap"],
  [27, 1.68, 14.35, "spot", "light.spisestue_kap"],
  [28, 4.67, 11.9, "spot", "light.spisestue_kap"],
  [29, 4.87, 11.9, "spot", "light.spisestue_kap"],
  [30, 4.87, 14.33, "spot", "light.spisestue_kap"],
  [31, 5.96, 14.34, "spot", "light.spisestue_kap"],
  [32, 2.57, 11.9, "spot", "light.spisestue_ut"],
  [33, 3.18, 14.35, "spot", "light.spisestue_ut"],
  [34, 3.39, 14.35, "spot", "light.spisestue_ut"],
  [35, 5.96, 11.9, "spot", "light.spisestue_ut"],
  [36, 5.96, 12.09, "spot", "light.spisestue_ut"],
  [37, 2.63, 13.49, "pendel", "light.spisestue_taklys"],
  // Bod 2. etg
  [38, 4.63, 9.89, "spot", "light.bod_2etg_kap"],
  [39, 4.63, 10.79, "spot", "light.bod_2etg_kap"],
  // Kontor 2. etg
  [40, 4.83, 7.64, "spot", "light.kontor_2etg_ut"],
  [41, 5.04, 7.64, "spot", "light.kontor_2etg_ut"],
  [42, 4.83, 8.58, "spot", "light.kontor_2etg_kap"],
  [43, 4.83, 8.77, "spot", "light.kontor_2etg_kap"],
  [44, 5.95, 9.22, "spot", "light.kontor_2etg_kap"],
  [45, 5.95, 10.79, "spot", "light.kontor_2etg_kap"],
];

export const FIXTURES: Fixture[] = floor2.map(([n, x, y, kind, light]) => ({ n, floor: "2", x, y, kind, light }));

export interface FixtureLook {
  on: boolean;
  /** 0–1: hvor sterkt punktet lyser (lysstyrken, eller 1 for lys som bare kan slås av og på). */
  level: number;
  /** Lyset finnes og svarer. */
  available: boolean;
}

/** Hvordan et lyspunkt ser ut nå. Ukoblede punkter og lys som ikke svarer, er av. */
export function fixtureLook(f: Fixture, lights: Map<string, Light>): FixtureLook {
  const light = f.light ? lights.get(f.light) : undefined;
  if (!light || !light.available) return { on: false, level: 0, available: !!light?.available };
  if (!light.on) return { on: false, level: 0, available: true };
  return { on: true, level: light.brightness === null ? 1 : Math.max(0.05, light.brightness / 100), available: true };
}

/** Koblingslisten: lys → punktnumre, og punkter som ikke er koblet. */
export function fixtureIndex(fixtures: Fixture[]): { byLight: Map<string, number[]>; unassigned: number[] } {
  const byLight = new Map<string, number[]>();
  const unassigned: number[] = [];
  for (const f of fixtures) {
    if (!f.light) unassigned.push(f.n);
    else byLight.set(f.light, [...(byLight.get(f.light) ?? []), f.n]);
  }
  return { byLight, unassigned };
}

/** Retning (enhetsvektor) for nummeret ved et punkt: bort fra nærmeste nabo, så tette par ikke får nummer oppå hverandre. */
export function labelDirection(f: Fixture, fixtures: Fixture[]): [number, number] {
  let near: Fixture | null = null;
  let best = 0.6;
  for (const o of fixtures) {
    const d = Math.hypot(o.x - f.x, o.y - f.y);
    if (o !== f && o.floor === f.floor && d < best) [near, best] = [o, d];
  }
  if (!near || best === 0) return [0.71, -0.71];
  return [(f.x - near.x) / best, (f.y - near.y) / best];
}
