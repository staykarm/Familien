"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { addItem, toggleItem } from "@/actions/shopping";
import { setTaskStatus } from "@/actions/tasks";
import { Avatar } from "@/components/ui/Avatar";
import type { CalendarMember } from "@/lib/calendar/types";
import { osloDate } from "@/lib/calendar/dates";
import type { ShoppingItem } from "@/lib/shopping/types";
import type { Task } from "@/lib/tasks/types";

// Oppgaver og handlelisten på dashboardet. Et trykk krysser av med en gang; et nytt trykk angrer.
// Avkryssede står igjen (gjennomstreket) til siden hentes på nytt.

function Tick({ done, label, onClick }: { done: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={done}
      aria-label={done ? `Angre ${label}` : `Kryss av ${label}`}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${done ? "border-ink bg-ink text-white" : "border-ink-faint hover:border-ink"}`}
    >
      {done && <Check size={14} aria-hidden />}
    </button>
  );
}

/** «i dag», «i morgen», «fre. 6. nov.»; rød når fristen er passert. */
function due(task: Task, today: string): { text: string; late: boolean } | null {
  if (!task.dueDate) return null;
  const late = task.dueDate < today;
  const tomorrow = osloDate(today).plus({ days: 1 }).toISODate();
  const day = task.dueDate === today ? "i dag" : task.dueDate === tomorrow ? "i morgen" : osloDate(task.dueDate).setLocale("nb").toFormat("ccc d. LLL");
  return { text: task.dueTime ? `${day} ${task.dueTime.slice(0, 5)}` : day, late };
}

export function TaskChecklist({ tasks, members, today, max }: { tasks: Task[]; members: CalendarMember[]; today: string; max?: number }) {
  const router = useRouter();
  const [done, setDone] = useState<Record<string, boolean>>({});
  if (!tasks.length) return <p className="text-xs text-ink-light">Ingen åpne oppgaver.</p>;
  const shown = max ? tasks.slice(0, max) : tasks;

  async function toggle(t: Task) {
    const next = !done[t.id];
    setDone((d) => ({ ...d, [t.id]: next }));
    const res = await setTaskStatus(t.id, next ? "done" : "todo");
    if (!res.ok) setDone((d) => ({ ...d, [t.id]: !next }));
    if (!next) router.refresh();
  }

  return (
    <ul className="flex flex-col">
      {shown.map((t) => {
        const d = due(t, today);
        const who = members.find((m) => m.id === t.assigneeId);
        const isDone = !!done[t.id];
        return (
          <li key={t.id} className="flex items-center gap-2 border-b border-line py-1.5 last:border-0">
            <Tick done={isDone} label={t.title} onClick={() => void toggle(t)} />
            <span className={`min-w-0 flex-1 text-sm leading-snug wrap-break-word ${isDone ? "text-ink-faint line-through" : ""}`}>{t.title}</span>
            {d && <span className={`shrink-0 text-xs tabular-nums ${d.late && !isDone ? "font-semibold text-danger" : "text-ink-light"}`}>{d.text}</span>}
            {who && <Avatar name={who.name} color={who.color} icon={who.icon} url={who.avatarUrl} size={18} ring={false} />}
          </li>
        );
      })}
      {max && tasks.length > max && <li className="pt-1 text-xs text-ink-light">+{tasks.length - max} til</li>}
    </ul>
  );
}

export function ShoppingChecklist({ items, max, columns = false }: { items: ShoppingItem[]; max?: number; columns?: boolean }) {
  const router = useRouter();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const open = items.filter((i) => !i.checked);
  const shown = max ? open.slice(0, max) : open;

  async function toggle(item: ShoppingItem) {
    const next = !checked[item.id];
    setChecked((c) => ({ ...c, [item.id]: next }));
    const res = await toggleItem(item.id, next);
    if (!res.ok) setChecked((c) => ({ ...c, [item.id]: !next }));
  }

  async function add() {
    const clean = name.trim();
    if (!clean || adding) return;
    setAdding(true);
    const res = await addItem({ name: clean });
    setAdding(false);
    setMessage(res.ok ? null : (res.message ?? "Kunne ikke legge til"));
    if (res.ok) {
      setName("");
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Legg til vare"
          aria-label="Ny vare"
          maxLength={120}
          enterKeyHint="done"
          className="min-h-8 min-w-0 flex-1 rounded-lg border border-line bg-card-soft px-2.5 text-sm outline-none focus:border-ink-faint"
        />
        <button type="submit" disabled={adding || !name.trim()} aria-label="Legg til" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line transition hover:border-ink-faint disabled:opacity-40">
          <Plus size={16} aria-hidden />
        </button>
      </form>
      {message && <p className="text-xs text-danger">{message}</p>}
      {!open.length ? (
        <p className="text-xs text-ink-light">Handlelisten er tom.</p>
      ) : (
        <ul className={columns ? "grid grid-cols-2 gap-x-4 md:grid-cols-3" : "flex flex-col"}>
          {shown.map((i) => {
            const isChecked = !!checked[i.id];
            return (
              <li key={i.id} className="flex items-center gap-2 border-b border-line py-1 last:border-0">
                <Tick done={isChecked} label={i.name} onClick={() => void toggle(i)} />
                <span className={`min-w-0 flex-1 text-sm wrap-break-word ${isChecked ? "text-ink-faint line-through" : ""}`}>{i.name}</span>
                {i.quantity && <span className="shrink-0 text-xs text-ink-light">{i.quantity}</span>}
              </li>
            );
          })}
          {max && open.length > max && <li className="pt-1 text-xs text-ink-light">+{open.length - max} til</li>}
        </ul>
      )}
    </div>
  );
}
