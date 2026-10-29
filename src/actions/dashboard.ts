"use server";

import { familyContext } from "@/lib/dashboard/day";
import { loadFamilyDay } from "@/lib/dashboard/load";
import { askHouse } from "@/lib/huset/public";
import { requireFamily } from "@/lib/session";

/**
 * «Spør» på dashboardet: som «Spør huset», men Claude får også vite hva familien skal i dag og i morgen,
 * levering og henting, oppgaver og handlelisten, så den kan svare på spørsmål om det.
 */
export async function askDashboard(text: string, history: Parameters<typeof askHouse>[1] = []): ReturnType<typeof askHouse> {
  const session = await requireFamily();
  let family: string | undefined;
  try {
    family = familyContext(await loadFamilyDay(session)).slice(0, 8000);
  } catch (e) {
    // Uten familien kan huset fortsatt styres.
    console.error("Dashboardet fikk ikke hentet familien", e);
  }
  return askHouse(text, history, family);
}
