"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireFamily } from "@/lib/session";
import { getDb } from "@/lib/supabase/db";
import type { Tables } from "@/lib/database.types";
import type { Task, TaskStatus } from "@/lib/tasks/types";
import { dateRangeSchema, taskFormSchema, taskStatusSchema, type TaskFormInput } from "@/lib/validation/task";

export interface TaskResult {
  ok: boolean;
  message?: string;
  task?: Task;
}

const COLUMNS = "id, title, notes, assignee_id, category_id, due_date, due_time, status, completed_at";

type TaskRow = Pick<
  Tables<"tasks">,
  "id" | "title" | "notes" | "assignee_id" | "category_id" | "due_date" | "due_time" | "status" | "completed_at"
>;

function toTask(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    assigneeId: r.assignee_id,
    categoryId: r.category_id,
    dueDate: r.due_date,
    // Postgres gir «18:00:00» – vi bruker «18:00».
    dueTime: r.due_time ? r.due_time.slice(0, 5) : null,
    status: r.status,
    completedAt: r.completed_at,
  };
}

function revalidate() {
  revalidatePath("/oppgaver");
  revalidatePath("/");
}

/** Alle åpne oppgaver + de som ble ferdige de siste 14 dagene. */
export async function listTasks(): Promise<Task[]> {
  await requireFamily();
  const db = await getDb();
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await db
    .from("tasks")
    .select(COLUMNS)
    .or(`status.neq.done,completed_at.gte.${since}`)
    .order("due_date", { ascending: true, nullsFirst: false });
  return (data ?? []).map(toTask);
}

/** Oppgaver med frist i perioden [from, to] (datoer i Oslo), til kalenderen. */
export async function listTasksDue(range: { from: string; to: string }): Promise<Task[]> {
  await requireFamily();
  const parsed = dateRangeSchema.safeParse(range);
  if (!parsed.success) return [];
  const db = await getDb();
  const { data } = await db
    .from("tasks")
    .select(COLUMNS)
    .gte("due_date", parsed.data.from)
    .lte("due_date", parsed.data.to);
  return (data ?? []).map(toTask);
}

function statusFields(status: TaskStatus, previous?: { status: TaskStatus; completed_at: string | null }) {
  if (status !== "done") return { status, completed_at: null };
  // Behold opprinnelig tidspunkt hvis den allerede var ferdig.
  return { status, completed_at: previous?.status === "done" ? previous.completed_at : new Date().toISOString() };
}

export async function saveTask(input: TaskFormInput): Promise<TaskResult> {
  await requireFamily();
  const parsed = taskFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { id, title, notes, assigneeId, categoryId, dueDate, dueTime, status } = parsed.data;
  const fields = { title, notes, assignee_id: assigneeId, category_id: categoryId, due_date: dueDate, due_time: dueTime };

  const db = await getDb();
  let row: TaskRow | null = null;
  if (id) {
    const { data: prev } = await db.from("tasks").select("status, completed_at").eq("id", id).maybeSingle();
    if (!prev) return { ok: false, message: "Fant ikke oppgaven" };
    const { data } = await db
      .from("tasks")
      .update({ ...fields, ...statusFields(status, prev) })
      .eq("id", id)
      .select(COLUMNS)
      .maybeSingle();
    row = data;
  } else {
    const { data } = await db
      .from("tasks")
      .insert({ ...fields, ...statusFields(status) })
      .select(COLUMNS)
      .maybeSingle();
    row = data;
  }
  if (!row) return { ok: false, message: "Kunne ikke lagre oppgaven" };

  revalidate();
  return { ok: true, message: id ? "Oppgaven er lagret" : "Oppgaven er lagt til", task: toTask(row) };
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<TaskResult> {
  await requireFamily();
  const parsed = z.object({ id: z.uuid(), status: taskStatusSchema }).safeParse({ id, status });
  if (!parsed.success) return { ok: false, message: "Ugyldig oppgave" };

  const db = await getDb();
  const { data: prev } = await db.from("tasks").select("status, completed_at").eq("id", id).maybeSingle();
  if (!prev) return { ok: false, message: "Fant ikke oppgaven" };
  const { data } = await db
    .from("tasks")
    .update(statusFields(parsed.data.status, prev))
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (!data) return { ok: false, message: "Kunne ikke oppdatere oppgaven" };

  revalidate();
  return { ok: true, task: toTask(data), message: status === "done" ? "Bra jobba! 🎉" : undefined };
}

export async function deleteTask(id: string): Promise<TaskResult> {
  await requireFamily();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Ugyldig oppgave" };
  const db = await getDb();
  const { error } = await db.from("tasks").delete().eq("id", id);
  if (error) return { ok: false, message: "Kunne ikke slette oppgaven" };
  revalidate();
  return { ok: true, message: "Oppgaven er slettet" };
}
