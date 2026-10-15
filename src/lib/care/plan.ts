import { DateTime } from "luxon";

/**
 * Levering og henting (barnehage/skole) på hverdager. Den faste ukeplanen (`care_plans`) sier hvem som leverer
 * og henter hver ukedag. Unntak (`care_overrides`) gjelder en periode og kan endre levering, henting eller begge.
 * Klokkeslett er «tt:mm».
 */

export type CarePart = "drop" | "pick";

export const PART_LABEL: Record<CarePart, { noun: string; verb: string; passive: string; short: string }> = {
  drop: { noun: "Levering", verb: "levere", passive: "Leveres", short: "Lev." },
  pick: { noun: "Henting", verb: "hente", passive: "Hentes", short: "Hent" },
};

/** Hvem og når for én del. */
export interface Slot {
  by: string | null;
  time: string | null;
}

/** Fast ukeplan for én ukedag. */
export interface CarePlanDay {
  memberId: string;
  /** ISO-ukedag, 1 = mandag … 5 = fredag. */
  weekday: number;
  drop: Slot;
  pick: Slot;
}

/** Endring av én del i et unntak. null = som vanlig; ellers personen og tiden (begge tomme = ingen). */
export type SlotChange = Slot | null;

/** Unntak for en periode (fra og med – til og med). */
export interface CareOverride {
  id: string;
  memberId: string;
  from: string;
  to: string;
  note: string | null;
  drop: SlotChange;
  pick: SlotChange;
  createdAt: string;
}

export interface CareData {
  plans: CarePlanDay[];
  overrides: CareOverride[];
}

/** Levering eller henting en gitt dag. `changed` = fra et unntak. */
export interface CareSlot extends Slot {
  childId: string;
  date: string;
  part: CarePart;
  changed: boolean;
}

export interface CareDayPlan {
  drop: CareSlot | null;
  pick: CareSlot | null;
}

export const WEEKDAYS = [
  { n: 1, label: "Mandag", short: "Man" },
  { n: 2, label: "Tirsdag", short: "Tir" },
  { n: 3, label: "Onsdag", short: "Ons" },
  { n: 4, label: "Torsdag", short: "Tor" },
  { n: 5, label: "Fredag", short: "Fre" },
] as const;

export const isWeekday = (date: string) => DateTime.fromISO(date).weekday <= 5;
const filled = (s: Slot | null | undefined): s is Slot => !!s && !!(s.by || s.time);

/** Det sist lagrede unntaket som endrer denne delen denne dagen. */
function overrideFor(care: CareData, childId: string, date: string, part: CarePart): CareOverride | null {
  let best: CareOverride | null = null;
  for (const o of care.overrides) {
    if (o.memberId !== childId || o[part] === null || date < o.from || date > o.to) continue;
    if (!best || o.createdAt > best.createdAt) best = o;
  }
  return best;
}

function slotFor(care: CareData, childId: string, date: string, part: CarePart): CareSlot | null {
  const o = overrideFor(care, childId, date, part);
  if (o) return filled(o[part]) ? { ...o[part]!, childId, date, part, changed: true } : null;
  const weekday = DateTime.fromISO(date).weekday;
  const plan = care.plans.find((p) => p.memberId === childId && p.weekday === weekday);
  return plan && filled(plan[part]) ? { ...plan[part], childId, date, part, changed: false } : null;
}

/** Levering og henting for et barn en dato («åååå-mm-dd»). Bare hverdager; null når ingenting skal skje. */
export function careFor(care: CareData, childId: string, date: string): CareDayPlan | null {
  if (!isWeekday(date)) return null;
  const drop = slotFor(care, childId, date, "drop");
  const pick = slotFor(care, childId, date, "pick");
  return drop || pick ? { drop, pick } : null;
}

/** Barna som har en plan eller unntak. */
export function careChildren(care: CareData): string[] {
  return [...new Set([...care.plans.map((p) => p.memberId), ...care.overrides.map((o) => o.memberId)])];
}

/** Alle leveringer og hentinger en dato. */
export function careSlotsOn(care: CareData, date: string): CareSlot[] {
  return careChildren(care).flatMap((id) => {
    const day = careFor(care, id, date);
    return day ? [day.drop, day.pick].filter((s): s is CareSlot => s !== null) : [];
  });
}

/** Hverdagene fra og med `from` i `count` hverdager framover. */
export function nextWeekdays(from: string, count: number): string[] {
  const out: string[] = [];
  for (let d = DateTime.fromISO(from); out.length < count; d = d.plus({ days: 1 })) if (d.weekday <= 5) out.push(d.toISODate()!);
  return out;
}

/** «08:00:00» fra databasen → «08:00». */
export function shortTime(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}

/** «20.–24. okt», «30. okt–3. nov» eller «tir. 20. okt». */
export function periodText(from: string, to: string): string {
  const a = DateTime.fromISO(from).setLocale("nb");
  const b = DateTime.fromISO(to).setLocale("nb");
  if (from === to) return a.toFormat("ccc d. LLL");
  if (a.month === b.month) return `${a.day}.–${b.toFormat("d. LLL")}`;
  return `${a.toFormat("d. LLL")}–${b.toFormat("d. LLL")}`;
}
