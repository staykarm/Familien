import { DateTime } from "luxon";
import { TIME_ZONE } from "@/lib/time";

export type CalendarViewKind = "day" | "week" | "month";

/** Dato i Oslo som «yyyy-MM-dd». */
export function osloToday(now: Date = new Date()): string {
  return DateTime.fromJSDate(now).setZone(TIME_ZONE).toISODate()!;
}

export function osloDate(date: string): DateTime {
  return DateTime.fromISO(date, { zone: TIME_ZONE }).startOf("day");
}

/**
 * Første dag i ukevisningen. Uken starter mandag, men i inneværende uke starter den i dag
 * og fylles på med de kommende dagene (i dag står lengst til venstre). `today` = null gir alltid mandag.
 */
export function weekStart(date: string, today: string | null = null): DateTime {
  const monday = osloDate(date).startOf("week");
  if (today) {
    const t = osloDate(today);
    if (t >= monday && t < monday.plus({ weeks: 1 })) return t;
  }
  return monday;
}

/** Synlig periode for en visning. `end` er eksklusiv. Se `weekStart` for uken. */
export function visibleRange(view: CalendarViewKind, date: string, today: string | null = null): { start: DateTime; end: DateTime; days: string[] } {
  const d = osloDate(date);
  let start: DateTime;
  let end: DateTime;
  if (view === "day") {
    start = d;
    end = d.plus({ days: 1 });
  } else if (view === "week") {
    start = weekStart(date, today);
    end = start.plus({ weeks: 1 });
  } else {
    // Samme 6-ukers rutenett som FullCalendar sin månedsvisning.
    start = d.startOf("month").startOf("week");
    end = start.plus({ weeks: 6 });
  }
  const days: string[] = [];
  for (let cur = start; cur < end; cur = cur.plus({ days: 1 })) days.push(cur.toISODate()!);
  return { start, end, days };
}

export function shiftDate(view: CalendarViewKind, date: string, direction: 1 | -1): string {
  const unit = view === "day" ? { days: direction } : view === "week" ? { weeks: direction } : { months: direction };
  return osloDate(date).plus(unit).toISODate()!;
}

function weekTitle(start: DateTime): string {
  const end = start.plus({ days: 6 });
  const sameMonth = start.month === end.month;
  const weeks = start.weekNumber === end.weekNumber ? `${start.weekNumber}` : `${start.weekNumber}–${end.weekNumber}`;
  return `Uke ${weeks} · ${start.setLocale("nb").toFormat(sameMonth ? "d." : "d. LLL")}–${end.setLocale("nb").toFormat("d. LLL")}`;
}

export function viewTitle(view: CalendarViewKind, date: string, today: string | null = null): string {
  const d = osloDate(date);
  if (view === "day") return d.setLocale("nb").toFormat("cccc d. LLLL");
  if (view === "week") return weekTitle(weekStart(date, today));
  return d.setLocale("nb").toFormat("LLLL yyyy");
}

// --- Skjema <-> lagring --------------------------------------------------------------

/** «2026-10-13T17:30» tolket som Oslo-tid → ISO i UTC. Null hvis ugyldig. */
export function osloLocalToUtc(local: string): string | null {
  const dt = DateTime.fromISO(local, { zone: TIME_ZONE });
  return dt.isValid ? dt.toUTC().toISO() : null;
}

/** ISO-tidspunkt → { date: "yyyy-MM-dd", time: "HH:mm" } i Oslo-tid. */
export function utcToOsloParts(iso: string): { date: string; time: string } {
  const dt = DateTime.fromISO(iso).setZone(TIME_ZONE);
  return { date: dt.toISODate()!, time: dt.toFormat("HH:mm") };
}

/** Heldagsaktiviteter lagres fra midnatt første dag til midnatt dagen etter siste dag (eksklusiv slutt). */
export function allDayRangeToUtc(firstDay: string, lastDay: string): { start: string; end: string } | null {
  const start = osloDate(firstDay);
  const last = osloDate(lastDay);
  if (!start.isValid || !last.isValid || last < start) return null;
  return { start: start.toUTC().toISO()!, end: last.plus({ days: 1 }).toUTC().toISO()! };
}

/** Siste dag (inklusiv) for en heldagsaktivitet med eksklusiv slutt. */
export function allDayLastDay(endIso: string): string {
  return DateTime.fromISO(endIso).setZone(TIME_ZONE).minus({ days: 1 }).toISODate()!;
}

export function minutesBetween(startIso: string, endIso: string): number {
  return Math.round(DateTime.fromISO(endIso).diff(DateTime.fromISO(startIso), "minutes").minutes);
}

/** Minutter siden midnatt (Oslo) for et tidspunkt, avgrenset til dagen `day`. */
export function minutesIntoDay(iso: string, day: string): number {
  const dayStart = osloDate(day);
  const t = DateTime.fromISO(iso).setZone(TIME_ZONE);
  const mins = t.diff(dayStart, "minutes").minutes;
  return Math.max(0, Math.min(24 * 60, mins));
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} t` : `${h} t ${m} min`;
}

/** Om en aktivitet berører en dag (Oslo). Slutt er eksklusiv; null-varighet teller på startdagen. */
export function touchesDay(e: { start: string; end: string }, day: string): boolean {
  const start = osloDate(day);
  const end = start.plus({ days: 1 });
  const s = DateTime.fromISO(e.start);
  const en = DateTime.fromISO(e.end);
  return s < end && (en > start || (en.equals(s) && s >= start));
}
