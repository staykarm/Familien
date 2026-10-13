import { DateTime } from "luxon";
import { TIME_ZONE } from "@/lib/time";

/** Én dag, i Oslo-tid. */
export interface DailyWeather {
  date: string;
  symbolCode: string | null;
  tempMax: number | null;
  tempMin: number | null;
  /** Sum nedbør (mm) for dagen. */
  precipitationMm: number | null;
  windMax: number | null;
}

/** Ett tidspunkt i varselet. `hours` er hvor lang periode symbol og nedbør gjelder (1 eller 6 timer). */
export interface HourlyWeather {
  time: string;
  date: string;
  hour: number;
  hours: 1 | 6;
  temp: number | null;
  precipitationMm: number | null;
  windSpeed: number | null;
  symbolCode: string | null;
}

export interface Forecast {
  daily: DailyWeather[];
  hourly: HourlyWeather[];
}

interface Period {
  summary?: { symbol_code?: string };
  details?: { precipitation_amount?: number };
}

export interface YrTimeseriesEntry {
  time: string;
  data: {
    instant?: { details?: { air_temperature?: number; wind_speed?: number } };
    next_1_hours?: Period;
    next_6_hours?: Period;
  };
}

export interface YrCompactResponse {
  properties?: { timeseries?: YrTimeseriesEntry[] };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function local(iso: string): DateTime {
  return DateTime.fromISO(iso, { zone: "utc" }).setZone(TIME_ZONE);
}

/**
 * Yr «compact» gir timesverdier de første ~2,5 døgnene og deretter 6-timersblokker.
 * Vi viser én rad per tidspunkt: timesrader så lenge de finnes, deretter 6-timersrader.
 */
export function normalizeHourly(raw: YrCompactResponse): HourlyWeather[] {
  const entries = raw.properties?.timeseries ?? [];
  const out: HourlyWeather[] = [];
  let coveredUntil = -Infinity;
  for (const e of entries) {
    const t = local(e.time);
    const one = e.data.next_1_hours;
    const six = e.data.next_6_hours;
    // Når timesdata tar slutt, hopp over tidspunkt som allerede dekkes av forrige 6-timersblokk.
    if (!one && t.toMillis() < coveredUntil) continue;
    const period = one ?? six;
    if (!period) continue;
    const hours = one ? 1 : 6;
    out.push({
      time: t.toUTC().toISO()!,
      date: t.toISODate()!,
      hour: t.hour,
      hours,
      temp: e.data.instant?.details?.air_temperature ?? null,
      precipitationMm: period.details?.precipitation_amount ?? null,
      windSpeed: e.data.instant?.details?.wind_speed ?? null,
      symbolCode: period.summary?.symbol_code ?? null,
    });
    coveredUntil = t.plus({ hours }).toMillis();
  }
  return out;
}

/** Dagsoppsummering per kalenderdag i Oslo: maks/min temperatur, sum nedbør, sterkeste vind og symbolet nærmest kl. 12. */
export function normalizeDaily(raw: YrCompactResponse): DailyWeather[] {
  const entries = raw.properties?.timeseries ?? [];
  const hourly = normalizeHourly(raw);
  const byDate = new Map<string, YrTimeseriesEntry[]>();
  for (const e of entries) {
    const key = local(e.time).toISODate()!;
    byDate.set(key, [...(byDate.get(key) ?? []), e]);
  }

  return [...byDate.keys()].sort().map((date) => {
    const dayEntries = byDate.get(date)!;
    const temps = dayEntries.map((e) => e.data.instant?.details?.air_temperature).filter((v): v is number => v !== undefined);
    const winds = dayEntries.map((e) => e.data.instant?.details?.wind_speed).filter((v): v is number => v !== undefined);
    const rows = hourly.filter((h) => h.date === date);
    const precip = rows.map((h) => h.precipitationMm).filter((v): v is number => v !== null);

    const withSymbol = dayEntries.filter((e) => e.data.next_6_hours?.summary?.symbol_code || e.data.next_1_hours?.summary?.symbol_code);
    const representative = [...withSymbol].sort(
      (a, b) => Math.abs(local(a.time).hour - 12) - Math.abs(local(b.time).hour - 12)
    )[0];

    return {
      date,
      symbolCode:
        representative?.data.next_6_hours?.summary?.symbol_code ??
        representative?.data.next_1_hours?.summary?.symbol_code ??
        null,
      tempMax: temps.length ? round1(Math.max(...temps)) : null,
      tempMin: temps.length ? round1(Math.min(...temps)) : null,
      precipitationMm: precip.length ? round1(precip.reduce((a, b) => a + b, 0)) : null,
      windMax: winds.length ? round1(Math.max(...winds)) : null,
    };
  });
}

export function normalizeForecast(raw: YrCompactResponse): Forecast {
  return { daily: normalizeDaily(raw), hourly: normalizeHourly(raw) };
}

/** MET krever maks fire desimaler i koordinatene. */
export function roundCoord(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
