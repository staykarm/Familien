import { DateTime } from "luxon";
import type { CalendarEvent } from "@/lib/calendar/types";
import { TIME_ZONE } from "@/lib/time";
import type { Task } from "./types";

export const TASK_PREFIX = "task:";

export function isTaskItemId(id: string): boolean {
  return id.startsWith(TASK_PREFIX);
}

/**
 * Gjør en oppgave med frist om til et kalenderelement på fristdagen.
 * Uten ansvarlig vises den hos Felles. Med klokkeslett blir den en kort (30 min) boks.
 */
export function taskToCalendarItem(task: Task, fallbackMemberId: string | null): CalendarEvent | null {
  if (!task.dueDate) return null;
  const day = DateTime.fromISO(task.dueDate, { zone: TIME_ZONE }).startOf("day");
  const start = task.dueTime ? DateTime.fromISO(`${task.dueDate}T${task.dueTime}`, { zone: TIME_ZONE }) : day;
  const end = task.dueTime ? start.plus({ minutes: 30 }) : day.plus({ days: 1 });
  const done = task.status === "done";
  const owner = task.assigneeId ?? fallbackMemberId;
  return {
    id: `${TASK_PREFIX}${task.id}`,
    title: `${done ? "✅" : "⬜"} ${task.title}`,
    start: start.toUTC().toISO()!,
    end: end.toUTC().toISO()!,
    allDay: !task.dueTime,
    location: null,
    notes: task.notes,
    categoryId: null,
    participantIds: owner ? [owner] : [],
    syncStatus: "local",
    origin: "app",
    kind: "task",
    done,
  };
}
