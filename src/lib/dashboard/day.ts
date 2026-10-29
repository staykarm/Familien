// Dashboardet: dagens og morgendagens avtaler, været fremover, og teksten «Spør» får om familien.
// Rene funksjoner uten nettverk, slik at de kan testes.

import { DateTime } from "luxon";
import { touchesDay } from "@/lib/calendar/dates";
import type { CalendarEvent } from "@/lib/calendar/types";
import { careSummary, careText, type CareData } from "@/lib/care/plan";
import type { ShoppingItem } from "@/lib/shopping/types";
import type { Task } from "@/lib/tasks/types";
import { TIME_ZONE } from "@/lib/time";
import type { DailyWeather, Forecast, HourlyWeather } from "@/lib/weather/yr";

export interface AgendaItem {
  id: string;
  /** «Hele dagen», «07:45», «07:45–08:30», «til 10:00». */
  when: string;
  title: string;
  /** Navnene på deltakerne, kommaseparert. */
  who: string;
  memberIds: string[];
  location: string | null;
  categoryId: string | null;
}

const hhmm = (iso: string) => DateTime.fromISO(iso).setZone(TIME_ZONE).toFormat("HH:mm");
const dayOf = (iso: string) => DateTime.fromISO(iso).setZone(TIME_ZONE).toISODate();

/** Avtalene som berører `day` (Oslo-tid), heldagsavtaler først, så etter starttid. Oppgaver i kalenderen tas ikke med. */
export function dayAgenda(events: CalendarEvent[], day: string, nameOf: (id: string) => string): AgendaItem[] {
  return events
    .filter((e) => e.kind !== "task" && touchesDay(e, day))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start))
    .map((e) => {
      const starts = dayOf(e.start) === day;
      const ends = dayOf(e.end) === day;
      const when = e.allDay ? "Hele dagen" : !starts ? `til ${hhmm(e.end)}` : ends ? `${hhmm(e.start)}–${hhmm(e.end)}` : `fra ${hhmm(e.start)}`;
      return {
        id: e.id,
        when,
        title: e.title,
        who: e.participantIds.map(nameOf).filter(Boolean).join(", "),
        memberIds: e.participantIds,
        location: e.location,
        categoryId: e.categoryId,
      };
    });
}

/** De neste `count` timene fra og med timen vi er i nå (bare timesrader fra Yr). */
export function nextHours(forecast: Forecast | null, now: Date, count = 16): HourlyWeather[] {
  if (!forecast) return [];
  const from = now.getTime() - 60 * 60_000;
  return forecast.hourly.filter((h) => h.hours === 1 && Date.parse(h.time) > from).slice(0, count);
}

/** De neste `count` dagene etter i dag. */
export function nextDays(forecast: Forecast | null, today: string, count = 5): DailyWeather[] {
  if (!forecast) return [];
  return forecast.daily.filter((d) => d.date > today).slice(0, count);
}

/** Oppgaver som ikke er gjort: med frist først (tidligst først), så uten frist. */
export function openTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || (a.dueTime ?? "").localeCompare(b.dueTime ?? "") || a.title.localeCompare(b.title, "nb"));
}

/**
 * Det «Spør» får vite om familien, som kort tekst: i dag og i morgen (avtaler og levering/henting),
 * oppgaver med frist og handlelisten.
 */
export function familyContext(input: {
  today: string;
  tomorrow: string;
  events: CalendarEvent[];
  care: CareData;
  tasks: Task[];
  shopping: ShoppingItem[];
  nameOf: (id: string) => string;
}): string {
  const { today, tomorrow, events, care, tasks, shopping, nameOf } = input;
  const lines: string[] = [];
  for (const [label, day] of [
    ["I DAG", today],
    ["I MORGEN", tomorrow],
  ] as const) {
    lines.push(`${label} (${DateTime.fromISO(day).setLocale("nb").toFormat("cccc d. LLLL")}):`);
    const agenda = dayAgenda(events, day, nameOf);
    if (!agenda.length) lines.push("- ingen avtaler");
    for (const a of agenda) lines.push(`- ${a.when} ${a.title}${a.who ? ` (${a.who})` : ""}${a.location ? `, ${a.location}` : ""}`);
    const careLine = careText(careSummary(care, day), nameOf);
    if (careLine) lines.push(`- levering og henting: ${careLine}`);
  }
  const open = openTasks(tasks).slice(0, 15);
  lines.push("OPPGAVER:");
  if (!open.length) lines.push("- ingen");
  for (const t of open) lines.push(`- ${t.title}${t.dueDate ? ` (frist ${t.dueDate}${t.dueTime ? ` ${t.dueTime}` : ""})` : ""}${t.assigneeId ? `, ${nameOf(t.assigneeId)}` : ""}`);
  const items = shopping.filter((i) => !i.checked);
  lines.push(`HANDLELISTE: ${items.length ? items.map((i) => (i.quantity ? `${i.name} (${i.quantity})` : i.name)).join(", ") : "tom"}`);
  return lines.join("\n");
}
