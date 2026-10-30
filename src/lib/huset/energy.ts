// Strøm (Tibber Pulse) og elbiler (via Tibber): pris nå, effekt, forbruk og kostnad i dag og denne måneden,
// timepriser og de billigste timene. Rene funksjoner uten nettverk, slik at de kan testes.

import { DateTime } from "luxon";

interface StateLike {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export type PriceLevel = "billig" | "normal" | "dyr";

export interface Car {
  id: string;
  name: string;
  /** Batteri i prosent. */
  battery: number | null;
  /** Ønsket ladenivå i prosent. */
  target: number | null;
  rangeKm: number | null;
  plugged: boolean | null;
  charging: boolean | null;
  online: boolean;
}

export interface Energy {
  /** Kr/kWh akkurat nå (med nettleie og avgifter, slik Tibber viser den). */
  price: number | null;
  level: PriceLevel | null;
  /** Dagens laveste, snitt og høyeste pris. */
  min: number | null;
  avg: number | null;
  max: number | null;
  /** Effekt nå (W). */
  powerW: number | null;
  /** Forbruk og kostnad siden midnatt. */
  todayKwh: number | null;
  todayCost: number | null;
  /** Anslått forbruk denne timen (kWh), viktig for effekttrinnet i nettleien. */
  hourKwh: number | null;
  monthKwh: number | null;
  monthCost: number | null;
  cars: Car[];
}

export interface PricePoint {
  /** Starten på perioden (ISO). Tibber gir kvarter; vi samler dem per time. */
  start: string;
  price: number;
  /** Strøm brukt i timen (kWh). Bare for timer som har vært (og som Home Assistant har historikk for). */
  kwh?: number | null;
}

export interface PriceWindow {
  start: string;
  end: string;
  avg: number;
}

export const NO_ENERGY: Energy = {
  price: null,
  level: null,
  min: null,
  avg: null,
  max: null,
  powerW: null,
  todayKwh: null,
  todayCost: null,
  hourKwh: null,
  monthKwh: null,
  monthCost: null,
  cars: [],
};

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Laveste tredjedel av dagens spenn er billig, høyeste er dyr. */
export function levelOf(price: number, min: number, max: number): PriceLevel {
  if (max - min < 0.05) return "normal";
  const share = (price - min) / (max - min);
  return share <= 1 / 3 ? "billig" : share >= 2 / 3 ? "dyr" : "normal";
}

/** Tibber-sensorene i Home Assistant. Ingen Tibber: tomt (alt `null`). */
export function toEnergy(states: StateLike[]): Energy {
  const tibber = states.filter((s) => String(s.attributes.friendly_name ?? "").startsWith("Tibber"));
  const find = (test: (id: string) => boolean) => tibber.find((s) => test(s.entity_id));
  const value = (test: (id: string) => boolean) => {
    const s = find(test);
    return s ? num(s.state) : null;
  };

  const priceState = find((id) => id.endsWith("_strompris"));
  const price = priceState ? num(priceState.state) : null;
  const min = num(priceState?.attributes.min_price);
  const avg = num(priceState?.attributes.avg_price);
  const max = num(priceState?.attributes.max_price);

  return {
    price,
    level: price !== null && min !== null && max !== null ? levelOf(price, min, max) : null,
    min,
    avg,
    max,
    powerW: value((id) => id.endsWith("_effekt") && !/_(gjennomsnittlig|min|maksimal)_effekt$/.test(id)),
    todayKwh: value((id) => id.endsWith("_akkumulert_forbruk")),
    todayCost: value((id) => id.endsWith("_akkumulert_kostnad")),
    hourKwh: value((id) => id.endsWith("_estimert_forbruk_i_innevaerende_time")),
    monthKwh: value((id) => id.endsWith("_manedlig_nettoforbruk")),
    monthCost: value((id) => id.endsWith("_manedlig_kostnad")),
    cars: toCars(states),
  };
}

/** Elbilene Tibber kjenner (sensor.<bil>_ladestatus med rekkevidde ved siden av). */
export function toCars(states: StateLike[]): Car[] {
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  const bool = (id: string) => {
    const s = byId.get(id);
    return !s || s.state === "unknown" || s.state === "unavailable" ? null : s.state === "on";
  };
  return states
    .filter((s) => /^sensor\..+_ladestatus$/.test(s.entity_id) && s.attributes.device_class === "battery" && byId.has(s.entity_id.replace(/_ladestatus$/, "_rekkevidde")))
    .map((s) => {
      const base = s.entity_id.replace(/^sensor\./, "").replace(/_ladestatus$/, "");
      const meters = num(byId.get(`sensor.${base}_rekkevidde`)?.state);
      return {
        id: s.entity_id,
        name: String(s.attributes.friendly_name ?? base).replace(/ Ladestatus$/, ""),
        battery: num(s.state),
        target: num(byId.get(`sensor.${base}_onsket_ladningsniva`)?.state),
        rangeKm: meters === null ? null : Math.round(meters / 1000),
        plugged: bool(`binary_sensor.${base}_stopsel`),
        charging: bool(`binary_sensor.${base}_lader`),
        online: bool(`binary_sensor.${base}_tilkobling`) !== false,
      };
    })
    .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, "nb"));
}

/** Svaret fra `tibber.get_prices`: `{ prices: { <hjem>: [{ start_time, price }] } }`. Tar det første hjemmet. */
export function toPricePoints(response: unknown): PricePoint[] {
  const prices = (response as { prices?: Record<string, unknown> } | null)?.prices;
  const list = prices ? Object.values(prices)[0] : null;
  if (!Array.isArray(list)) return [];
  return list
    .map((p) => ({ start: String((p as { start_time?: unknown }).start_time ?? ""), price: num((p as { price?: unknown }).price) }))
    .filter((p): p is PricePoint => !!p.start && p.price !== null && !Number.isNaN(Date.parse(p.start)))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/** Snittpris per time (Oslo-tid), fra kvartersprisene. */
export function hourlyPrices(points: PricePoint[], zone = "Europe/Oslo"): PricePoint[] {
  const hours = new Map<string, number[]>();
  for (const p of points) {
    const hour = DateTime.fromISO(p.start).setZone(zone).startOf("hour").toISO()!;
    hours.set(hour, [...(hours.get(hour) ?? []), p.price]);
  }
  return [...hours].map(([start, prices]) => ({ start, price: prices.reduce((a, b) => a + b, 0) / prices.length }));
}

/**
 * Forbruk per time fra historikken til «akkumulert forbruk» (kWh siden midnatt, nullstilles hver natt).
 * Økningen mellom to målinger legges på timen den siste ble gjort i. Faller verdien til under halvparten (ny dag),
 * regnes den nye verdien; mindre fall er støy og hoppes over.
 */
export function hourlyUse(points: { state: string; last_changed: string }[], zone = "Europe/Oslo"): Map<string, number> {
  const use = new Map<string, number>();
  let prev: number | null = null;
  for (const p of points) {
    const v = Number(p.state);
    if (!Number.isFinite(v)) continue;
    if (prev !== null) {
      // Nullstilling ved midnatt gir et stort fall. Små fall er støy: hopp over målingen og behold forrige verdi.
      if (v < prev && v >= prev * 0.5) continue;
      const delta = v >= prev ? v - prev : v;
      const hour = DateTime.fromISO(p.last_changed).setZone(zone).startOf("hour").toISO()!;
      use.set(hour, (use.get(hour) ?? 0) + delta);
    }
    prev = v;
  }
  return use;
}

/** Legger forbruket på timeprisene (timer uten historikk får `null`). */
export function withUse(hours: PricePoint[], use: Map<string, number>, zone = "Europe/Oslo"): PricePoint[] {
  const byHour = new Map([...use].map(([k, v]) => [DateTime.fromISO(k).setZone(zone).toMillis(), v]));
  return hours.map((h) => {
    const kwh = byHour.get(DateTime.fromISO(h.start).toMillis());
    return { ...h, kwh: kwh === undefined ? null : Math.round(kwh * 100) / 100 };
  });
}

/** De `length` sammenhengende timene med lavest snittpris fra og med timen vi er i. */
export function cheapestWindow(hours: PricePoint[], now: Date, length = 3): PriceWindow | null {
  const from = now.getTime() - 60 * 60_000;
  const ahead = hours.filter((h) => Date.parse(h.start) > from);
  let best: PriceWindow | null = null;
  for (let i = 0; i + length <= ahead.length; i++) {
    const slice = ahead.slice(i, i + length);
    const avg = slice.reduce((sum, h) => sum + h.price, 0) / length;
    if (!best || avg < best.avg - 1e-9) {
      best = { start: slice[0].start, end: new Date(Date.parse(slice[length - 1].start) + 60 * 60_000).toISOString(), avg };
    }
  }
  return best;
}

/** «2,10 kr» */
export const kr = (n: number | null, digits = 2) => (n === null ? "–" : `${n.toLocaleString("nb-NO", { minimumFractionDigits: digits, maximumFractionDigits: digits })} kr`);

/** «5,6 kW» / «850 W» */
export const watt = (w: number | null) => (w === null ? "–" : w >= 1000 ? `${(w / 1000).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} kW` : `${Math.round(w)} W`);

/** «02–05» */
export function windowLabel(w: PriceWindow, zone = "Europe/Oslo"): string {
  const h = (iso: string) => DateTime.fromISO(iso).setZone(zone).toFormat("HH");
  return `${h(w.start)}–${h(w.end)}`;
}
