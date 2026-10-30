// Luftsensorene fra Homely (binary_sensor.<prefiks>_tilkoblet der prefikset inneholder «luft»). I dag sender
// Home Assistant bare temperatur, signal og tilkobling for dem. CO₂, VOC og fukt leses også, slik at de
// dukker opp av seg selv hvis integrasjonen begynner å sende dem. Rene funksjoner uten nettverk.

import { ROOMS, type RoomConfig } from "./rooms";

interface StateLike {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export interface AirSensor {
  /** Prefikset til entity-id-ene (f.eks. «spisestue_luftkvalitet»). */
  id: string;
  name: string;
  roomId: string | null;
  temperature: number | null;
  humidity: number | null;
  /** ppm */
  co2: number | null;
  /** VOC slik sensoren melder den (ppb eller µg/m³). */
  voc: number | null;
  vocUnit: string | null;
  online: boolean;
  /** Signalstyrke i prosent. Under 20 % kan målingene falle ut. */
  signal: number | null;
}

/** Over dette er CO₂ høy nok til at det bør luftes (Folkehelseinstituttets anbefalte grense er 1000 ppm). */
export const CO2_HIGH = 1000;
export const WEAK_SIGNAL = 20;

const HOMELY_ROOMS: Record<string, string> = { kid_s_room: "Barnerom", entrance: "Entré" };

const num = (s: StateLike | undefined) => {
  const n = s ? Number(s.state) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function toAir(states: StateLike[], rooms: RoomConfig[] = ROOMS): AirSensor[] {
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  const names = new Map<string, number>();
  return states
    .filter((s) => /^binary_sensor\.(.*luft.*)_tilkoblet$/.test(s.entity_id))
    .map((s) => {
      const prefix = s.entity_id.replace(/^binary_sensor\./, "").replace(/_tilkoblet$/, "");
      const own = states.filter((x) => x.entity_id.startsWith(`sensor.${prefix}_`));
      const byClass = (...classes: string[]) => own.find((x) => classes.includes(String(x.attributes.device_class ?? "")));
      const room = rooms.find((r) => r.air === prefix);
      const roomKey = prefix.replace(/_luft(sensor|kvalitet)(_\d+)?$/, "");
      let name = room?.name ?? HOMELY_ROOMS[roomKey] ?? roomKey.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
      const seen = (names.get(name) ?? 0) + 1;
      names.set(name, seen);
      if (seen > 1) name = `${name} ${seen}`;
      const voc = byClass("volatile_organic_compounds", "volatile_organic_compounds_parts");
      return {
        id: prefix,
        name,
        roomId: room?.id ?? null,
        temperature: num(byClass("temperature")),
        humidity: num(byClass("humidity")),
        co2: num(byClass("carbon_dioxide")),
        voc: num(voc),
        vocUnit: voc ? String(voc.attributes.unit_of_measurement ?? "") || null : null,
        online: s.state === "on",
        signal: num(byId.get(`sensor.${prefix}_signalkvalitet`)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "nb"));
}

/** Kort tekst for én sensor: «20,9° · 41 % · CO₂ 650 ppm». */
export function airText(a: AirSensor): string {
  const parts = [
    a.temperature !== null ? `${a.temperature.toLocaleString("nb-NO", { maximumFractionDigits: 1 })}°` : "",
    a.humidity !== null ? `${Math.round(a.humidity)} %` : "",
    a.co2 !== null ? `CO₂ ${Math.round(a.co2)} ppm` : "",
    a.voc !== null ? `VOC ${Math.round(a.voc)}${a.vocUnit ? ` ${a.vocUnit}` : ""}` : "",
  ].filter(Boolean);
  return a.online ? parts.join(" · ") || "Ingen målinger" : "Svarer ikke";
}

/** Rom med for høy CO₂, som tekst til varsler. */
export function airAlerts(air: AirSensor[]): string[] {
  return air.filter((a) => a.online && a.co2 !== null && a.co2 > CO2_HIGH).map((a) => `Dårlig luft i ${a.name} (CO₂ ${Math.round(a.co2!)} ppm) – luft ut`);
}
