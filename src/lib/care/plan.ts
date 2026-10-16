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

/** Hvem og når for én del. `other` er fritekst for noen utenfor appen («Farmor»); da er `by` tom. */
export interface Slot {
  by: string | null;
  other: string | null;
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

export const EMPTY_SLOT: Slot = { by: null, other: null, time: null };

export const isWeekday = (date: string) => DateTime.fromISO(date).weekday <= 5;
export const hasSlot = (s: Slot | null | undefined): s is Slot => !!s && !!(s.by || s.other || s.time);
/** Er noen satt opp (et medlem eller fritekst)? */
export const hasPerson = (s: Slot | null | undefined): boolean => !!s && !!(s.by || s.other);

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
  drop_other?: string | null;
  pick_other?: string | null;
}): CareEntry {
  return {
    memberId: r.member_id,
    date: r.date,
    drop: { by: r.drop_by, other: r.drop_by ? null : (r.drop_other ?? null), time: shortTime(r.drop_time) },
    pick: { by: r.pick_by, other: r.pick_by ? null : (r.pick_other ?? null), time: shortTime(r.pick_time) },
  };
}

/** De faste valgene for noen utenfor appen. */
export const OTHER_SUGGESTIONS = ["Farmor", "Farfar", "Bestemor"];

/** Én person og hva hen gjør en dag («Ingvild leverer og henter»). Enten et medlem (`by`) eller fritekst (`other`). */
export interface CareDuty {
  by: string | null;
  other: string | null;
  parts: CarePart[];
}

/** Levering og henting for ett barn en dag, samlet per person. Levering først. */
export interface CareSummary {
  childId: string;
  duties: CareDuty[];
}

/** Hvem som leverer og henter en dato, per barn. Tom liste når ingenting er registrert. */
export function careSummary(care: CareData, date: string): CareSummary[] {
  return careSlotsOn(care, date)
    .filter((s) => hasPerson(s))
    .reduce<CareSummary[]>((list, s) => {
      let child = list.find((c) => c.childId === s.childId);
      if (!child) list.push((child = { childId: s.childId, duties: [] }));
      const duty = child.duties.find((d) => (s.by ? d.by === s.by : d.other?.toLowerCase() === s.other?.toLowerCase()));
      if (duty) duty.parts.push(s.part);
      else child.duties.push({ by: s.by, other: s.by ? null : s.other, parts: [s.part] });
      return list;
    }, []);
}

/** «leverer og henter» / «leverer» / «henter». */
export function dutyVerb(parts: CarePart[]): string {
  return parts.length > 1 ? "leverer og henter" : parts[0] === "drop" ? "leverer" : "henter";
}

/** Ren tekst, f.eks. «Ingvild leverer, Marius henter». Barnets navn tas med når flere barn har noe den dagen. */
export function careText(summary: CareSummary[], nameOf: (id: string) => string): string {
  return summary
    .map((c) => {
      const text = c.duties.map((d) => `${d.by ? nameOf(d.by) : d.other} ${dutyVerb(d.parts)}`).join(", ");
      return summary.length > 1 ? `${nameOf(c.childId)}: ${text}` : text;
    })
    .join(" · ");
}
