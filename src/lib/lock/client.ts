// I nettleseren: send til kodeskjermen hvis opplåsingen har gått ut (f.eks. appen sto åpen i mer enn 12 timer).
// Etter opplåsing kommer man tilbake til samme side («neste»).

import { LOCK_PATH } from "./token";

/** Sender til kodeskjermen og svarer true hvis enheten ikke er låst opp lenger. Nettfeil = false (prøv igjen). */
export async function redirectIfLocked(): Promise<boolean> {
  try {
    const res = await fetch("/api/las/status", { cache: "no-store" });
    if (!res.ok) return false;
    const { unlocked } = (await res.json()) as { unlocked?: boolean };
    if (unlocked !== false) return false;
    const next = window.location.pathname + window.location.search;
    window.location.replace(`${LOCK_PATH}?neste=${encodeURIComponent(next)}`);
    return true;
  } catch {
    return false;
  }
}
