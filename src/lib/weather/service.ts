import "server-only";
import { z } from "zod";
import type { Json } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeForecast, roundCoord, type Forecast, type YrCompactResponse } from "./yr";

const MET_URL = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
const GEONORGE_URL = "https://ws.geonorge.no/adresser/v1/sok";
const LOCATION_KEY = "weather_location";

/** Standardsted. Koordinatene slås opp hos Kartverket første gang og lagres i settings. */
const DEFAULT_QUERY = { sok: "Vardeveien", kommunenavn: "Oslo" };
const OSLO_FALLBACK: WeatherLocation = { label: "Oslo sentrum", lat: 59.9133, lon: 10.7389 };

export interface WeatherLocation {
  label: string;
  lat: number;
  lon: number;
}

export const weatherLocationSchema = z.object({
  label: z.string().trim().min(1).max(200),
  lat: z.number().min(57).max(72),
  lon: z.number().min(4).max(32),
});

/** MET krever en identifiserende User-Agent med kontaktinfo. GitHub-lenken er nok; e-post legges til hvis satt. */
function userAgent(): string {
  const email = process.env.MET_CONTACT_EMAIL;
  return `Familien/1.0 github.com/staykarm/Familien${email ? ` ${email}` : ""}`;
}

// --- Sted --------------------------------------------------------------------------

interface GeonorgeAddress {
  adressetekst?: string;
  postnummer?: string;
  poststed?: string;
  kommunenavn?: string;
  representasjonspunkt?: { lat: number; lon: number };
}

/** Søk i Kartverkets åpne adresse-API. */
export async function searchAddresses(query: string, extra: Record<string, string> = {}): Promise<WeatherLocation[]> {
  const params = new URLSearchParams({ sok: query, treffPerSide: "8", utkoordsys: "4258", fuzzy: "true", ...extra });
  const res = await fetch(`${GEONORGE_URL}?${params}`, { headers: { "User-Agent": userAgent() }, cache: "no-store" });
  if (!res.ok) throw new Error(`Kartverket svarte ${res.status}`);
  const json = (await res.json()) as { adresser?: GeonorgeAddress[] };
  return (json.adresser ?? []).flatMap((a) =>
    a.representasjonspunkt
      ? [
          {
            label: [a.adressetekst, [a.postnummer, a.poststed].filter(Boolean).join(" ")].filter(Boolean).join(", "),
            lat: roundCoord(a.representasjonspunkt.lat),
            lon: roundCoord(a.representasjonspunkt.lon),
          },
        ]
      : []
  );
}

export async function getWeatherLocation(): Promise<WeatherLocation> {
  const db = createAdminClient();
  const { data } = await db.from("settings").select("value").eq("key", LOCATION_KEY).maybeSingle();
  const saved = weatherLocationSchema.safeParse(data?.value);
  if (saved.success) return saved.data;

  // Første gang: slå opp standardstedet og lagre det, så det kan endres i innstillinger senere.
  let location = OSLO_FALLBACK;
  try {
    const [hit] = await searchAddresses(DEFAULT_QUERY.sok, { kommunenavn: DEFAULT_QUERY.kommunenavn });
    if (hit) location = hit;
  } catch {
    // Kartverket nede – bruk Oslo sentrum inntil videre, uten å lagre.
    return OSLO_FALLBACK;
  }
  await saveWeatherLocation(location);
  return location;
}

export async function saveWeatherLocation(location: WeatherLocation): Promise<void> {
  const db = createAdminClient();
  const value = { ...location, lat: roundCoord(location.lat), lon: roundCoord(location.lon) };
  await db.from("settings").upsert({ key: LOCATION_KEY, value: value as unknown as Json });
}

// --- Varsel ------------------------------------------------------------------------

function expiresFrom(res: Response): string {
  const header = res.headers.get("expires");
  const parsed = header ? Date.parse(header) : NaN;
  // Mangler Expires: prøv igjen om 30 minutter.
  return new Date(Number.isNaN(parsed) ? Date.now() + 30 * 60_000 : parsed).toISOString();
}

/**
 * Varsel for et punkt. Leser fra buffer så lenge Expires ikke er passert, ellers spør MET
 * med If-Modified-Since. 304 forlenger bufferen. Feiler MET, brukes gammel buffer hvis den finnes.
 */
export async function getForecast(latIn: number, lonIn: number): Promise<{ forecast: Forecast; updatedAt: string } | null> {
  const lat = roundCoord(latIn);
  const lon = roundCoord(lonIn);
  const db = createAdminClient();
  const { data: cached } = await db
    .from("weather_cache")
    .select("payload, expires_at, last_modified, fetched_at")
    .eq("lat", lat)
    .eq("lon", lon)
    .maybeSingle();

  if (cached && new Date(cached.expires_at) > new Date()) {
    return { forecast: cached.payload as unknown as Forecast, updatedAt: cached.fetched_at };
  }

  try {
    const headers: Record<string, string> = { "User-Agent": userAgent(), Accept: "application/json" };
    if (cached?.last_modified) headers["If-Modified-Since"] = cached.last_modified;
    const res = await fetch(`${MET_URL}?lat=${lat}&lon=${lon}`, { headers, cache: "no-store" });

    if (res.status === 304 && cached) {
      await db.from("weather_cache").update({ expires_at: expiresFrom(res) }).eq("lat", lat).eq("lon", lon);
      return { forecast: cached.payload as unknown as Forecast, updatedAt: cached.fetched_at };
    }
    if (!res.ok) throw new Error(`MET svarte ${res.status}`);

    const forecast = normalizeForecast((await res.json()) as YrCompactResponse);
    const fetchedAt = new Date().toISOString();
    await db.from("weather_cache").upsert({
      lat,
      lon,
      payload: forecast as unknown as Json,
      expires_at: expiresFrom(res),
      last_modified: res.headers.get("last-modified"),
      fetched_at: fetchedAt,
    });
    return { forecast, updatedAt: fetchedAt };
  } catch (err) {
    console.error("Værvarsel feilet", err);
    return cached ? { forecast: cached.payload as unknown as Forecast, updatedAt: cached.fetched_at } : null;
  }
}
