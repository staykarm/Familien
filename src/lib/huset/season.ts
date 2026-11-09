// Sesong for det som står ute: robotgressklipperne og vanningsanlegget kan settes «av for sesongen» om vinteren.
// Da teller de ikke i «Huset nå» (ingen feil om at ventiler som er tatt inn ikke svarer), og fanene viser dem
// sammenslått med «Skru på for sesongen». Valget lagres i `settings` (`house_season`) og gjelder hele familien.
// Rene funksjoner uten nettverk, slik at de kan testes.

import { z } from "zod";
import type { Robot } from "./robots";
import type { Watering } from "./watering";

export const SEASON_KEY = "house_season";

export const houseSeasonSchema = z.object({
  /** Robotgressklipperne er i bruk. */
  mowers: z.boolean(),
  /** Vanningsanlegget er i bruk. */
  watering: z.boolean(),
});

export type HouseSeason = z.infer<typeof houseSeasonSchema>;

/** Uten lagret valg er alt i bruk. */
export const IN_SEASON: HouseSeason = { mowers: true, watering: true };

export function readSeason(raw: unknown): HouseSeason {
  const parsed = houseSeasonSchema.partial().safeParse(raw);
  return { ...IN_SEASON, ...(parsed.success ? parsed.data : {}) };
}

/** Merker klipperne og vanningen som «av for sesongen» etter valget. */
export function applySeason(robots: Robot[], watering: Watering, season: HouseSeason): { robots: Robot[]; watering: Watering } {
  return {
    robots: robots.map((r) => (r.kind === "mower" && !season.mowers ? { ...r, resting: true } : r)),
    watering: season.watering ? watering : { ...watering, resting: true },
  };
}
