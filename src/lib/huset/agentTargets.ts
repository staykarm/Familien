// Hvilke enheter en beskjed til Huset gjelder («stua», «1. etasje», «ute», «hele huset»),
// og hvordan de skal settes tilbake med «Angre». Rene funksjoner uten nettverk, slik at de kan testes.

import type { Climate, Cover, HomeState, Light, Room } from "./home";
import type { Robot } from "./robots";
import { airText } from "./air";
import { applianceText } from "./appliances";
import { cheapestWindow, kr, watt, windowLabel, type Energy, type PricePoint } from "./energy";
import type { Safety } from "./safety";
import type { Watering } from "./watering";

/** Hvor noe skal skje. Tomt mål betyr ingenting (ikke hele huset), så Claude må si `all: true`. */
export interface Target {
  rooms?: string[];
  /** 1, 2 eller "ute". */
  floors?: (1 | 2 | "ute")[];
  /** Enkelte lys, termostater eller persienner (entity-id). */
  ids?: string[];
  all?: boolean;
}

/** Rommene målet gjelder. Ukjente rom-id-er hoppes over. */
export function targetRooms(home: HomeState, t: Target): Room[] {
  if (t.all) return home.rooms;
  const rooms = new Set(t.rooms ?? []);
  const floors = new Set(t.floors ?? []);
  return home.rooms.filter((r) => rooms.has(r.id) || (r.outdoor ? floors.has("ute") : r.floor !== null && floors.has(r.floor)));
}

function pick<T extends { id: string; available: boolean }>(home: HomeState, t: Target, of: (r: Room) => T[], shared: T[] = []): T[] {
  const ids = new Set(t.ids ?? []);
  const fromRooms = targetRooms(home, t).flatMap(of);
  const fromIds = [...home.rooms.flatMap(of), ...shared].filter((x) => ids.has(x.id));
  const seen = new Set<string>();
  return [...fromRooms, ...fromIds].filter((x) => x.available && !seen.has(x.id) && (seen.add(x.id), true));
}

/** Lysene i målet. Med `onlyLit` bare de som er på (å dimme gjelder som regel lys som allerede lyser). */
export function targetLights(home: HomeState, t: Target, onlyLit = false): Light[] {
  return pick(home, t, (r) => r.lights).filter((x) => !onlyLit || x.on);
}

export function targetClimates(home: HomeState, t: Target): Climate[] {
  return pick(home, t, (r) => (r.climate ? [r.climate] : []));
}

export function targetCovers(home: HomeState, t: Target): Cover[] {
  // Fellesstyringen (stue/kjøkken/spisestue) er med når hele huset eller 2. etasje gjelder.
  const shared = t.all || t.floors?.includes(2) ? home.sharedCovers : [];
  const result = pick(home, t, (r) => r.covers, home.sharedCovers);
  for (const c of shared) if (c.available && !result.some((x) => x.id === c.id)) result.push(c);
  return result;
}

// --- Angre ----------------------------------------------------------------------

export type UndoItem =
  | { kind: "light"; id: string; on: boolean; brightness: number | null; kelvin: number | null }
  | { kind: "climate"; id: string; target: number }
  | { kind: "cover"; id: string; position: number }
  | { kind: "speaker"; id: string; volume: number | null; playing: boolean };

export function undoLight(l: Light): UndoItem {
  return { kind: "light", id: l.id, on: l.on, brightness: l.on ? l.brightness : null, kelvin: l.kelvin?.value ?? null };
}

export function undoClimate(c: Climate): UndoItem | null {
  return c.target === null ? null : { kind: "climate", id: c.id, target: c.target };
}

/** Persienner som ikke melder posisjon (fellesstyring), kan ikke settes tilbake. */
export function undoCover(c: Cover): UndoItem | null {
  return c.position === null ? null : { kind: "cover", id: c.id, position: c.position };
}

/** Beholder bare den første (eldste) tilstanden per enhet, så «Angre» går helt tilbake til før beskjeden. */
export function mergeUndo(items: UndoItem[]): UndoItem[] {
  const seen = new Set<string>();
  return items.filter((x) => !seen.has(x.id) && (seen.add(x.id), true));
}

// --- Oversikt til Claude ----------------------------------------------------------

const pct = (n: number | null) => (n === null ? "" : ` ${n}%`);

/**
 * Kort tekst om huset akkurat nå, som Claude får sammen med beskjeden. Bare det som kan styres i Huset står her,
 * så Claude aldri får se (eller prøve å styre) døråpnere, takluke o.l.
 */
export function describeHome(
  home: HomeState,
  speakers: { id: string; name: string; status: string; volume: number | null; title: string | null; artist: string | null; sources: string[]; groupMembers: string[] }[],
  presets: { id: string; name: string; speakerIds: string[] }[],
  robots: Robot[] = [],
  watering: Watering = { valves: [], sensors: [] },
  more: { energy?: Energy; safety?: Safety; prices?: PricePoint[]; now?: Date } = {}
): string {
  const lines: string[] = [];
  if (home.outdoorTemp !== null) lines.push(`Ute: ${home.outdoorTemp.toFixed(1)} °C`);
  lines.push("", "ROM (id · navn · etasje):");
  for (const r of home.rooms) {
    const where = r.outdoor ? "ute" : r.floor ? `${r.floor}. etg` : "inne";
    lines.push(`- ${r.id} · ${r.name} · ${where}`);
    const lights = r.lights.filter((x) => x.available);
    if (lights.length) lines.push(`  lys: ${lights.map((x) => `${x.name} [${x.id}] ${x.on ? "på" + pct(x.brightness) : "av"}`).join("; ")}`);
    if (r.scenes.length) lines.push(`  scener: ${r.scenes.map((s) => `${s.name} [${s.id}]`).join("; ")}`);
    if (r.climate?.available) lines.push(`  varme: nå ${r.climate.current ?? "?"} °C, ønsket ${r.climate.target ?? "?"} °C${r.climate.heating ? ", varmer" : ""}`);
    for (const c of r.covers.filter((x) => x.available)) lines.push(`  persienne: ${c.name} [${c.id}] ${c.position === null ? "" : `${c.position}% oppe`}`);
    if (r.speakers.length) lines.push(`  høyttalere: ${r.speakers.join(", ")}`);
  }
  if (home.sharedCovers.length) lines.push(`Felles persienner: ${home.sharedCovers.map((c) => `${c.name} [${c.id}]`).join("; ")}`);
  lines.push("", "HØYTTALERE (Sonos):");
  for (const s of speakers) {
    if (s.status === "unavailable") {
      lines.push(`- ${s.name} [${s.id}] svarer ikke`);
      continue;
    }
    const now = s.title ? ` «${[s.title, s.artist].filter(Boolean).join(" – ")}»` : "";
    const group = s.groupMembers.length > 1 ? `, spiller sammen med ${s.groupMembers.filter((g) => g !== s.id).join(", ")}` : "";
    lines.push(`- ${s.name} [${s.id}] ${s.status}${now}, volum ${s.volume ?? "?"}${group}`);
  }
  const favorites = [...new Set(speakers.flatMap((s) => s.sources))];
  if (favorites.length) lines.push(`Sonos-favoritter: ${favorites.join("; ")}`);
  if (presets.length) lines.push("", `FASTE GRUPPER: ${presets.map((p) => `${p.name} [${p.id}]`).join("; ")}`);
  if (robots.length) {
    lines.push("", "ROBOTER:");
    for (const r of robots) {
      const kind = r.kind === "vacuum" ? "støvsuger" : "gressklipper";
      const extra = [r.battery !== null ? `batteri ${r.battery}%` : "", r.room ? `i ${r.room}` : "", ...r.problems].filter(Boolean).join(", ");
      lines.push(`- ${r.name} [${r.id}] ${kind}: ${r.status}${extra ? ` (${extra})` : ""}`);
    }
  }
  if (watering.valves.length) {
    lines.push("", "VANNING (Gardena):");
    for (const v of watering.valves) {
      const state = !v.available ? "svarer ikke" : v.open ? "vanner" : "av";
      lines.push(`- ${v.name} [${v.id}] ${v.kind}: ${state}${v.minutes ? `, vanningstid ${v.minutes} min` : ""}${v.problem ? `, ${v.problem}` : ""}`);
    }
    for (const s of watering.sensors) lines.push(`  jord ${s.name}: fukt ${s.humidity ?? "?"} %, ${s.temperature ?? "?"} °C`);
  }
  if (home.air?.length) {
    lines.push("", "LUFTSENSORER (Homely, bare til info):");
    for (const a of home.air) lines.push(`- ${a.name}: ${airText(a)}`);
  }
  const switches = home.rooms.flatMap((r) => r.switches ?? []);
  if (switches.length) lines.push("", `BRYTERE (bare til info): ${switches.map((s) => `${s.name}: ${!s.available ? "svarer ikke" : s.on ? "på" : "av"}`).join(", ")}`);
  const hatch = home.rooms.find((r) => r.hatch)?.hatch;
  if (hatch) lines.push("", `TAKLUKE (bare til info – kan aldri åpnes eller lukkes herfra): ${hatch.text.toLowerCase()}${hatch.fromContact ? "" : " (anslått ut fra siste åpne/lukke)"}`);
  if (home.appliances?.length) {
    lines.push("", "MASKINER (Miele, bare til info – kan ikke startes eller stoppes herfra):");
    for (const a of home.appliances) {
      const levels = a.levels.length ? ` (${a.levels.map((l) => `${l.name} ${l.percent} %`).join(", ")})` : "";
      lines.push(`- ${a.name}: ${applianceText(a)}${a.doorOpen ? ", døra er åpen" : ""}${levels}`);
    }
  }
  const { energy, safety, prices = [], now = new Date() } = more;
  if (energy && energy.price !== null) {
    lines.push("", "STRØM (Tibber, bare til info):");
    lines.push(`- pris nå ${kr(energy.price)}/kWh (${energy.level ?? "?"}); i dag laveste ${kr(energy.min)}, snitt ${kr(energy.avg)}, høyeste ${kr(energy.max)}`);
    lines.push(`- effekt nå ${watt(energy.powerW)}; brukt i dag ${energy.todayKwh?.toFixed(1) ?? "?"} kWh (${kr(energy.todayCost)}); denne måneden ${energy.monthKwh?.toFixed(0) ?? "?"} kWh (${kr(energy.monthCost, 0)})`);
    const best = cheapestWindow(prices, now, 3);
    if (best) lines.push(`- billigste tre timer fram i tid: kl. ${windowLabel(best)} (snitt ${kr(best.avg)})`);
    const ahead = prices.filter((h) => Date.parse(h.start) > now.getTime() - 60 * 60_000).slice(0, 36);
    if (ahead.length) lines.push(`- timepriser: ${ahead.map((h) => `${h.start.slice(11, 13)}: ${h.price.toFixed(2)}`).join(", ")}`);
  }
  if (energy?.cars.length) {
    lines.push("", "ELBILER (bare til info):");
    for (const c of energy.cars) {
      lines.push(`- ${c.name}: ${c.online ? `batteri ${c.battery ?? "?"} % (mål ${c.target ?? "?"} %), rekkevidde ${c.rangeKm ?? "?"} km${c.charging ? ", lader" : c.plugged ? ", plugget inn" : ""}` : "ikke tilkoblet"}`);
    }
  }
  if (safety && (safety.alarm || safety.smoke.length)) {
    lines.push("", "SIKKERHET (Homely, bare til info – kan aldri styres herfra):");
    if (safety.alarm) lines.push(`- alarm: ${safety.alarm.label}`);
    if (safety.smoke.length) lines.push(`- røykvarslere: ${safety.smoke.map((x) => `${x.name} ${x.fire ? "BRANN" : !x.online ? "svarer ikke" : x.lowBattery ? "lavt batteri" : "ok"}`).join("; ")}`);
    for (const p of safety.problems) lines.push(`- OBS: ${p}`);
  }
  return lines.join("\n");
}
