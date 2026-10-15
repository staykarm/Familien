import { DateTime } from "luxon";

/**
 * Henting (barnehage/skole) på hverdager. Den faste ukeplanen (`care_plans`) sier hvem som henter hver ukedag,
 * og enkeltdatoer framover (`care_days`) kan overstyre den. Klokkeslett er «tt:mm».
 */

/** Fast ukeplan for én ukedag. */
export interface CarePlanDay {
  memberId: string;
  /** ISO-ukedag, 1 = mandag … 5 = fredag. */
  weekday: number;
  pickBy: string | null;
  pickTime: string | null;
}

/** Endring for én dato. Begge tomme = ingen henting den dagen. */
export interface CareDay {
  memberId: string;
  date: string;
  pickBy: string | null;
  pickTime: string | null;
}

export interface CareData {
  plans: CarePlanDay[];
  days: CareDay[];
}

/** Hvem som henter et barn en gitt dag. `changed` = avviker fra den faste ukeplanen. */
export interface Pickup {
  childId: string;
  date: string;
  by: string | null;
  time: string | null;
  changed: boolean;
}

export const WEEKDAYS = [
  { n: 1, label: "Mandag", short: "Man" },
  { n: 2, label: "Tirsdag", short: "Tir" },
  { n: 3, label: "Onsdag", short: "Ons" },
  { n: 4, label: "Torsdag", short: "Tor" },
  { n: 5, label: "Fredag", short: "Fre" },
] as const;

export const isWeekday = (date: string) => DateTime.fromISO(date).weekday <= 5;

/**
 * Hentingen for et barn en dato («åååå-mm-dd»). Bare hverdager. En endring for datoen går foran ukeplanen.
 * Null når ingen skal hente (ingen plan, eller dagen er satt til «ingen henting»).
 */
export function pickupFor(care: CareData, childId: string, date: string): Pickup | null {
  if (!isWeekday(date)) return null;
  const override = care.days.find((d) => d.memberId === childId && d.date === date);
  if (override) {
    if (!override.pickBy && !override.pickTime) return null;
    return { childId, date, by: override.pickBy, time: override.pickTime, changed: true };
  }
  const weekday = DateTime.fromISO(date).weekday;
  const plan = care.plans.find((p) => p.memberId === childId && p.weekday === weekday);
  if (!plan || (!plan.pickBy && !plan.pickTime)) return null;
  return { childId, date, by: plan.pickBy, time: plan.pickTime, changed: false };
}

/** Alle hentinger en dato (for alle barn med plan). */
export function pickupsOn(care: CareData, date: string): Pickup[] {
  const children = [...new Set([...care.plans.map((p) => p.memberId), ...care.days.map((d) => d.memberId)])];
  return children.map((id) => pickupFor(care, id, date)).filter((p): p is Pickup => p !== null);
}

/** Hverdagene fra og med `from` i `weeks` uker framover. */
export function upcomingWeekdays(from: string, weeks: number): string[] {
  const start = DateTime.fromISO(from);
  const out: string[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = start.plus({ days: i });
    if (d.weekday <= 5) out.push(d.toISODate()!);
  }
  return out;
}

/** «08:00:00» fra databasen → «08:00». */
export function shortTime(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}
