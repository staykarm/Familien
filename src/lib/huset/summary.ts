// «Huset nå» på «I dag»: hva som er på i hvilke rom, og det som trenger oppmerksomhet.
// Rene funksjoner uten nettverk, slik at de kan testes.

import { roomBrightness, type HomeState } from "./home";
import type { Robot } from "./robots";
import { groupName, type SpeakerGroup } from "./sonos";

export interface SummaryLine {
  /** Rommet, gruppen av høyttalere eller roboten. */
  name: string;
  /** «lys 9 %», «musikk: Losing My Religion – R.E.M.», «støvsuger i Kjøkken». */
  parts: string[];
}

export interface HouseSummary {
  lines: SummaryLine[];
  /** Feil som må fikses, f.eks. «Støve 2: Lokket … står åpent». */
  alerts: string[];
}

/** Bare det som er på. Tomt når alt er av og ingenting spiller. */
export function summarizeHouse(home: HomeState, groups: SpeakerGroup[], robots: Robot[]): HouseSummary {
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

  const alerts = robots.flatMap((r) => r.problems.map((p) => `${r.name}: ${p}`));
  return { lines, alerts };
}
