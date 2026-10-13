import { DateTime } from "luxon";
import type { Task } from "./types";

export type TaskSectionKey = "overdue" | "today" | "tomorrow" | "week" | "later" | "none" | "done";

export const SECTION_TITLES: Record<TaskSectionKey, string> = {
  overdue: "Forfalt",
  today: "I dag",
  tomorrow: "I morgen",
  week: "Resten av uken",
  later: "Senere",
  none: "Uten frist",
  done: "Ferdig",
};

const ORDER: TaskSectionKey[] = ["overdue", "today", "tomorrow", "week", "later", "none", "done"];

/** Hvilken seksjon en oppgave hører til, sett fra `today` (yyyy-MM-dd, Oslo). */
export function sectionFor(task: Pick<Task, "status" | "dueDate">, today: string): TaskSectionKey {
  if (task.status === "done") return "done";
  if (!task.dueDate) return "none";
  if (task.dueDate < today) return "overdue";
  if (task.dueDate === today) return "today";
  const t = DateTime.fromISO(today);
  if (task.dueDate === t.plus({ days: 1 }).toISODate()) return "tomorrow";
  if (task.dueDate <= t.endOf("week").toISODate()!) return "week";
  return "later";
}

function compareTasks(a: Task, b: Task): number {
  // Pågående først, så etter frist (dato + klokkeslett), så alfabetisk.
  if (a.status !== b.status) return a.status === "doing" ? -1 : b.status === "doing" ? 1 : 0;
  const ad = `${a.dueDate ?? "9999"}T${a.dueTime ?? "99"}`;
  const bd = `${b.dueDate ?? "9999"}T${b.dueTime ?? "99"}`;
  return ad.localeCompare(bd) || a.title.localeCompare(b.title, "nb");
}

export function groupTasks(tasks: Task[], today: string): { key: TaskSectionKey; title: string; tasks: Task[] }[] {
  const buckets = new Map<TaskSectionKey, Task[]>();
  for (const t of tasks) {
    const key = sectionFor(t, today);
    buckets.set(key, [...(buckets.get(key) ?? []), t]);
  }
  return ORDER.filter((k) => buckets.has(k)).map((key) => {
    const list = buckets.get(key)!;
    list.sort(
      key === "done" ? (a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "") : compareTasks
    );
    return { key, title: SECTION_TITLES[key], tasks: list };
  });
}

/** Kort, vennlig fristtekst: «i dag kl. 18:00», «i morgen», «fre. 17. okt.», «for 2 dager siden». */
export function dueLabel(task: Pick<Task, "dueDate" | "dueTime">, today: string): string | null {
  if (!task.dueDate) return null;
  const t = DateTime.fromISO(today);
  const d = DateTime.fromISO(task.dueDate).setLocale("nb");
  const days = Math.round(d.diff(t, "days").days);
  let label: string;
  if (days === 0) label = "i dag";
  else if (days === 1) label = "i morgen";
  else if (days === -1) label = "i går";
  else if (days < -1) label = `for ${-days} dager siden`;
  else if (days < 7) label = d.toFormat("cccc");
  else label = d.toFormat(d.year === t.year ? "ccc d. LLL" : "d. LLL yyyy");
  return task.dueTime ? `${label} kl. ${task.dueTime.slice(0, 5)}` : label;
}
