import { DateTime } from "luxon";
import type { EventFormInput } from "@/lib/validation/event";
import type { TaskFormInput } from "@/lib/validation/task";
import type { EventSuggestion, TaskSuggestion } from "./schema";

interface Named {
  id: string;
  name: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function byName<T extends Named>(list: T[], name: string | null | undefined): T | undefined {
  if (!name) return undefined;
  const n = name.trim().toLocaleLowerCase("nb");
  return list.find((x) => x.name.toLocaleLowerCase("nb") === n);
}

/** Minutter mellom to klokkeslett samme dag; null hvis ugyldig eller slutt ikke etter start. */
function durationMinutes(start: string, end: string | null): number | null {
  if (!end || !TIME.test(end)) return null;
  const s = DateTime.fromFormat(start, "HH:mm");
  const e = DateTime.fromFormat(end, "HH:mm");
  const m = Math.round(e.diff(s, "minutes").minutes);
  return m > 0 ? m : null;
}

/**
 * Gjør et aktivitetsforslag om til skjemaformatet aktivitetsdialogen og eventFormSchema bruker.
 * Ukjente navn hoppes over; uten deltakere brukes Felles.
 */
export function eventSuggestionToForm(
  s: EventSuggestion,
  members: Named[],
  categories: Named[],
  fellesId: string | null
): EventFormInput {
  const participantIds = s.participants.map((p) => byName(members, p)?.id).filter((id): id is string => !!id);
  const hasTime = !s.allDay && !!s.startTime && TIME.test(s.startTime);
  return {
    id: null,
    title: s.title.trim() || "Aktivitet",
    participantIds: participantIds.length ? [...new Set(participantIds)] : fellesId ? [fellesId] : [],
    categoryId: byName(categories, s.category)?.id ?? null,
    allDay: !hasTime,
    date: DATE.test(s.date) ? s.date : "",
    startTime: hasTime ? s.startTime! : "09:00",
    durationMinutes: hasTime ? (durationMinutes(s.startTime!, s.endTime) ?? 60) : 60,
    endDate: s.endDate && DATE.test(s.endDate) && s.endDate >= s.date ? s.endDate : s.date,
    location: s.location ?? "",
    notes: s.notes ?? "",
  };
}

export function taskSuggestionToForm(s: TaskSuggestion, members: Named[]): TaskFormInput {
  const dueDate = s.dueDate && DATE.test(s.dueDate) ? s.dueDate : null;
  return {
    id: null,
    title: s.title.trim() || "Oppgave",
    notes: s.notes ?? "",
    assigneeId: byName(members, s.assignee)?.id ?? null,
    categoryId: null,
    dueDate,
    dueTime: dueDate && s.dueTime && TIME.test(s.dueTime) ? s.dueTime : null,
    status: "todo",
  };
}
