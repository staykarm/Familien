// Kart over etasjene, målt fra plantegningene (A22-105 og A22-106, hus C, målestokk 1:50). Mål i meter.
// x = 0 er akse 22 (innsiden av vestveggen), y = 0 er akse P (innsiden av nordveggen). Rommene er
// innvendige mål (veggflate til veggflate), så veggene blir de grå båndene mellom rommene.
// Rom-id-ene er de i romkartet (rooms.ts).

import { CO2_HIGH } from "./air";
import { APPLIANCE_ICON } from "./appliances";
import { roomBrightness, type Room } from "./home";

export type Pt = [number, number];

export interface Shape {
  room: string;
  /** Omrisset, med klokka. */
  pts: Pt[];
  /** Eget navn på feltet (f.eks. «Garderobe» i hovedsoverommet). Uten: navnet på rommet. */
  label?: string;
  /** Rom med flere felt får navn og merker bare på det ene. */
  main?: boolean;
  /** Hvor navnet står, når midten av feltet ikke ligger inne i rommet (L-formede rom). */
  at?: Pt;
  /** Varmekabler (switch.*) i feltet: det blir oransje når de er på. */
  heat?: string;
}

/**
 * Dør i en vegg. `wall: "v"` er en loddrett vegg ved x = `at`, med åpning fra y = `from` til `to`
 * (og motsatt for `"h"`). `t` er veggtykkelsen åpningen dekker. Slagdører har hengsel i `hinge`-enden og
 * slår mot `side` (+1 = økende x/y). Skyvedører (`slide`) vises bare som åpning.
 */
export interface Door {
  wall: "h" | "v";
  at: number;
  from: number;
  to: number;
  t: number;
  hinge?: "from" | "to" | "both";
  side?: 1 | -1;
  slide?: boolean;
}

/**
 * Trapp: et felt [x0, y0, x1, y1] med trinn som streker på tvers. `axis` er retningen trappa går, og `lines` er
 * der trinnene møtes. `ned` er åpningen ned til etasjen under (mørk), `over` er trappa over snittet (stiplet).
 */
export interface Stair {
  box: [number, number, number, number];
  axis: "x" | "y";
  lines: number[];
  kind?: "ned" | "over";
  /** Varmekablene i trappa (switch.*): trinnene blir oransje når de er på. */
  heat?: string;
}

export interface Floor {
  id: "1" | "2" | "tak";
  name: string;
  /** Ytterkanten av huset (rektangler [x0, y0, x1, y1]). Det som ikke er rom, er vegg. */
  footprint: [number, number, number, number][];
  shapes: Shape[];
  doors: Door[];
  /** Eget utsnitt (samme høyde, så samme målestokk). Uten: `VIEWBOX`. */
  viewBox?: { x: number; y: number; w: number; h: number };
  /** Faste ting oppå et rom (trappeoppgang, pipe), tegnet som vegg: [x0, y0, x1, y1, navn]. */
  obstacles?: [number, number, number, number, string?][];
  stairs?: Stair[];
}

/** Trinnene i innetrappa (U-trapp mellom 1. og 2. etasje, A22-105/106). */
const STEPS = [3.52, 3.84, 4.16, 4.49, 4.81, 5.13];

/** Varmekablene ved inngangen i nord (trappene og reposet). */
export const STAIR_HEAT = "switch.varmekabler_trapp_ute";

/** Rektangel fra hjørne til hjørne. */
export const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** Samme utsnitt for begge etasjene, så de har samme målestokk. */
export const VIEWBOX = { x: -5.85, y: -0.45, w: 13.6, h: 17.05 };

export const FLOORS: Floor[] = [
  {
    id: "1",
    name: "1. etasje",
    footprint: [
      [-0.25, -0.38, 6.86, 15.08],
      [-5.65, 2.58, -2.5, 8.38],
      [-2.5, 3.88, -0.25, 7.77],
    ],
    shapes: [
      { room: "bad-stort", pts: rect(0, 0, 1.9, 4.17) },
      { room: "master", pts: rect(2, 0, 6.5, 2.87), main: true },
      { room: "master", label: "Garderobe", pts: [[2, 2.87], [6.5, 2.87], [6.5, 4.83], [3.35, 4.83], [3.35, 4.17], [2, 4.17]] },
      { room: "kontor-1", pts: [[-5.4, 2.83], [-2.75, 2.83], [-2.75, 5.09], [-3.37, 5.09], [-3.37, 5.8], [-5.4, 5.8]], at: [-4.2, 4.2] },
      { room: "vaskerom", pts: [[-5.4, 5.9], [-3.37, 5.9], [-3.37, 6.56], [-2.75, 6.56], [-2.75, 8.13], [-5.4, 8.13]], at: [-4.1, 7.2] },
      { room: "entre", pts: [[-2.5, 4.23], [-0.25, 4.23], [-0.25, 4.28], [2, 4.28], [2, 6.93], [-0.25, 6.93], [-0.25, 7.42], [-2.5, 7.42]], at: [-0.6, 5.6] },
      { room: "gang", pts: rect(2, 4.28, 3.2, 11.68), at: [2.6, 9.4] },
      { room: "trapp", pts: rect(3.2, 4.93, 6.5, 6.93) },
      { room: "toalett", pts: rect(0, 7.03, 1.9, 8.13) },
      { room: "bad-lite", pts: rect(0, 8.23, 1.9, 10.63) },
      { room: "teknisk", pts: rect(0, 10.73, 1.9, 14.83) },
      { room: "sov-venstre", pts: rect(3.35, 7.03, 6.5, 9.31) },
      { room: "sov-hoyre", pts: rect(3.35, 9.41, 6.5, 11.69) },
      { room: "lekerom", pts: rect(2, 11.79, 6.5, 14.83) },
      // Ute (A22-105): trappa og reposet ved inngangen i nord, inngangen i sør og terrassen utenfor kjellerstua.
      {
        room: "ute",
        label: "Inngang nord",
        pts: [[-1.32, 0], [-0.25, 0], [-0.25, 3.88], [-2.5, 3.88], [-2.5, 2.55], [-4.15, 2.55], [-4.15, 1.4], [-1.32, 1.4]],
        at: [-1.35, 1.95],
        heat: STAIR_HEAT,
      },
      { room: "ute", label: "Inngang sør", pts: rect(-2.5, 7.77, -0.25, 8.38) },
      { room: "ute", main: true, pts: rect(-0.25, 15.08, 6.86, 16.45) },
    ],
    doors: [
      { wall: "v", at: 1.95, from: 2.6, to: 3.42, t: 0.12, hinge: "from", side: 1 }, // Hovedbad – hovedsoverom
      { wall: "h", at: 4.055, from: -1.56, to: -0.63, t: 0.36, hinge: "to", side: -1 }, // Inngang nord
      { wall: "h", at: 7.595, from: -1.56, to: -0.63, t: 0.36, hinge: "to", side: 1 }, // Inngang sør
      { wall: "v", at: -2.625, from: 4.25, to: 5.06, t: 0.26, hinge: "to", side: -1 }, // Kontor
      { wall: "v", at: -2.625, from: 6.59, to: 7.4, t: 0.26, hinge: "from", side: -1 }, // Vaskerom
      { wall: "h", at: 6.98, from: 0.74, to: 1.45, t: 0.12, hinge: "to", side: -1 }, // WC
      { wall: "v", at: 1.95, from: 8.33, to: 9.14, t: 0.12, hinge: "from", side: 1 }, // Guttas bad
      { wall: "v", at: 1.95, from: 10.78, to: 11.59, t: 0.12, hinge: "from", side: -1 }, // Teknisk rom
      { wall: "v", at: 3.275, from: 7.18, to: 7.99, t: 0.17, hinge: "from", side: 1 }, // Soverom Olav
      { wall: "v", at: 3.275, from: 9.56, to: 10.37, t: 0.17, hinge: "from", side: 1 }, // Soverom Edvard
      { wall: "h", at: 4.225, from: 2, to: 3.2, t: 0.13, slide: true }, // Gang – hovedsoverom
      { wall: "h", at: 11.735, from: 2, to: 3.2, t: 0.13, slide: true }, // Gang – kjellerstue
      { wall: "h", at: 14.955, from: 2.03, to: 3.15, t: 0.27, hinge: "from", side: 1 }, // Utgang sør
    ],
    // Veggen mellom de to løpene i innetrappa.
    obstacles: [[3.2, 5.85, 5.45, 5.93]],
    stairs: [
      { box: [3.2, 5.93, 5.45, 6.93], axis: "x", lines: STEPS },
      { box: [3.2, 4.93, 5.45, 5.85], axis: "x", lines: STEPS, kind: "over" },
      // Utetrappa i nord: løpet langs kontoret, trinnene opp til døra og trappa mot nord.
      { box: [-4.15, 1.4, -2.4, 2.5], axis: "x", lines: [-3.84, -3.53, -3.25, -2.96, -2.65], heat: STAIR_HEAT },
      { box: [-2.4, 2.55, -0.25, 3.35], axis: "y", lines: [2.75, 2.95, 3.15], heat: STAIR_HEAT },
      { box: [-1.32, 0, -0.25, 1.4], axis: "x", lines: [-1, -0.65], heat: STAIR_HEAT },
    ],
  },
  {
    id: "2",
    name: "2. etasje",
    footprint: [
      [-0.37, -0.38, 6.86, 15.08],
      [-0.97, 9.18, -0.25, 11.39],
      [6.5, 7.02, 7.46, 11.23],
    ],
    shapes: [
      { room: "stue", pts: rect(0, 0, 6.5, 4.83) },
      { room: "terrasse", pts: rect(-5.55, 2.6, -0.34, 8.35) },
      {
        room: "kjokken",
        pts: [[0, 4.83], [3.2, 4.83], [3.2, 7.03], [3.86, 7.03], [3.86, 11.23], [0, 11.23], [0, 11.09], [-0.71, 11.09], [-0.71, 9.48], [0, 9.48]],
        at: [1.9, 7.6],
      },
      { room: "trapp", pts: rect(3.3, 4.93, 6.5, 6.93) },
      {
        room: "kontor-2",
        pts: [[3.96, 7.04], [6.5, 7.04], [6.5, 7.27], [7.21, 7.27], [7.21, 11.01], [6.5, 11.01], [6.5, 11.22], [5.48, 11.22], [5.48, 9.2], [3.96, 9.2]],
        at: [5.3, 8.1],
      },
      { room: "bod-2", pts: rect(3.96, 9.3, 5.38, 11.22) },
      { room: "spisestue", pts: [[0, 11.23], [3.22, 11.23], [3.22, 11.33], [6.5, 11.33], [6.5, 14.83], [0, 14.83]], at: [3.25, 13.1] },
      { room: "balkong", pts: rect(6.86, 11.34, 7.6, 13.3) },
    ],
    doors: [
      { wall: "v", at: -0.165, from: 2.81, to: 3.64, t: 0.36, hinge: "from", side: -1 }, // Terrasse nord
      { wall: "v", at: -0.165, from: 5.97, to: 7.6, t: 0.36, hinge: "both", side: -1 }, // Terrasse, dobbel dør
      { wall: "v", at: 6.68, from: 11.4, to: 13.27, t: 0.38, slide: true }, // Terrasse
      { wall: "h", at: 11.28, from: 5.48, to: 6.5, t: 0.13, slide: true }, // Kontor – spisestue
      { wall: "v", at: 5.43, from: 9.47, to: 10.31, t: 0.12, slide: true }, // Bod
    ],
    obstacles: [[3.3, 5.85, 5.45, 5.93]],
    stairs: [
      // Åpningen ned til 1. etasje, og løpet videre opp til taket.
      { box: [3.3, 4.93, 5.45, 5.85], axis: "x", lines: STEPS, kind: "ned" },
      { box: [3.3, 5.93, 5.45, 6.93], axis: "x", lines: STEPS },
    ],
  },
  {
    // Taket (A22-107): takterrassen innenfor brystningen (6 672 × 15 022 mm, 100,2 m²), med trappeoppgangen
    // og pipa. Den nedre takflaten mot vest er terrassen i 2. etasje og står der.
    id: "tak",
    name: "Taket",
    footprint: [[-0.34, -0.34, 6.87, 15.25]],
    shapes: [{ room: "taket", pts: rect(-0.04, -0.03, 6.63, 14.99), at: [3.3, 10.5] }],
    doors: [],
    obstacles: [
      [3.53, 4.85, 6.63, 7.12, "Trapp"],
      [0.55, 4.17, 1.35, 4.88],
    ],
    viewBox: { x: -0.6, y: -0.45, w: 7.7, h: 17.05 },
  },
];

/** Bokstavhøyden på kartet (meter). */
export const FONT = 0.34;

/** Rammen rundt et felt. */
export function bounds(pts: Pt[]): { x: number; y: number; w: number; h: number } {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Arealet av et felt (m²), med skolissemetoden. */
export function area(pts: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Strekene som tegner en dør: dørbladet (åpent 90°) og buen den går i. Tomt for skyvedører. */
export function doorSwing(d: Door): { leaf: [Pt, Pt]; arc: { from: Pt; to: Pt; r: number; sweep: 0 | 1 } }[] {
  if (d.slide || !d.hinge || !d.side) return [];
  const pt = (along: number, across: number): Pt => (d.wall === "v" ? [across, along] : [along, across]);
  const leaf = (hinge: number, free: number) => {
    const w = Math.abs(free - hinge);
    const h = pt(hinge, d.at);
    const open = pt(hinge, d.at + d.side! * w);
    const closed = pt(free, d.at);
    // SVG-buen går den korte veien fra det åpne bladet til den lukkede kanten: retningen gir kryssproduktet.
    const cross = (open[0] - h[0]) * (closed[1] - h[1]) - (open[1] - h[1]) * (closed[0] - h[0]);
    return { leaf: [h, open] as [Pt, Pt], arc: { from: open, to: closed, r: w, sweep: (cross > 0 ? 1 : 0) as 0 | 1 } };
  };
  if (d.hinge === "both") {
    const mid = (d.from + d.to) / 2;
    return [leaf(d.from, mid), leaf(d.to, mid)];
  }
  return d.hinge === "from" ? [leaf(d.from, d.to)] : [leaf(d.to, d.from)];
}

/** Åpningen i veggen (rektangel [x, y, w, h]), så rommene på hver side henger sammen. */
export function doorGap(d: Door): [number, number, number, number] {
  return d.wall === "v" ? [d.at - d.t / 2, d.from, d.t, d.to - d.from] : [d.from, d.at - d.t / 2, d.to - d.from, d.t];
}

/** Deler navnet på flere linjer når feltet er smalt (ca. 0,55 × bokstavhøyde per tegn). */
export function labelLines(text: string, width: number, font = FONT): string[] {
  const max = Math.max(3, Math.floor((width - 0.2) / (font * 0.55)));
  const lines: string[] = [];
  for (const word of text.split(" ")) {
    const last = lines.at(-1);
    if (last && `${last} ${word}`.length <= max) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

export interface RoomLook {
  /** 0 = av, ellers 0,25–0,85: hvor sterk den gule fargen er. */
  glow: number;
  /** Små merker på kartet: «🚨» (røykvarsleren har gått), «22°», «CO₂» (dårlig luft), «🎵», «🔥», maskiner som går (🧺 🌀 🍽️ ♨️), «▾» (persienne nede). */
  badges: string[];
  /** Røykvarsleren i rommet har gått: rommet blir rødt. */
  alert?: boolean;
}

/** Hvordan et rom skal se ut på kartet: lys som farge, og merker for temperatur, varme, musikk og persienner. */
export function roomLook(room: Room | undefined, playing: Set<string>): RoomLook {
  if (!room) return { glow: 0, badges: [] };
  const lit = room.lights.filter((l) => l.available && l.on);
  const glow = lit.length ? 0.25 + 0.6 * (roomBrightness(lit) / 100) : 0;
  const badges: string[] = room.fire ? ["🚨"] : [];
  // Temperatur fra termostaten, ellers fra luftsensoren.
  const temp = room.climate?.current ?? (room.air?.online ? room.air.temperature : null) ?? null;
  if (temp !== null) badges.push(`${Math.round(temp)}°`);
  if (room.air?.online && room.air.co2 !== null && room.air.co2 > CO2_HIGH) badges.push("CO₂");
  if (room.climate?.heating || room.switches?.some((s) => s.on)) badges.push("🔥");
  // Miele-maskiner som går eller er ferdige.
  for (const a of room.appliances ?? []) if (a.running || a.done) badges.push(APPLIANCE_ICON[a.kind]);
  if (room.valves?.some((v) => v.open)) badges.push("💧");
  if (room.hatch && room.hatch.state !== "closed" && room.hatch.state !== "unknown") badges.push("Luke åpen");
  if (room.speakers.some((id) => playing.has(id))) badges.push("🎵");
  if (room.covers.some((c) => c.position !== null && c.position < 50)) badges.push("▾");
  return room.fire ? { glow, badges, alert: true } : { glow, badges };
}
