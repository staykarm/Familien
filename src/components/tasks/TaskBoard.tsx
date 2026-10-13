"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Plus } from "lucide-react";
import { saveTask, setTaskStatus } from "@/actions/tasks";
import { Avatar } from "@/components/ui/Avatar";
import { buttonPrimary, card, input } from "@/components/ui/styles";
import { osloToday } from "@/lib/calendar/dates";
import type { CalendarCategory, CalendarMember } from "@/lib/calendar/types";
import { dueLabel, groupTasks } from "@/lib/tasks/group";
import type { Task } from "@/lib/tasks/types";
import { TaskDialog, draftFromTask, type TaskDraft } from "./TaskDialog";

interface Props {
  initialTasks: Task[];
  members: CalendarMember[];
  categories: CalendarCategory[];
  activeMemberId: string | null;
}

const ALL = "alle";

export function TaskBoard({ initialTasks, members, categories, activeMemberId }: Props) {
  const [tasks, setTasks] = useState(initialTasks);
  const [filter, setFilter] = useState<string>(ALL);
  const [showDone, setShowDone] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [adding, startAdding] = useTransition();
  const today = osloToday();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const upsert = (task: Task) =>
    setTasks((list) => (list.some((t) => t.id === task.id) ? list.map((t) => (t.id === task.id ? task : t)) : [...list, task]));

  const visible = useMemo(
    () => tasks.filter((t) => filter === ALL || t.assigneeId === filter),
    [tasks, filter]
  );
  const groups = groupTasks(visible, today);
  const openCount = visible.filter((t) => t.status !== "done").length;

  function toggleDone(task: Task) {
    const next = task.status === "done" ? "todo" : "done";
    // Optimistisk: kryss av med en gang, rull tilbake hvis lagringen feiler.
    upsert({ ...task, status: next, completedAt: next === "done" ? new Date().toISOString() : null });
    void setTaskStatus(task.id, next).then((res) => {
      if (res.ok && res.task) {
        upsert(res.task);
        if (res.message) setToast(res.message);
      } else {
        upsert(task);
        setToast(res.message ?? "Kunne ikke oppdatere");
      }
    });
  }

  function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;
    startAdding(async () => {
      const res = await saveTask({
        title,
        notes: "",
        assigneeId: filter !== ALL ? filter : activeMemberId,
        categoryId: null,
        dueDate: null,
        dueTime: null,
        status: "todo",
      });
      if (res.ok && res.task) {
        upsert(res.task);
        setQuickTitle("");
      } else setToast(res.message ?? "Kunne ikke legge til");
    });
  }

  function newDraft(): TaskDraft {
    return {
      id: null,
      title: "",
      notes: "",
      assigneeId: filter !== ALL ? filter : activeMemberId,
      categoryId: null,
      dueDate: "",
      dueTime: "",
      status: "todo",
    };
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl font-bold">Oppgaver</h1>
        <button className={buttonPrimary} onClick={() => setDraft(newDraft())}>
          <Plus size={22} aria-hidden /> Ny oppgave
        </button>
      </div>

      <form onSubmit={quickAdd} className="flex gap-2">
        <input
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          placeholder="Legg til raskt … f.eks. «Kjøpe bursdagsgave»"
          aria-label="Ny oppgave"
          className={input}
        />
        <button className={`${buttonPrimary} shrink-0 px-4`} disabled={adding || !quickTitle.trim()} aria-label="Legg til">
          <Plus size={22} aria-hidden />
        </button>
      </form>

      <div className="flex flex-wrap gap-2" aria-label="Vis oppgaver for">
        <button
          aria-pressed={filter === ALL}
          onClick={() => setFilter(ALL)}
          className={`min-h-12 rounded-full border-2 px-5 text-sm font-bold transition ${
            filter === ALL ? "border-primary bg-primary-soft text-primary-dark" : "border-line bg-card"
          }`}
        >
          Alle
        </button>
        {members.map((m) => {
          const on = filter === m.id;
          return (
            <button
              key={m.id}
              aria-pressed={on}
              onClick={() => setFilter(on ? ALL : m.id)}
              className="flex min-h-12 items-center gap-2 rounded-full border-2 py-1 pl-1 pr-4 text-sm font-bold transition"
              style={{ borderColor: on ? m.color : "var(--color-line)", background: on ? `${m.color}26` : "var(--color-card)" }}
            >
              <Avatar name={m.name} color={m.color} icon={m.icon} url={m.avatarUrl} size={32} ring={false} />
              {m.name}
            </button>
          );
        })}
      </div>

      {openCount === 0 && (
        <section className={`${card} flex flex-col items-center gap-2 py-10 text-center`}>
          <span className="text-5xl" aria-hidden>
            🎉
          </span>
          <p className="font-bold">Ingen oppgaver igjen!</p>
        </section>
      )}

      {groups.map((group) => {
        if (group.key === "done") {
          return (
            <section key="done" className="flex flex-col gap-2">
              <button
                onClick={() => setShowDone(!showDone)}
                className="self-start text-sm font-bold text-ink-light underline-offset-4 hover:underline"
                aria-expanded={showDone}
              >
                {showDone ? "Skjul" : "Vis"} ferdige ({group.tasks.length})
              </button>
              {showDone && (
                <ul className="flex flex-col gap-2">
                  {group.tasks.map((t) => (
                    <TaskRow key={t.id} task={t} members={members} categories={categories} today={today} onToggle={toggleDone} onOpen={() => setDraft(draftFromTask(t))} />
                  ))}
                </ul>
              )}
            </section>
          );
        }
        return (
          <section key={group.key} className="flex flex-col gap-2">
            <h2 className={`font-display text-xl font-bold ${group.key === "overdue" ? "text-danger" : ""}`}>
              {group.title} <span className="text-base font-semibold text-ink-faint">{group.tasks.length}</span>
            </h2>
            <ul className="flex flex-col gap-2">
              {group.tasks.map((t) => (
                <TaskRow key={t.id} task={t} members={members} categories={categories} today={today} onToggle={toggleDone} onOpen={() => setDraft(draftFromTask(t))} />
              ))}
            </ul>
          </section>
        );
      })}

      {draft && (
        <TaskDialog
          key={draft.id ?? "ny"}
          draft={draft}
          members={members}
          categories={categories}
          onClose={() => setDraft(null)}
          onSaved={(message, task, deletedId) => {
            if (task) upsert(task);
            if (deletedId) setTasks((list) => list.filter((t) => t.id !== deletedId));
            setDraft(null);
            setToast(message);
          }}
        />
      )}

      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit rounded-full bg-ink px-5 py-3 font-bold text-white shadow-lg md:bottom-8">
          {toast}
        </div>
      )}
    </div>
  );
}

interface RowProps {
  task: Task;
  members: CalendarMember[];
  categories: CalendarCategory[];
  today: string;
  onToggle: (t: Task) => void;
  onOpen: () => void;
}

function TaskRow({ task, members, categories, today, onToggle, onOpen }: RowProps) {
  const assignee = members.find((m) => m.id === task.assigneeId);
  const category = categories.find((c) => c.id === task.categoryId);
  const due = dueLabel(task, today);
  const done = task.status === "done";
  const overdue = !done && !!task.dueDate && task.dueDate < today;
  const color = assignee?.color ?? "#a39e93";

  return (
    <li className="flex items-center gap-3 rounded-3xl bg-card p-2 pr-4 shadow-[0_2px_12px_rgba(120,90,60,0.08)]" style={{ boxShadow: `inset 6px 0 0 ${color}, 0 2px 12px rgba(120,90,60,0.08)` }}>
      <button
        onClick={() => onToggle(task)}
        aria-label={done ? `Merk «${task.title}» som ikke ferdig` : `Merk «${task.title}» som ferdig`}
        aria-pressed={done}
        className="ml-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-[3px] transition active:scale-90"
        style={{ borderColor: color, background: done ? color : "transparent" }}
      >
        {done && <Check size={28} strokeWidth={3} className="text-white" aria-hidden />}
      </button>
      <button onClick={onOpen} className="flex min-h-12 min-w-0 flex-1 flex-col items-start justify-center text-left">
        <span className={`w-full truncate text-lg font-bold ${done ? "text-ink-faint line-through" : ""}`}>
          {category && <span aria-hidden>{category.icon} </span>}
          {task.title}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-sm text-ink-light">
          {task.status === "doing" && <span className="rounded-full bg-sun px-2 font-bold text-ink">Pågår</span>}
          {due && <span className={overdue ? "font-bold text-danger" : ""}>⏰ {due}</span>}
          {task.notes && <span className="truncate">📝 {task.notes}</span>}
        </span>
      </button>
      {assignee && <Avatar name={assignee.name} color={assignee.color} icon={assignee.icon} url={assignee.avatarUrl} size={36} />}
    </li>
  );
}
