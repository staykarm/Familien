"use client";

import { useState } from "react";
import { AlarmClock, X } from "lucide-react";
import { cancelHouseSchedule } from "@/actions/huset";
import { scheduleWhen, type ScheduledItem } from "@/lib/huset/schedule";

// Det «Spør huset» har planlagt («Varmekablene skrus av kl. 10:00»), under spørrefeltet. × avlyser.

export function ScheduleList({ items, onChanged }: { items: ScheduledItem[]; onChanged: () => void }) {
  const [gone, setGone] = useState<string[]>([]);
  const shown = items.filter((i) => !gone.includes(i.id));
  if (!shown.length) return null;

  async function cancel(id: string) {
    setGone((g) => [...g, id]);
    const res = await cancelHouseSchedule(id);
    if (!res.ok) setGone((g) => g.filter((x) => x !== id));
    onChanged();
  }

  return (
    <section aria-label="Planlagt" className="-mt-2 flex flex-wrap gap-2">
      {shown.map((i) => (
        <span key={i.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-card py-1 pr-1 pl-3 text-sm shadow-[0_2px_12px_rgba(120,90,60,0.08)]">
          <AlarmClock size={14} className="shrink-0 text-primary" aria-hidden />
          <span className="font-semibold tabular-nums">{scheduleWhen(i.runAt)}</span>
          <span className="wrap-break-word">{i.description}</span>
          <button type="button" onClick={() => void cancel(i.id)} aria-label={`Avlys: ${i.description}`} className="grid size-8 shrink-0 place-items-center rounded-full text-ink-light hover:bg-card-soft hover:text-ink">
            <X size={14} aria-hidden />
          </button>
        </span>
      ))}
    </section>
  );
}
