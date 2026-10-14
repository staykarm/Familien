import type { HourlyWeather } from "./yr";

/**
 * Været time for time for én dato, slått opp på klokketime (0–23) – til timeaksen i dagvisningen.
 * Etter de første par døgnene gir Yr 6-timersblokker; da vises symbolet bare ved blokkens første time.
 */
export function hourlyForDate(hourly: HourlyWeather[], date: string): Record<number, HourlyWeather> {
  const out: Record<number, HourlyWeather> = {};
  for (const h of hourly) if (h.date === date && !(h.hour in out)) out[h.hour] = h;
  return out;
}
