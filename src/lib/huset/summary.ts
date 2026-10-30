// «Huset nå» på «I dag»: hva som er på i hvilke rom, og det som trenger oppmerksomhet.
// Rene funksjoner uten nettverk, slik at de kan testes.

import { roomBrightness, type HomeState } from "./home";
import type { Robot } from "./robots";
import { groupName, type SpeakerGroup } from "./sonos";
import { airAlerts } from "./air";
import { houseStatus, playingNow, type PlayingNow, type StatusRow } from "./dashboard";
import type { Energy } from "./energy";
import type { Safety } from "./safety";
import type { Watering } from "./watering";

export interface SummaryLine {
  /** Rommet, gruppen av høyttalere eller roboten. */
  name: string;
  /** «lys 9 %», «musikk: Losing My Religion – R.E.M.», «støvsuger i Kjøkken». */
  parts: string[];
}

export interface HouseSummary {
  /** Én linje per område, som «Huset nå» på dashboardet (`houseStatus`). */
  rows: StatusRow[];
  /** Det som spiller nå. */
  playing: PlayingNow[];
  lines: SummaryLine[];
  /** Feil som må fikses, f.eks. «Støve 2: Lokket … står åpent». */
  alerts: string[];
}

/** Bare det som er på. Tomt når alt er av og ingenting spiller. Feil (også fra røykvarslerne) står i `alerts`. */
export function summarizeHouse(
  home: HomeState,
  groups: SpeakerGroup[],
  robots: Robot[],
  watering: Watering = { valves: [], sensors: [] },
  safety?: Safety,
  energy?: Energy
): HouseSummary {
  const lines: SummaryLine[] = [];
  const line = (name: string) => {
    let found = lines.find((l) => l.name.toLowerCase() === name.toLowerCase());
    if (!found) lines.push((found = { name, parts: [] }));
    return found;
  };

  for (const room of home.rooms.filter((r) => !r.outdoor)) {
    const lit = room.lights.filter((l) => l.available && l.on);
    if (!lit.length) continue;
    line(room.name).parts.push(lit.some((l) => l.dimmable) ? `lys ${roomBrightness(lit)} %` : "lys");
  }
  const outside = home.rooms.filter((r) => r.outdoor && r.lights.some((l) => l.available && l.on)).map((r) => r.name);
  if (outside.length) line("Ute").parts.push(`lys: ${outside.join(", ")}`);

  for (const g of groups) {
    if (g.leader.status !== "playing") continue;
    const what = [g.leader.title, g.leader.artist].filter(Boolean).join(" – ") || g.leader.source || "";
    // En høyttaler med samme navn som et rom havner på linjen til rommet.
    line(groupName(g)).parts.push(what ? `musikk: ${what}` : "musikk");
  }

  for (const r of robots.filter((x) => x.active)) {
    line(r.name).parts.push(r.room ? `${r.status.toLowerCase()} i ${r.room}` : r.status.toLowerCase());
  }

  const wet = watering.valves.filter((v) => v.open).map((v) => v.name);
  if (wet.length) line("Vanning").parts.push(wet.join(", "));

  const alerts = [
    // Brann, utløst alarm og røykvarslere som ikke virker kommer først.
    ...(safety?.problems ?? []),
    ...airAlerts(home.air ?? []),
    ...(home.appliances ?? []).flatMap((a) => a.alerts),
    ...robots.flatMap((r) => r.problems.map((p) => `${r.name}: ${p}`)),
    ...watering.valves.filter((v) => v.available && v.problem).map((v) => `Vanning ${v.name}: ${v.problem}`),
  ];
  return { rows: houseStatus(home, robots, watering, energy, safety), playing: playingNow(groups), lines, alerts };
}
