import "server-only";
import type { Json } from "@/lib/database.types";
import { getDb } from "@/lib/supabase/db";
import { readSeason, SEASON_KEY, type HouseSeason } from "./season";

// Lagret sesongvalg for klippere og vanning (`settings.house_season`). Uten tabell eller valg er alt i sesong.

export async function loadSeason(): Promise<HouseSeason> {
  try {
    const db = await getDb();
    const { data } = await db.from("settings").select("value").eq("key", SEASON_KEY).maybeSingle();
    return readSeason(data?.value);
  } catch {
    return readSeason(null);
  }
}

export async function storeSeason(season: HouseSeason): Promise<boolean> {
  const db = await getDb();
  const { error } = await db.from("settings").upsert({ key: SEASON_KEY, value: season as unknown as Json });
  return !error;
}
