// Lyspunktene i huset, lest av elektrotegningene (GP Elektro: 1. etasje 07.04.22, 2. etasje 21.04.22) og regnet om til kartets meter
// (samme nullpunkt som floorplan.ts). Hvert punkt hører til ett lys i Home Assistant (`light`), eller er
// ennå ikke koblet (`null`). Grågrønne og oransje prikker på tegningen er to spottetyper; pendler og
// lamper er egne punkter. Der et rom har både UT og KAP, er grågrønne UT og oransje KAP.
// Rene data og funksjoner uten nettverk.

import type { Light } from "./home";

export type FixtureKind = "spot" | "pendel" | "lampe";

export interface Fixture {
  /** Nummer på punktet (unikt per etasje), brukt som nøkkel. */
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

const floor1: Row[] = [
  // Hovedsoverom
  [1, 2.5, 0.5, "spot", "light.soverom_master_ut"],
  [2, 2.51, 1.59, "spot", "light.soverom_master_ut"],
  [3, 2.5, 1.79, "spot", "light.soverom_master_ut"],
  [4, 2.54, 3.07, "spot", "light.soverom_master_ut"],
  [5, 4.51, 3.85, "spot", "light.soverom_master_ut"],
  [6, 4.72, 3.85, "spot", "light.soverom_master_ut"],
  [7, 5.79, 0.51, "spot", "light.soverom_master_ut"],
  [8, 6.0, 0.49, "spot", "light.soverom_master_ut"],
  [9, 3.65, 2.46, "lampe", "light.nattbordlamper_hovedsov"],
  [10, 5.32, 2.46, "lampe", "light.nattbordlamper_hovedsov"],
  // Hovedbad
  [11, 1.22, 2.47, "spot", "light.bad_stort_ut_og_kap"],
  [12, 1.22, 2.67, "spot", "light.bad_stort_ut_og_kap"],
  [13, 1.22, 3.77, "spot", "light.bad_stort_ut_og_kap"],
  // Entré: samme kurs som gangen (stiplet linje på tegningen), entreen har ingen egne lys
  [14, -1.49, 4.45, "spot", "light.gang_kap"],
  [15, -1.49, 6.01, "spot", "light.gang_kap"],
  [16, -1.49, 7.0, "spot", "light.gang_kap"],
  [17, -0.13, 6.01, "spot", "light.gang_kap"],
  [18, 1.23, 6.02, "spot", "light.gang_kap"],
  // Gang
  [19, 2.6, 4.83, "spot", "light.gang_kap"],
  [20, 2.6, 6.02, "spot", "light.gang_kap"],
  [21, 2.6, 7.69, "spot", "light.gang_kap"],
  [22, 2.6, 9.37, "spot", "light.gang_kap"],
  [23, 2.6, 11.05, "spot", "light.gang_kap"],
  // Kontor 1. etg
  [24, -5.09, 4.18, "spot", "light.kontor_1etg_kap"],
  [25, -5.1, 4.38, "spot", "light.kontor_1etg_kap"],
  [26, -3.27, 3.26, "spot", "light.kontor_1etg_kap"],
  [27, -3.07, 3.26, "spot", "light.kontor_1etg_kap"],
  // Vaskerom
  [28, -3.9, 6.04, "spot", "light.vaskerom_kap"],
  [29, -4.86, 6.88, "spot", "light.vaskerom_kap"],
  [30, -3.89, 6.88, "spot", "light.vaskerom_kap"],
  [31, -3.89, 7.8, "spot", "light.vaskerom_kap"],
  // WC
  [32, 1.11, 7.65, "spot", "light.toalett_kap"],
  // Guttas bad
  [33, 1.29, 8.71, "spot", "light.bad_lite_ut"],
  [34, 1.28, 9.46, "spot", "light.bad_lite_ut"],
  // Soverom Olav og Soverom Edvard (takpunkt)
  [35, 4.91, 8.19, "pendel", "light.soverom_venstre_takpunkt"],
  [36, 4.91, 10.52, "pendel", "light.soverom_hoyre_takpunkt"],
  // Teknisk rom
  [37, 0.95, 11.46, "spot", "light.teknisk_lux"],
  [38, 0.95, 12.79, "spot", "light.teknisk_lux"],
  [39, 0.95, 14.1, "spot", "light.teknisk_lux"],
  // Lekerom: oransje er KAP, grågrønne er UT
  [40, 2.6, 12.24, "spot", "light.lekerom_kap"],
  [41, 2.6, 12.44, "spot", "light.lekerom_kap"],
  [42, 2.6, 14.22, "spot", "light.lekerom_kap"],
  [43, 3.62, 12.24, "spot", "light.lekerom_ut"],
  [44, 3.59, 14.22, "spot", "light.lekerom_ut"],
  [45, 3.79, 14.22, "spot", "light.lekerom_ut"],
  [46, 6.0, 12.24, "spot", "light.lekerom_ut"],
  [47, 5.99, 12.43, "spot", "light.lekerom_ut"],
  [48, 6.0, 14.24, "spot", "light.lekerom_ut"],
];

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

const rows = (floor: Fixture["floor"], list: Row[]): Fixture[] => list.map(([n, x, y, kind, light]) => ({ n, floor, x, y, kind, light }));

export const FIXTURES: Fixture[] = [...rows("1", floor1), ...rows("2", floor2)];

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
