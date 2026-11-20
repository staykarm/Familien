import "server-only";
import { getStates, haConfigured } from "./ha";
import { toHome } from "./home";
import { toRobots } from "./robots";
import { toGroups, toSpeakers } from "./sonos";
import { summarizeHouse, type HouseSummary } from "./summary";
import { toEnergy } from "./energy";
import { toSafety } from "./safety";
import { toWatering } from "./watering";
import { applySeason } from "./season";
import { loadSeason } from "./seasonDb";

// Det resten av Familien får bruke fra Huset (serveren). Visningen ligger i components/huset/public.tsx.
// Holdes lite, så Huset kan flyttes til en egen app senere (da blir dette et API-kall).

export type { HouseSummary } from "./summary";

/** Så lenge «I dag» venter på Home Assistant før kortet droppes. */
const SUMMARY_TIMEOUT_MS = 2_500;

/** «Huset nå»: hva som er på i hvilke rom. Null hvis Home Assistant ikke er satt opp eller ikke svarer raskt nok. */
export async function loadHouseSummary(): Promise<HouseSummary | null> {
  if (!haConfigured()) return null;
  try {
    const [states, season] = await Promise.all([getStates(SUMMARY_TIMEOUT_MS), loadSeason()]);
    const { robots, watering } = applySeason(toRobots(states), toWatering(states), season);
    return summarizeHouse(toHome(states), toGroups(toSpeakers(states)), robots, watering, toSafety(states), toEnergy(states));
  } catch {
    return null;
  }
}

/** Planlagte handlinger i Huset («skru av varmekablene kl. 10»). Kalles fra /api/cron/push. */
export { runHouseSchedule } from "./scheduleDb";

/** Dashboardet: tilstanden i huset, faste grupper og Spotify, og «Spør» (med familien som ekstra tekst). */
export { askHouse, loadHouse, loadHouseSetup, type HouseData, type HouseSetup } from "@/actions/huset";
