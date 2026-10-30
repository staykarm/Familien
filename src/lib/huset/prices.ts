import "server-only";
import { DateTime } from "luxon";
import { hourlyPrices, hourlyUse, toPricePoints, withUse, type PricePoint } from "./energy";
import { callServiceForResponse, getHistory, getStates } from "./ha";

// Timepriser fra Tibber (via Home Assistant) for i går, i dag og i morgen, og forbruket per time. Morgendagens priser kommer ved 13-tiden.
// Bufres i 15 minutter per serverinstans, så siden kan spørre ofte uten at Tibber blir spurt hver gang.

const CACHE_MS = 15 * 60_000;
let cache: { at: number; day: string; hours: PricePoint[] } | null = null;

/** Snittpris per time fra midnatt i går til midnatt i overmorgen (Oslo). Tomt hvis Tibber ikke svarer. */
export async function loadPriceHours(): Promise<PricePoint[]> {
  const today = DateTime.now().setZone("Europe/Oslo").startOf("day");
  const day = today.toISODate()!;
  // Etter 13 bør morgendagens priser være klare: ikke la en buffer uten dem stå i 15 minutter.
  const wantTomorrow = DateTime.now().setZone("Europe/Oslo").hour >= 13;
  const hasTomorrow = !!cache?.hours.some((h) => h.start.startsWith(today.plus({ days: 1 }).toISODate()!));
  if (cache && cache.day === day && Date.now() - cache.at < CACHE_MS && (!wantTomorrow || hasTomorrow || Date.now() - cache.at < 5 * 60_000)) return cache.hours;
  try {
    const response = await callServiceForResponse("tibber", "get_prices", {
      start: today.minus({ days: 1 }).toISO(),
      end: today.plus({ days: 2 }).toISO(),
    });
    const hours = hourlyPrices(toPricePoints(response));
    cache = { at: Date.now(), day, hours };
    return hours;
  } catch {
    return cache?.day === day ? cache.hours : [];
  }
}

const USE_CACHE_MS = 5 * 60_000;
let useCache: { at: number; use: Map<string, number> } | null = null;
let useEntity: string | null | undefined;

/** Forbruket per time det siste døgnet, fra «akkumulert forbruk» (Tibber Pulse). Tomt hvis det ikke finnes. */
async function loadUse(): Promise<Map<string, number>> {
  if (useCache && Date.now() - useCache.at < USE_CACHE_MS) return useCache.use;
  try {
    if (useEntity === undefined) {
      useEntity = (await getStates()).find((s) => /^sensor\.tibber_pulse_.+_akkumulert_forbruk$/.test(s.entity_id))?.entity_id ?? null;
    }
    if (!useEntity) return new Map();
    const start = DateTime.now().setZone("Europe/Oslo").minus({ hours: 26 }).startOf("hour").toUTC().toISO()!;
    const use = hourlyUse(await getHistory(useEntity, start));
    useCache = { at: Date.now(), use };
    return use;
  } catch {
    return useCache?.use ?? new Map();
  }
}

/** Timepriser med forbruket lagt på (søylene i strømgrafen). */
export async function loadPriceAndUse(): Promise<PricePoint[]> {
  const [hours, use] = await Promise.all([loadPriceHours(), loadUse()]);
  return withUse(hours, use);
}
