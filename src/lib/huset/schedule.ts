// Planlagte handlinger i Huset («skru av varmekablene kl. 10»): tid og tekst.
// Rene funksjoner uten nettverk, slik at de kan testes. Lagring og utføring ligger i scheduleDb.ts.

import { DateTime } from "luxon";
import { TIME_ZONE } from "@/lib/time";

/** Hvor langt fram man kan planlegge. */
export const MAX_DAYS_AHEAD = 7;

export interface ScheduledItem {
  id: string;
  /** ISO-tidspunkt. */
  runAt: string;
  /** «Slå av Varmekabler i trappa» */
  description: string;
}

/** Klokka nå i Oslo, til «Spør huset»: «fredag 13. november 2026 kl. 07:12». */
export function osloNow(now: Date = new Date()): string {
  return DateTime.fromJSDate(now).setZone(TIME_ZONE).setLocale("nb").toFormat("cccc d. LLLL yyyy 'kl.' HH:mm");
}

/**
 * Oslo-tid «2026-11-13T10:00» (fra «Spør huset») som tidspunkt. Null hvis den er ugyldig, har vært
 * (mer enn ett minutt siden) eller er mer enn en uke fram.
 */
export function parseOsloTime(at: string, now: Date = new Date()): Date | null {
  const t = DateTime.fromISO(at, { zone: TIME_ZONE });
  if (!t.isValid || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(at)) return null;
  const ms = t.toMillis();
  if (ms < now.getTime() - 60_000 || ms > now.getTime() + MAX_DAYS_AHEAD * 86_400_000) return null;
  return t.toJSDate();
}

/** «kl. 10:00», «i morgen kl. 10:00» eller «søn. 15. nov. kl. 10:00». */
export function scheduleWhen(runAt: string | Date, now: Date = new Date()): string {
  const t = (typeof runAt === "string" ? DateTime.fromISO(runAt) : DateTime.fromJSDate(runAt)).setZone(TIME_ZONE).setLocale("nb");
  const today = DateTime.fromJSDate(now).setZone(TIME_ZONE).startOf("day");
  const days = Math.round(t.startOf("day").diff(today, "days").days);
  const clock = t.toFormat("'kl.' HH:mm");
  if (days === 0) return clock;
  if (days === 1) return `i morgen ${clock}`;
  return `${t.toFormat("ccc d. LLL")} ${clock}`;
}
