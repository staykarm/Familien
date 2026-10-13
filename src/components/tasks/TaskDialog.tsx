"use client";

import { useState, useTransition } from "react";
import { DateTime } from "luxon";
import { deleteTask, saveTask } from "@/actions/tasks";
import { Avatar } from "@/components/ui/Avatar";
import { DeleteButton, Sheet } from "@/components/ui/Sheet";
import { buttonPrimary, input, label } from "@/components/ui/styles";
import type { CalendarCategory, CalendarMember } from "@/lib/calendar/types";
import type { Task, TaskStatus } from "@/lib/tasks/types";
import { TIME_ZONE } from "@/lib/time";

export interface TaskDraft {
  id: string | null;
  title: string;
  notes: string;
  assigneeId: string | null;
  categoryId: string | null;
  dueDate: string;
  dueTime: string;
  status: TaskStatus;
}

export function draftFromTask(t: Task): TaskDraft {
  return {
    id: t.id,
    title: t.title,
    notes: t.notes ?? "",
    assigneeId: t.assigneeId,
    categoryId: t.categoryId,
    dueDate: t.dueDate ?? "",
    dueTime: t.dueTime ?? "",
    status: t.status,
  };
}

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "⬜ Å gjøre" },
  { value: "doing", label: "⏳ Pågår" },
  { value: "done", label: "✅ Ferdig" },
];

function quickDates(): { label: string; date: string }[] {
  const today = DateTime.now().setZone(TIME_ZONE).startOf("day");
  // Neste fredag (eller i dag hvis det er fredag).
  const friday = today.plus({ days: (5 - today.weekday + 7) % 7 });
  return [
    { label: "I dag", date: today.toISODate()! },
    { label: "I morgen", date: today.plus({ days: 1 }).toISODate()! },
    { label: "Fredag", date: friday.toISODate()! },
    { label: "Om en uke", date: today.plus({ weeks: 1 }).toISODate()! },
  ];
}

interface Props {
  draft: TaskDraft;
  members: CalendarMember[];
  categories: CalendarCategory[];
  onClose: () => void;
  onSaved: (message: string, task?: Task, deletedId?: string) => void;
}

export function TaskDialog({ draft: initial, members, categories, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const isNew = draft.id === null;
  const set = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await saveTask(draft);
      if (res.ok) onSaved(res.message ?? "Lagret", res.task);
      else setError(res.message ?? "Noe gikk galt");
    });
  }

  function remove() {
    if (!draft.id) return;
    const id = draft.id;
    startTransition(async () => {
      const res = await deleteTask(id);
      if (res.ok) onSaved(res.message ?? "Slettet", undefined, id);
      else setError(res.message ?? "Noe gikk galt");
    });
  }

  return (
    <Sheet
      title={isNew ? "Ny oppgave" : "Endre oppgave"}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          {!isNew && (
            <DeleteButton
              confirming={confirmDelete}
              onAsk={() => setConfirmDelete(true)}
              onCancel={() => setConfirmDelete(false)}
              onConfirm={remove}
              pending={pending}
              label="🗑️ Slett"
            />
          )}
          <button className={`${buttonPrimary} ml-auto`} disabled={pending}>
            {pending ? "Lagrer …" : isNew ? "Legg til" : "Lagre"}
          </button>
        </>
      }
    >
      <div>
        <label htmlFor="task-title" className={label}>
          Hva skal gjøres?
        </label>
        <input
          id="task-title"
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="F.eks. Pakke gymtøy"
          className={`${input} text-lg font-bold`}
          autoFocus={isNew}
          required
        />
      </div>

      <fieldset>
        <legend className={label}>Hvem har ansvaret?</legend>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => {
            const on = draft.assigneeId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                onClick={() => set("assigneeId", on ? null : m.id)}
                className="flex min-h-12 items-center gap-2 rounded-full border-2 py-1 pl-1 pr-4 font-bold transition active:scale-95"
                style={{ borderColor: on ? m.color : "var(--color-line)", background: on ? `${m.color}26` : "var(--color-card)" }}
              >
                <Avatar name={m.name} color={m.color} icon={m.icon} url={m.avatarUrl} size={36} ring={on} />
                {m.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 rounded-2xl bg-card-soft p-4">
        <span className={label}>Frist</span>
        <div className="flex flex-wrap gap-2">
          {quickDates().map((q) => (
            <button
              key={q.label}
              type="button"
              aria-pressed={draft.dueDate === q.date}
              onClick={() => set("dueDate", q.date)}
              className={`min-h-11 rounded-full px-4 text-sm font-bold transition active:scale-95 ${
                draft.dueDate === q.date ? "bg-primary text-white" : "bg-card text-ink"
              }`}
            >
              {q.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={!draft.dueDate}
            onClick={() => setDraft((d) => ({ ...d, dueDate: "", dueTime: "" }))}
            className={`min-h-11 rounded-full px-4 text-sm font-bold transition active:scale-95 ${
              !draft.dueDate ? "bg-primary text-white" : "bg-card text-ink"
            }`}
          >
            Ingen frist
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="task-date" className={label}>
              Dato
            </label>
            <input
              id="task-date"
              type="date"
              value={draft.dueDate}
              onChange={(e) => set("dueDate", e.target.value)}
              className={input}
            />
          </div>
          <div>
            <label htmlFor="task-time" className={label}>
              Klokkeslett (valgfritt)
            </label>
            <input
              id="task-time"
              type="time"
              value={draft.dueTime}
              disabled={!draft.dueDate}
              onChange={(e) => set("dueTime", e.target.value)}
              className={input}
            />
          </div>
        </div>
      </div>

      <fieldset>
        <legend className={label}>Status</legend>
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-card-soft p-1">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={draft.status === s.value}
              onClick={() => set("status", s.value)}
              className={`min-h-11 rounded-xl text-sm font-bold transition ${
                draft.status === s.value ? "bg-card text-primary-dark shadow-sm" : "text-ink-light"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={label}>Kategori</legend>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => {
            const on = draft.categoryId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => set("categoryId", on ? null : c.id)}
                className="min-h-11 rounded-full border-2 px-3 text-sm font-bold transition active:scale-95"
                style={{ borderColor: on ? c.color : "var(--color-line)", background: on ? `${c.color}26` : "var(--color-card)" }}
              >
                <span aria-hidden>{c.icon}</span> {c.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="task-notes" className={label}>
          Notat
        </label>
        <textarea
          id="task-notes"
          value={draft.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
          placeholder="Valgfritt"
          className={`${input} py-3`}
        />
      </div>

      {error && <p className="rounded-2xl bg-primary-soft p-3 font-semibold text-danger">{error}</p>}
    </Sheet>
  );
}
