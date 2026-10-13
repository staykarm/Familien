"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireFamily } from "@/lib/session";
import type { Forecast } from "@/lib/weather/yr";
import {
  getForecast,
  getWeatherLocation,
  saveWeatherLocation,
  searchAddresses,
  weatherLocationSchema,
  type WeatherLocation,
} from "@/lib/weather/service";

export interface WeatherData {
  location: WeatherLocation;
  forecast: Forecast | null;
  updatedAt: string | null;
}

export async function getWeather(): Promise<WeatherData> {
  await requireFamily();
  const location = await getWeatherLocation();
  const result = await getForecast(location.lat, location.lon);
  return { location, forecast: result?.forecast ?? null, updatedAt: result?.updatedAt ?? null };
}

export async function searchPlaces(query: string): Promise<{ ok: boolean; results: WeatherLocation[]; message?: string }> {
  await requireFamily();
  const q = z.string().trim().min(2, "Skriv minst to tegn").max(100).safeParse(query);
  if (!q.success) return { ok: false, results: [], message: q.error.issues[0].message };
  try {
    const results = await searchAddresses(q.data);
    return { ok: true, results, message: results.length ? undefined : "Fant ingen adresser" };
  } catch {
    return { ok: false, results: [], message: "Adressesøket virker ikke akkurat nå" };
  }
}

export async function setWeatherLocation(location: WeatherLocation): Promise<{ ok: boolean; message: string }> {
  await requireFamily();
  const parsed = weatherLocationSchema.safeParse(location);
  if (!parsed.success) return { ok: false, message: "Ugyldig sted" };
  await saveWeatherLocation(parsed.data);
  revalidatePath("/", "layout");
  return { ok: true, message: `Værvarsel for ${parsed.data.label}` };
}
