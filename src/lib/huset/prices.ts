import "server-only";
import { DateTime } from "luxon";
import { hourlyPrices, toPricePoints, type PricePoint } from "./energy";
import { callServiceForResponse } from "./ha";

// Timepriser fra Tibber (via Home Assistant) for i dag og i morgen. Morgendagens priser kommer ved 13-tiden.
// Bufres i 15 minutter per serverinstans, så siden kan spørre ofte uten at Tibber blir spurt hver gang.

const CACHE_MS = 15 * 60_000;
let cache: { at: number; day: string; hours: PricePoint[] } | null = null;

/** Snittpris per time fra midnatt i dag til midnatt i overmorgen (Oslo). Tomt hvis Tibber ikke svarer. */
export async function loadPriceHours(): Promise<PricePoint[]> {
  const today = DateTime.now().setZone("Europe/Oslo").startOf("day");
  const day = today.toISODate()!;
  // Etter 13 bør morgendagens priser være klare: ikke la en buffer uten dem stå i 15 minutter.
  const wantTomorrow = DateTime.now().setZone("Europe/Oslo").hour >= 13;
  const hasTomorrow = !!cache?.hours.some((h) => h.start.startsWith(today.plus({ days: 1 }).toISODate()!));
  if (cache && cache.day === day && Date.now() - cache.at < CACHE_MS && (!wantTomorrow || hasTomorrow || Date.now() - cache.at < 5 * 60_000)) return cache.hours;
  try {
    const response = await callServiceForResponse("tibber", "get_prices", {
      start: today.toISO(),
      end: today.plus({ days: 2 }).toISO(),
    });
    const hours = hourlyPrices(toPricePoints(response));
    cache = { at: Date.now(), day, hours };
    return hours;
  } catch {
    return cache?.day === day ? cache.hours : [];
  }
}
