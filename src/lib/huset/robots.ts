// Robotene i huset: støvsugere (Roborock, vacuum.*) og robotgressklippere (lawn_mower.*).
// Rene funksjoner uten nettverk, slik at de kan testes. Vanning kommer når den er satt opp i Home Assistant.

interface StateLike {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export type RobotKind = "vacuum" | "mower";

export interface Robot {
  id: string;
  kind: RobotKind;
  name: string;
  /** Tilstanden fra Home Assistant (cleaning, docked, mowing …). */
  state: string;
  /** Kort på norsk: «Lader», «Støvsuger», «Klipper» … */
  status: string;
  /** I gang (støvsuger, klipper eller på vei hjem). */
  active: boolean;
  available: boolean;
  battery: number | null;
  /** Rommet støvsugeren er i (bare når den er i gang). */
  room: string | null;
  /** Feil som må fikses før roboten virker som den skal. */
  problems: string[];
  /** Deler som er på overtid og skal byttes eller rengjøres. */
  maintenance: string[];
}

const VACUUM_STATUS: Record<string, string> = {
  cleaning: "Støvsuger",
  docked: "I laderen",
  returning: "På vei hjem",
  paused: "Pause",
  idle: "Står stille",
  error: "Feil",
  unavailable: "Svarer ikke",
};

const MOWER_STATUS: Record<string, string> = {
  mowing: "Klipper",
  docked: "I laderen",
  returning: "På vei hjem",
  paused: "Pause",
  error: "Feil",
  unavailable: "Svarer ikke",
};

/** Roborock sin egen status, når den sier mer enn tilstanden (f.eks. lader). */
const ROBOROCK_STATUS: Record<string, string> = {
  charging: "Lader",
  charging_complete: "Ferdig ladet",
  emptying_the_bin: "Tømmer i dokken",
  washing_the_mop: "Vasker moppen",
  going_to_wash_the_mop: "På vei for å vaske moppen",
  segment_cleaning: "Støvsuger rom",
  zoned_cleaning: "Støvsuger sone",
  spot_cleaning: "Støvsuger et punkt",
  returning_home: "På vei hjem",
  docking: "Parkerer",
  error: "Feil",
};

const ERRORS: Record<string, string> = {
  dirty_tank_latch_open: "Lokket på skittentvannstanken i dokken står åpent",
  clean_tank_latch_open: "Lokket på rentvannstanken i dokken står åpent",
  water_empty: "Rentvannstanken er tom",
  waste_water_tank_full: "Skittentvannstanken er full",
  dirty_box_full: "Skittentvannstanken er full",
  clean_water_box_empty: "Rentvannstanken er tom",
  duct_blockage: "Tett rør i dokken",
  main_brush_jammed: "Hovedbørsten sitter fast",
  side_brush_jammed: "Sidebørsten sitter fast",
  wheels_jammed: "Hjulene sitter fast",
  robot_trapped: "Står fast",
  cliff_sensor_error: "Stopp: sensoren mot trapper",
  bin_full: "Støvbeholderen er full",
  low_battery: "Lavt batteri",
};

/** Roborock gir standardnavn på rommene på engelsk; egne navn fra appen beholdes. */
const ROOMS: Record<string, string> = {
  study: "Kontor",
  office: "Kontor",
  kitchen: "Kjøkken",
  "living room": "Stue",
  "dining room": "Spisestue",
  bedroom: "Soverom",
  "master bedroom": "Hovedsoverom",
  "children's room": "Barnerom",
  "kids room": "Barnerom",
  "guest room": "Gjesterom",
  bathroom: "Bad",
  toilet: "Toalett",
  corridor: "Gang",
  hallway: "Gang",
  entrance: "Entré",
  "laundry room": "Vaskerom",
  storage: "Bod",
  balcony: "Balkong",
};

export function roomName(room: string): string {
  return ROOMS[room.toLowerCase()] ?? room;
}

/** Deler som har en «time_left»-sensor, og hva de heter på norsk. */
const PARTS: [string, string][] = [
  ["main_brush", "Hovedbørste"],
  ["side_brush", "Sidebørste"],
  ["filter", "Filter"],
  ["sensor", "Sensorer (rengjør)"],
  ["dock_strainer", "Sil i dokken"],
  ["dock_maintenance_brush", "Børste i dokken"],
];

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const known = (v: string | null) => (v && !["unknown", "unavailable", "none", "ok"].includes(v) ? v : null);

function errorText(code: string): string {
  return ERRORS[code] ?? code.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** Støvsugere og gressklippere fra alle tilstandene. Sensorene til en Roborock heter sensor.<navn>_*. */
export function toRobots(states: StateLike[]): Robot[] {
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  const robots: Robot[] = [];

  for (const s of states) {
    const isVacuum = s.entity_id.startsWith("vacuum.");
    const isMower = s.entity_id.startsWith("lawn_mower.");
    if (!isVacuum && !isMower) continue;
    const base = s.entity_id.split(".")[1];
    const sensor = (suffix: string) => byId.get(`sensor.${base}_${suffix}`)?.state ?? null;
    const flag = (suffix: string) => byId.get(`binary_sensor.${base}_${suffix}`)?.state === "on";
    const name = text(s.attributes.friendly_name) ?? base.replace(/_/g, " ");
    const available = s.state !== "unavailable";

    if (isMower) {
      robots.push({
        id: s.entity_id,
        kind: "mower",
        name,
        state: s.state,
        status: MOWER_STATUS[s.state] ?? s.state,
        active: s.state === "mowing" || s.state === "returning",
        available,
        battery: num(s.attributes.battery),
        room: null,
        problems: s.state === "error" ? ["Feil på klipperen. Sjekk appen til klipperen."] : [],
        maintenance: [],
      });
      continue;
    }

    const own = known(sensor("status"));
    const problems = [known(sensor("vacuum_error")), known(sensor("dock_dock_error"))].filter((x): x is string => !!x).map(errorText);
    if (flag("water_shortage")) problems.push("Rentvannstanken er tom");
    const active = s.state === "cleaning" || s.state === "returning";
    const room = known(sensor("current_room"));
    robots.push({
      id: s.entity_id,
      kind: "vacuum",
      name,
      state: s.state,
      status: (own && ROBOROCK_STATUS[own]) ?? VACUUM_STATUS[s.state] ?? s.state,
      active,
      available,
      battery: num(sensor("batteri") ?? sensor("battery")) ?? num(s.attributes.battery_level),
      room: active && room ? roomName(room) : null,
      problems: [...new Set(problems)],
      maintenance: PARTS.flatMap(([suffix, label]) => {
        const left = num(sensor(`${suffix}_time_left`));
        return left !== null && left <= 0 ? [label] : [];
      }),
    });
  }
  return robots.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, "nb") : a.kind === "vacuum" ? -1 : 1));
}
