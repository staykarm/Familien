import "server-only";
import { getStates, haConfigured } from "./ha";
import { toHome } from "./home";
import { toRobots } from "./robots";
import { toGroups, toSpeakers } from "./sonos";
import { summarizeHouse, type HouseSummary } from "./summary";

// Det resten av Familien får bruke fra Huset (serveren). Visningen ligger i components/huset/public.tsx.
// Holdes lite, så Huset kan flyttes til en egen app senere (da blir dette et API-kall).

export type { HouseSummary } from "./summary";

/** Så lenge «I dag» venter på Home Assistant før kortet droppes. */
const SUMMARY_TIMEOUT_MS = 2_500;

/** «Huset nå»: hva som er på i hvilke rom. Null hvis Home Assistant ikke er satt opp eller ikke svarer raskt nok. */
export async function loadHouseSummary(): Promise<HouseSummary | null> {
  if (!haConfigured()) return null;
  try {
    const states = await getStates(SUMMARY_TIMEOUT_MS);
    return summarizeHouse(toHome(states), toGroups(toSpeakers(states)), toRobots(states));
  } catch {
    return null;
  }
}
