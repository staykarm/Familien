import { DateTime } from "luxon";

/**
 * Levering og henting (barnehage/skole) på hverdager. Det finnes ikke noe fast mønster, så det registreres
 * dag for dag (`care_entries`): hvem som leverer og henter, og når. Klokkeslett er «tt:mm».
 */

export type CarePart = "drop" | "pick";

export const PART_LABEL: Record<CarePart, { noun: string; verb: string; doer: string; short: string }> = {
  drop: { noun: "Levering", verb: "levere", doer: "Lever", short: "Lev." },
  pick: { noun: "Henting", verb: "hente", doer: "Henter", short: "Hent" },
};

/** Hvem og når for én del. */
export interface Slot {
  by: string | null;
  time: string | null;
}

/** Levering og henting for ett barn én dag. */
export interface CareEntry {
  memberId: string;
  date: string;
  drop: Slot;
  pick: Slot;
}

export interface CareData {
  entries: CareEntry[];
}

/** Levering eller henting en gitt dag. */
export interface CareSlot extends Slot {
  childId: string;
  date: string;
  part: CarePart;
}

export interface CareDayPlan {
  drop: CareSlot | null;
  pick: CareSlot | null;
}

export const EMPTY_SLOT: Slot = { by: null, time: null };

export const isWeekday = (date: string) => DateTime.fromISO(date).weekday <= 5;
export const hasSlot = (s: Slot | null | undefined): s is Slot => !!s && !!(s.by || s.time);

/** Levering og henting for et barn en dato («åååå-mm-dd»). Bare hverdager; null når ingenting er registrert. */
export function careFor(care: CareData, childId: string, date: string): CareDayPlan | null {
  if (!isWeekday(date)) return null;
  const entry = care.entries.find((e) => e.memberId === childId && e.date === date);
  if (!entry) return null;
  const slot = (part: CarePart): CareSlot | null => (hasSlot(entry[part]) ? { ...entry[part], childId, date, part } : null);
  const drop = slot("drop");
  const pick = slot("pick");
  return drop || pick ? { drop, pick } : null;
}

/** Alle leveringer og hentinger en dato. */
export function careSlotsOn(care: CareData, date: string): CareSlot[] {
  const children = [...new Set(care.entries.filter((e) => e.date === date).map((e) => e.memberId))];
  return children.flatMap((id) => {
    const day = careFor(care, id, date);
    return day ? [day.drop, day.pick].filter((s): s is CareSlot => s !== null) : [];
  });
}

/**
 * Forslag til klokkeslett når noen velges uten tid: det siste som er brukt for samme del (f.eks. 08:00 for levering).
 */
export function usualTime(entries: CareEntry[], part: CarePart): string | null {
  const used = entries.filter((e) => e[part].time).sort((a, b) => b.date.localeCompare(a.date));
  return used[0]?.[part].time ?? null;
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

/** Rad fra databasen → CareEntry. */
export function toCareEntry(r: {
  member_id: string;
  date: string;
  drop_by: string | null;
  drop_time: string | null;
  pick_by: string | null;
  pick_time: string | null;
}): CareEntry {
  return {
    memberId: r.member_id,
    date: r.date,
    drop: { by: r.drop_by, time: shortTime(r.drop_time) },
    pick: { by: r.pick_by, time: shortTime(r.pick_time) },
  };
}
