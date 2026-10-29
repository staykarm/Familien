// Forenklet kart over etasjene, laget fra plantegningene (A22-105 og A22-106, hus C), med omtrent samme
// detaljnivå som kartene i Roborock-appen: ett felt per rom, ingen møbler. Mål i meter.
// x = 0 er vestveggen (akse 22), y = 0 er nordveggen (akse P). Rom-id-ene er de i romkartet (rooms.ts).

import { roomBrightness, type Room } from "./home";

export interface Shape {
  room: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Eget navn på feltet (f.eks. «Garderobe» i hovedsoverommet). Uten: navnet på rommet. */
  label?: string;
  /** Rom med flere felt får navn og merker bare på det ene. */
  main?: boolean;
}

export interface Floor {
  id: "1" | "2";
  name: string;
  shapes: Shape[];
}

/** Samme utsnitt for begge etasjene, så de har samme målestokk. */
export const VIEWBOX = { x: -4.4, y: -0.2, w: 12.2, h: 15.8 };

export const FLOORS: Floor[] = [
  {
    id: "1",
    name: "1. etasje",
    shapes: [
      { room: "bad-stort", x: 0, y: 0, w: 2.2, h: 4.3 },
      { room: "master", x: 2.2, y: 0, w: 4.8, h: 2.8, main: true },
      { room: "master", x: 2.2, y: 2.8, w: 4.8, h: 1.5, label: "Garderobe" },
      { room: "kontor-1", x: -3.1, y: 2.85, w: 3.1, h: 2.35 },
      { room: "vaskerom", x: -3.1, y: 5.2, w: 3.1, h: 1.8 },
      { room: "entre", x: 0, y: 4.3, w: 4.6, h: 2.7 },
      { room: "trapp", x: 4.6, y: 4.3, w: 2.4, h: 2.7 },
      { room: "toalett", x: 0, y: 7, w: 1.3, h: 1.2 },
      { room: "bad-lite", x: 0, y: 8.2, w: 1.3, h: 2.8 },
      { room: "gang", x: 1.3, y: 7, w: 1.3, h: 4.0 },
      { room: "sov-venstre", x: 2.6, y: 7, w: 4.4, h: 2.15 },
      { room: "sov-hoyre", x: 2.6, y: 9.15, w: 4.4, h: 1.85 },
      { room: "teknisk", x: 0, y: 11, w: 2.6, h: 3.8 },
      { room: "lekerom", x: 2.6, y: 11, w: 4.4, h: 3.8 },
    ],
  },
  {
    id: "2",
    name: "2. etasje",
    shapes: [
      { room: "stue", x: 0, y: 0, w: 7, h: 4.95 },
      { room: "takterrasse", x: -4.2, y: 2.85, w: 4.2, h: 5.3 },
      { room: "kjokken", x: 0, y: 4.95, w: 4.6, h: 6.2 },
      { room: "trapp", x: 4.6, y: 4.95, w: 2.4, h: 2.0 },
      { room: "kontor-2", x: 4.6, y: 6.95, w: 2.4, h: 3.05 },
      { room: "bod-2", x: 4.6, y: 10, w: 2.4, h: 1.15 },
      { room: "spisestue", x: 0, y: 11.15, w: 7, h: 4.2 },
      { room: "terrasse", x: 7, y: 11, w: 0.7, h: 3.0, label: "Terrasse" },
    ],
  },
];

/** Bokstavhøyden på kartet (meter). */
export const FONT = 0.36;

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
  /** Små merker på kartet: «22°», «🎵», «🔥», «▾» (persienne nede). */
  badges: string[];
}

/** Hvordan et rom skal se ut på kartet: lys som farge, og merker for temperatur, varme, musikk og persienner. */
export function roomLook(room: Room | undefined, playing: Set<string>): RoomLook {
  if (!room) return { glow: 0, badges: [] };
  const lit = room.lights.filter((l) => l.available && l.on);
  const glow = lit.length ? 0.25 + 0.6 * (roomBrightness(lit) / 100) : 0;
  const badges: string[] = [];
  if (room.climate?.current !== null && room.climate?.current !== undefined) badges.push(`${Math.round(room.climate.current)}°`);
  if (room.climate?.heating) badges.push("🔥");
  if (room.speakers.some((id) => playing.has(id))) badges.push("🎵");
  if (room.covers.some((c) => c.position !== null && c.position < 50)) badges.push("▾");
  return { glow, badges };
}
