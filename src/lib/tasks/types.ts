export type TaskStatus = "todo" | "doing" | "done";

/** Oppgave slik nettleseren får den. Frist er dato/klokkeslett i Oslo-tid. */
export interface Task {
  id: string;
  title: string;
  notes: string | null;
  assigneeId: string | null;
  categoryId: string | null;
  dueDate: string | null;
  dueTime: string | null;
  status: TaskStatus;
  completedAt: string | null;
}
