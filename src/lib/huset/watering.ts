// Vanning (Gardena smart system): ventiler (valve.*) og jordsensorer, samlet i soner.
// Rene funksjoner uten nettverk, slik at de kan testes.

interface StateLike {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export type ZoneKind = "plen" | "bedd" | "tak";

export interface Valve {
  id: string;
  name: string;
  kind: ZoneKind;
  open: boolean;
  available: boolean;
  /** Når vanningen stopper av seg selv (ISO), hvis den går. */
  endsAt: string | null;
  /** Vanningstiden som brukes når den startes (minutter), fra Gardena. */
  minutes: number | null;
  /** Entity for vanningstiden (number.*), så den kan endres før start. */
  durationId: string | null;
  battery: number | null;
  problem: string | null;
}

export interface SoilSensor {
  id: string;
  name: string;
  humidity: number | null;
  temperature: number | null;
  battery: number | null;
}

export interface Watering {
  valves: Valve[];
  sensors: SoilSensor[];
}

/** Standard vanningstid per type sone (minutter) når man trykker «Vann nå». */
export const DEFAULT_MINUTES: Record<ZoneKind, number> = { plen: 20, bedd: 15, tak: 10 };
export const QUICK_MINUTES = [5, 10, 15, 20, 30];

const ERRORS: Record<string, string> = {
  low_battery_prevents_starting: "Tomt batteri – bytt batteri",
  frost_prevents_starting: "Frost – vanner ikke",
  not_connected: "Ikke tilkoblet",
  valve_broken: "Ventilen er ødelagt",
  watering_canceled: "Vanningen ble avbrutt",
  watering_duration_too_short: "For kort vanningstid",
  concurrent_limit_reached: "For mange ventiler åpne samtidig",
  valve_current_max_exceeded: "For høy strøm i ventilen",
  total_current_max_exceeded: "For høy strøm totalt",
  valve_power_supply_failed: "Strømforsyningen til ventilen svikter",
};

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** «Plen Nordvest Plen vest» → «Plen vest»: Gardena gjentar navnet på kontrollboksen foran ventilen. */
function valveName(friendly: string): string {
  const words = friendly.trim().split(/\s+/);
  for (let n = Math.floor(words.length / 2); n >= 1; n--) {
    const head = words.slice(0, n).join(" ");
    const rest = words.slice(n).join(" ");
    if (rest && (rest.toLowerCase() === head.toLowerCase() || rest.toLowerCase().startsWith(words[0].toLowerCase() + " "))) return rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  return friendly.trim();
}

function zoneKind(id: string, name: string): ZoneKind {
  const t = `${id} ${name}`.toLowerCase();
  if (t.includes("plen")) return "plen";
  if (t.includes("tak")) return "tak";
  return "bedd";
}

/** Ventiler og jordsensorer fra alle tilstandene. */
export function toWatering(states: StateLike[]): Watering {
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  const valves: Valve[] = states
    .filter((s) => s.entity_id.startsWith("valve."))
    .map((s) => {
      const base = s.entity_id.slice("valve.".length);
      const durationId = [`number.${base}_watering_duration`, `number.${base}_${base}_watering_duration`].find((id) => byId.has(id)) ?? null;
      const duration = durationId ? byId.get(durationId) : undefined;
      const error = byId.get(`sensor.${base}_error`)?.state ?? null;
      const end = byId.get(`sensor.${base}_watering_end`)?.state ?? null;
      const name = valveName(String(s.attributes.friendly_name ?? base));
      const open = s.state === "open" || s.state === "opening";
      return {
        id: s.entity_id,
        name,
        kind: zoneKind(base, name),
        open,
        available: s.state !== "unavailable",
        endsAt: open && end && !Number.isNaN(Date.parse(end)) ? end : null,
        minutes: num(duration?.state),
        durationId,
        battery: num(s.attributes.battery_level) ?? num(byId.get(`sensor.${base}_battery_level`)?.state),
        problem: error && error !== "no_message" && error !== "unavailable" && error !== "unknown" ? (ERRORS[error] ?? error.replace(/_/g, " ")) : null,
      };
    })
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, "nb"));

  const sensors: SoilSensor[] = states
    .filter((s) => /^sensor\..+_soil_humidity$/.test(s.entity_id))
    .map((s) => {
      const base = s.entity_id.slice("sensor.".length, -"_soil_humidity".length);
      const temp = states.find((x) => x.entity_id.startsWith(`sensor.${base}_soil_temperature`));
      return {
        id: s.entity_id,
        name: String(s.attributes.friendly_name ?? base).replace(/\s*Soil Humidity$/i, "").replace(/^Sensor\s+/i, ""),
        humidity: num(s.state),
        temperature: num(temp?.state),
        battery: num(byId.get(`sensor.${base}_battery_level`)?.state),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "nb"));

  return { valves, sensors };
}

export type Advice = { level: "ok" | "info" | "warn"; text: string };

/**
 * Råd ut fra jorda og været: tørr jord → vann, fuktig jord → vent, frost → ikke vann og gjør anlegget klart for vinteren.
 * Grensene er vanlige tommelfingerregler for Gardena-sensoren (fukt i prosent).
 */
export function wateringAdvice(sensors: SoilSensor[], outdoorTemp: number | null): Advice[] {
  const advice: Advice[] = [];
  const temps = sensors.map((s) => s.temperature).filter((t): t is number => t !== null);
  const coldest = Math.min(...temps, outdoorTemp ?? Infinity);
  if (coldest <= 2) advice.push({ level: "warn", text: "Frostfare. Ikke vann, og tøm slanger og ventiler så de ikke fryser i stykker." });
  else if (coldest <= 8) advice.push({ level: "info", text: "Kjølig jord: planter trenger lite vann nå. Vann sjelden, og gjør anlegget klart for vinteren før frosten kommer." });
  for (const s of sensors) {
    if (s.humidity === null) continue;
    if (s.humidity < 30) advice.push({ level: "warn", text: `${s.name}: tørr jord (${s.humidity} %). Vann i dag, helst tidlig om morgenen.` });
    else if (s.humidity > 50) advice.push({ level: "ok", text: `${s.name}: fuktig nok (${s.humidity} %). Ingen vanning trengs.` });
    else advice.push({ level: "ok", text: `${s.name}: passe fuktig (${s.humidity} %).` });
  }
  return advice;
}
