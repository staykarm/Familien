// Huset på dashboardet: «God natt», «Utelys av» og én statuslinje per område (varme, roboter, vanning …).
// Rene funksjoner uten nettverk, slik at de kan testes.

import { undoLight, type UndoItem } from "./agentTargets";
import type { HomeState, Light } from "./home";
import type { Robot } from "./robots";
import { groupName, type SpeakerGroup } from "./sonos";
import type { Watering } from "./watering";

export interface LightsOff {
  ids: string[];
  /** Det som trengs for å sette lysene tilbake («Angre»). */
  undo: UndoItem[];
}

const lit = (lights: Light[]) => lights.filter((l) => l.available && l.on);

function off(lights: Light[]): LightsOff {
  return { ids: lights.map((l) => l.id), undo: lights.map(undoLight) };
}

/** «God natt»: alt lys som er på inne. Utelyset røres ikke. Foreløpig bare lys. */
export function goodNight(home: HomeState): LightsOff {
  return off(home.rooms.filter((r) => !r.outdoor).flatMap((r) => lit(r.lights)));
}

/** «Utelys av»: lys som er på i rommene ute. */
export function outdoorOff(home: HomeState): LightsOff {
  return off(home.rooms.filter((r) => r.outdoor).flatMap((r) => lit(r.lights)));
}

export type StatusArea = "lys" | "varme" | "persienner" | "roboter" | "vanning";

export interface StatusRow {
  area: StatusArea;
  label: string;
  /** Kort tekst: «6 rom · 21–23°», «Støve i laderen 100 %». */
  value: string;
  /** Noe er galt (feil på robot eller ventil). */
  alert: boolean;
  /** Noe er i gang (varmer, støvsuger, vanner). */
  active: boolean;
}

const deg = (n: number) => `${Math.round(n)}°`;

/** Én linje per område, i fast rekkefølge. Områder uten enheter tas ikke med. */
export function houseStatus(home: HomeState, robots: Robot[], watering: Watering): StatusRow[] {
  const rows: StatusRow[] = [];
  const indoor = home.rooms.filter((r) => !r.outdoor);

  const litRooms = home.rooms.filter((r) => lit(r.lights).length);
  const lights = home.rooms.flatMap((r) => r.lights);
  if (lights.length) {
    const inside = litRooms.filter((r) => !r.outdoor).length;
    const outside = litRooms.length - inside;
    const value = !litRooms.length ? "Alt av" : [inside ? `${inside} rom inne` : "", outside ? `${outside} ute` : ""].filter(Boolean).join(" · ");
    rows.push({ area: "lys", label: "Lys", value, alert: false, active: litRooms.length > 0 });
  }

  const climates = indoor.flatMap((r) => (r.climate?.available ? [r.climate] : []));
  if (climates.length) {
    const temps = climates.map((c) => c.current).filter((t): t is number => t !== null);
    const heating = climates.filter((c) => c.heating).length;
    const range = temps.length ? (Math.round(Math.min(...temps)) === Math.round(Math.max(...temps)) ? deg(temps[0]) : `${Math.round(Math.min(...temps))}–${deg(Math.max(...temps))}`) : "–";
    rows.push({ area: "varme", label: "Varme", value: heating ? `${range} · varmer i ${heating} rom` : range, alert: false, active: heating > 0 });
  }

  const covers = [...home.rooms.flatMap((r) => r.covers), ...home.sharedCovers].filter((c) => c.available && c.position !== null);
  if (covers.length) {
    const down = covers.filter((c) => c.position! < 50).length;
    rows.push({ area: "persienner", label: "Persienner", value: down === 0 ? "Alle oppe" : down === covers.length ? "Alle nede" : `${down} av ${covers.length} nede`, alert: false, active: false });
  }

  if (robots.length) {
    const busy = robots.filter((r) => r.active);
    const broken = robots.filter((r) => r.problems.length);
    const value = broken.length
      ? `${broken[0].name}: ${broken[0].problems[0]}`
      : busy.length
        ? busy.map((r) => `${r.name} ${r.status.toLowerCase()}${r.room ? ` i ${r.room}` : ""}`).join(" · ")
        : `${robots.length} i ro`;
    rows.push({ area: "roboter", label: "Roboter", value, alert: broken.length > 0, active: busy.length > 0 });
  }

  if (watering.valves.length) {
    const open = watering.valves.filter((v) => v.open);
    const online = watering.valves.filter((v) => v.available);
    const broken = online.filter((v) => v.problem);
    const value = open.length ? `Vanner ${open.map((v) => v.name).join(", ")}` : broken.length ? `${broken[0].name}: ${broken[0].problem}` : online.length ? `${online.length} soner klare` : "Tatt inn for sesongen";
    rows.push({ area: "vanning", label: "Vanning", value, alert: !open.length && broken.length > 0, active: open.length > 0 });
  }

  return rows;
}

export interface PlayingNow {
  leader: string;
  rooms: string;
  title: string;
}

/** Det som spiller nå, gruppe for gruppe. */
export function playingNow(groups: SpeakerGroup[]): PlayingNow[] {
  return groups
    .filter((g) => g.leader.status === "playing")
    .map((g) => ({
      leader: g.leader.id,
      rooms: groupName(g),
      title: [g.leader.title, g.leader.artist].filter(Boolean).join(" – ") || g.leader.source || "Spiller",
    }));
}
