import { DateTime } from "luxon";
import { allDayRangeToUtc, osloDate, osloLocalToUtc } from "@/lib/calendar/dates";

/**
 * Gjentakende aktiviteter. Appen lager én aktivitet per gang (samlet i en serie), slik at hver
 * forekomst kan endres for seg og synkes til Outlook som en vanlig hendelse.
 * Klokkeslettet regnes i Oslo-tid for hver dato, så treningen står på 17:30 også etter overgangen til vintertid.
 */

export type RecurrenceFreq = "daily" | "weekly" | "monthly";

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  /** 1 = hver, 2 = annenhver. */
  interval: number;
  /** ISO-ukedager (1 = mandag … 7 = søndag). Brukes bare for ukentlig. */
  weekdays: number[];
  /** Siste dato (inklusiv), «yyyy-MM-dd». */
  until: string;
}

/** Hindrer at en feil gir tusenvis av aktiviteter. */
export const MAX_OCCURRENCES = 200;
export const MAX_SPAN_DAYS = 2 * 366;

export const WEEKDAYS = [
  { n: 1, short: "Man", letter: "M" },
  { n: 2, short: "Tir", letter: "T" },
  { n: 3, short: "Ons", letter: "O" },
  { n: 4, short: "Tor", letter: "T" },
  { n: 5, short: "Fre", letter: "F" },
  { n: 6, short: "Lør", letter: "L" },
  { n: 7, short: "Søn", letter: "S" },
] as const;

/** Datoene (Oslo, «yyyy-MM-dd») en serie som starter `first` skal ha. Tom liste hvis regelen ikke gir noen. */
export function occurrenceDates(first: string, rule: RecurrenceRule): string[] {
  const start = osloDate(first);
  const until = osloDate(rule.until);
  if (!start.isValid || !until.isValid || until < start) return [];
  const interval = Math.max(1, Math.round(rule.interval));
  const out: string[] = [];
  const push = (d: DateTime) => {
    if (d >= start && d <= until && out.length < MAX_OCCURRENCES) out.push(d.toISODate()!);
  };

  if (rule.freq === "daily") {
    for (let d = start; d <= until && out.length < MAX_OCCURRENCES; d = d.plus({ days: interval })) push(d);
  } else if (rule.freq === "weekly") {
    const days = [...new Set(rule.weekdays.length ? rule.weekdays : [start.weekday])].filter((n) => n >= 1 && n <= 7).sort();
    for (let week = start.startOf("week"); week <= until && out.length < MAX_OCCURRENCES; week = week.plus({ weeks: interval })) {
      for (const n of days) push(week.plus({ days: n - 1 }));
    }
  } else {
    // Samme dag i måneden. Måneder uten den dagen (f.eks. 31.) hoppes over.
    for (let i = 0; out.length < MAX_OCCURRENCES; i += interval) {
      const month = start.startOf("month").plus({ months: i });
      if (month > until) break;
      if (start.day <= month.daysInMonth!) push(month.set({ day: start.day }));
    }
  }
  return out;
}

/** Tidspunktet for én forekomst, i samme form som skjemaet. */
export interface LocalTiming {
  allDay: boolean;
  startTime: string;
  durationMinutes: number;
  /** Antall dager en heldagsaktivitet varer (1 = bare én dag). */
  allDayDays: number;
}

/** Start og slutt (ISO i UTC) for en forekomst på datoen `date`. */
export function occurrenceRange(date: string, t: LocalTiming): { start: string; end: string } | null {
  if (t.allDay) {
    return allDayRangeToUtc(date, osloDate(date).plus({ days: Math.max(1, t.allDayDays) - 1 }).toISODate()!);
  }
  const start = osloLocalToUtc(`${date}T${t.startTime}`);
  if (!start) return null;
  return { start, end: DateTime.fromISO(start).plus({ minutes: t.durationMinutes }).toUTC().toISO()! };
}

export function sameRule(a: RecurrenceRule | null | undefined, b: RecurrenceRule | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  const days = (r: RecurrenceRule) => (r.freq === "weekly" ? [...new Set(r.weekdays)].sort().join(",") : "");
  return a.freq === b.freq && a.interval === b.interval && a.until === b.until && days(a) === days(b);
}

const fmtDate = (d: string) => osloDate(d).setLocale("nb").toFormat("d. LLLL yyyy");

/** «Hver mandag til og med 23. desember 2026». */
export function describeRule(rule: RecurrenceRule, first: string): string {
  const until = `til og med ${fmtDate(rule.until)}`;
  const every = rule.interval === 2 ? "Annenhver" : "Hver";
  if (rule.freq === "daily") return `${rule.interval === 2 ? "Annenhver dag" : "Hver dag"} ${until}`;
  if (rule.freq === "monthly") return `${rule.interval === 2 ? "Annenhver måned" : "Hver måned"} den ${osloDate(first).day}. ${until}`;
  const days = [...new Set(rule.weekdays.length ? rule.weekdays : [osloDate(first).weekday])].sort();
  const names = days.map((n) => osloDate("2026-10-12").plus({ days: n - 1 }).setLocale("nb").toFormat("cccc"));
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} og ${names.at(-1)}` : names[0];
  return `${every} ${list} ${until}`;
}

/** Neste 23. desember (siste dag før julaften) fra og med `from`. */
export function untilChristmas(from: string): string {
  const d = osloDate(from);
  const xmas = d.set({ month: 12, day: 23 });
  return (xmas < d ? xmas.plus({ years: 1 }) : xmas).toISODate()!;
}

/** Neste 20. juni (rundt skoleslutt) fra og med `from`. */
export function untilSummer(from: string): string {
  const d = osloDate(from);
  const summer = d.set({ month: 6, day: 20 });
  return (summer < d ? summer.plus({ years: 1 }) : summer).toISODate()!;
}
