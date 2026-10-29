// Lys, varme og persienner fra Home Assistant, samlet per rom etter romkartet (rooms.ts).
// Rene funksjoner uten nettverk, slik at de kan testes.

import { OUTDOOR_SCENE_PREFIXES, OUTDOOR_TEMP, ROOMS, SHARED_COVERS, type RoomConfig } from "./rooms";

interface StateLike {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export interface Light {
  id: string;
  name: string;
  on: boolean;
  available: boolean;
  /** 0–100, null hvis lyset bare kan slås av og på. */
  brightness: number | null;
  dimmable: boolean;
  /** Fargetemperatur i kelvin, med grensene lyset tåler. Null hvis lyset ikke har det. */
  kelvin: { value: number | null; min: number; max: number } | null;
}

export interface Scene {
  id: string;
  name: string;
}

export interface Climate {
  id: string;
  name: string;
  available: boolean;
  current: number | null;
  target: number | null;
  min: number;
  max: number;
  heating: boolean;
  humidity: number | null;
  floor: number | null;
}

export interface Cover {
  id: string;
  name: string;
  available: boolean;
  /** 0 = nede, 100 = oppe (som i Home Assistant). Null hvis persiennen ikke melder posisjon. */
  position: number | null;
  moving: "opening" | "closing" | null;
}

export interface Room {
  id: string;
  name: string;
  outdoor: boolean;
  lights: Light[];
  scenes: Scene[];
  climate: Climate | null;
  covers: Cover[];
}

export interface HomeState {
  rooms: Room[];
  sharedCovers: Cover[];
  outdoorTemp: number | null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const numState = (s: StateLike | undefined) => {
  const n = s ? Number(s.state) : NaN;
  return Number.isFinite(n) ? n : null;
};

function toLight(s: StateLike, name: string): Light {
  const a = s.attributes;
  const modes = Array.isArray(a.supported_color_modes) ? (a.supported_color_modes as string[]) : [];
  const dimmable = modes.some((m) => m !== "onoff");
  const hasKelvin = modes.includes("color_temp");
  const bright = num(a.brightness);
  return {
    id: s.entity_id,
    name,
    on: s.state === "on",
    available: s.state !== "unavailable",
    brightness: dimmable ? (s.state === "on" && bright !== null ? Math.max(1, Math.round((bright / 255) * 100)) : 0) : null,
    dimmable,
    kelvin: hasKelvin
      ? { value: num(a.color_temp_kelvin), min: num(a.min_color_temp_kelvin) ?? 2000, max: num(a.max_color_temp_kelvin) ?? 6500 }
      : null,
  };
}

function toCover(s: StateLike, name: string): Cover {
  return {
    id: s.entity_id,
    name,
    available: s.state !== "unavailable",
    position: num(s.attributes.current_position),
    moving: s.state === "opening" || s.state === "closing" ? s.state : null,
  };
}

/**
 * «Stue Lyst» → «Lyst». Hue gir navnet på scenen i `name`; ellers fjernes gruppenavnet foran.
 * I rom med flere Hue-grupper (ute) står gruppen foran: «Snuplassen: høst».
 */
function sceneName(s: StateLike, withGroup: boolean): string {
  const friendly = typeof s.attributes.friendly_name === "string" ? s.attributes.friendly_name : s.entity_id;
  const group = typeof s.attributes.group_name === "string" ? s.attributes.group_name : "";
  const strip = (t: string) => (group && t.toLowerCase().startsWith(group.toLowerCase() + " ") ? t.slice(group.length + 1) : t);
  // Hue kaller noen scener «Taket Kveld» i gruppen «Taket»; gruppenavnet tas bort.
  const own = strip(typeof s.attributes.name === "string" ? s.attributes.name : friendly);
  const name = own.charAt(0).toUpperCase() + own.slice(1);
  return withGroup && group ? `${group}: ${name}` : name;
}

function scenesFor(room: RoomConfig, states: StateLike[]): Scene[] {
  const prefixes = [...(room.scenePrefix ? [room.scenePrefix] : []), ...(OUTDOOR_SCENE_PREFIXES[room.id] ?? [])];
  const seen = new Set<string>();
  return states
    .filter((s) => s.entity_id.startsWith("scene.") && prefixes.some((p) => s.entity_id.startsWith(`scene.${p}_`)))
    .map((s) => ({ id: s.entity_id, name: sceneName(s, prefixes.length > 1) }))
    .filter((s) => (seen.has(s.name.toLowerCase()) ? false : (seen.add(s.name.toLowerCase()), true)))
    .sort((a, b) => a.name.localeCompare(b.name, "nb"));
}

/**
 * Bygger rommene. Lys som ikke står i romkartet, legges i «Andre lys», bortsett fra Hue-grupper
 * og lys som allerede styres av en Hue-gruppe i kartet (lyslistene på taket o.l.).
 */
export function toHome(states: StateLike[], rooms: RoomConfig[] = ROOMS): HomeState {
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  const listed = new Set(rooms.flatMap((r) => (r.lights ?? []).map((x) => x.id)));
  const inListedGroup = new Set(
    [...listed].flatMap((id) => {
      const members = byId.get(id)?.attributes.lights;
      return Array.isArray(members) ? (members as string[]) : [];
    })
  );

  const result: Room[] = rooms.map((r) => {
    const climate = r.climate ? byId.get(r.climate) : undefined;
    return {
      id: r.id,
      name: r.name,
      outdoor: !!r.outdoor,
      lights: (r.lights ?? []).flatMap((x) => {
        const s = byId.get(x.id);
        return s ? [toLight(s, x.name)] : [];
      }),
      scenes: scenesFor(r, states),
      climate: climate
        ? {
            id: climate.entity_id,
            name: r.name,
            available: climate.state !== "unavailable",
            current: num(climate.attributes.current_temperature),
            target: num(climate.attributes.temperature),
            min: num(climate.attributes.min_temp) ?? 5,
            max: num(climate.attributes.max_temp) ?? 30,
            heating: climate.attributes.hvac_action === "heating",
            humidity: numState(r.humidity ? byId.get(r.humidity) : undefined),
            floor: numState(r.floorTemp ? byId.get(r.floorTemp) : undefined),
          }
        : null,
      covers: (r.covers ?? []).flatMap((x) => {
        const s = byId.get(x.id);
        return s ? [toCover(s, x.name)] : [];
      }),
    };
  });

  const others = states
    .filter((s) => {
      if (!s.entity_id.startsWith("light.") || listed.has(s.entity_id) || s.state === "unavailable") return false;
      if (s.attributes.is_hue_group === true) return false;
      return !inListedGroup.has(String(s.attributes.friendly_name ?? ""));
    })
    .map((s) => toLight(s, String(s.attributes.friendly_name ?? s.entity_id).trim()))
    .sort((a, b) => a.name.localeCompare(b.name, "nb"));
  if (others.length) result.push({ id: "andre", name: "Andre lys", outdoor: false, lights: others, scenes: [], climate: null, covers: [] });

  return {
    rooms: result,
    sharedCovers: SHARED_COVERS.flatMap((x) => {
      const s = byId.get(x.id);
      return s ? [toCover(s, x.name)] : [];
    }),
    outdoorTemp: numState(byId.get(OUTDOOR_TEMP)),
  };
}

/** Lys som er på (og svarer) i rommene. */
export function lightsOn(rooms: Room[]): Light[] {
  return rooms.flatMap((r) => r.lights.filter((x) => x.on && x.available));
}

/** Ny ønsket temperatur ett steg opp eller ned, i halve grader og innenfor grensene. */
export function stepTarget(climate: Climate, delta: number): number | null {
  if (climate.target === null) return null;
  const next = Math.round((climate.target + delta) * 2) / 2;
  return Math.min(climate.max, Math.max(climate.min, next));
}
