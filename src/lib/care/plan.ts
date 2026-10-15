import { DateTime } from "luxon";

/** Levering og henting én hverdag for ett barn. Klokkeslett er «tt:mm». */
export interface CarePlanDay {
  memberId: string;
  /** ISO-ukedag, 1 = mandag … 5 = fredag. */
  weekday: number;
  dropBy: string | null;
  dropTime: string | null;
  pickBy: string | null;
  pickTime: string | null;
}

export const WEEKDAYS = [
  { n: 1, label: "Mandag" },
  { n: 2, label: "Tirsdag" },
  { n: 3, label: "Onsdag" },
  { n: 4, label: "Torsdag" },
  { n: 5, label: "Fredag" },
] as const;

/** Har dagen noe å vise? */
export function hasPlan(d: Omit<CarePlanDay, "memberId" | "weekday">): boolean {
  return !!(d.dropBy || d.dropTime || d.pickBy || d.pickTime);
}

/** Planen for et barn en gitt dato («åååå-mm-dd»). Bare hverdager – lørdag og søndag gir null. */
export function planForDate(plans: CarePlanDay[], memberId: string, date: string): CarePlanDay | null {
  const weekday = DateTime.fromISO(date).weekday;
  if (weekday > 5) return null;
  const plan = plans.find((p) => p.memberId === memberId && p.weekday === weekday);
  return plan && hasPlan(plan) ? plan : null;
}

/** «08:00:00» fra databasen → «08:00». */
export function shortTime(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}
