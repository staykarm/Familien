"use client";

import { useCallback, useState } from "react";
import { Copy } from "lucide-react";
import { saveCarePlan } from "@/actions/care";
import { Avatar } from "@/components/ui/Avatar";
import { buttonGhost, card, input } from "@/components/ui/styles";
import { autosaveLabel, useAutosave } from "@/components/useAutosave";
import { WEEKDAYS, type CarePlanDay } from "@/lib/care/plan";

interface Person {
  id: string;
  name: string;
  color: string;
  icon: string;
  avatarUrl: string | null;
}

type Day = Omit<CarePlanDay, "memberId">;

interface Props {
  memberId: string;
  memberName: string;
  /** De som kan levere og hente (alle unntatt barnet selv og Felles). */
  people: Person[];
  initial: CarePlanDay[];
}

/** «Levering og henting» på profilsiden: hvem som leverer og henter, og når, mandag–fredag. Lagres automatisk. */
export function CarePlanEditor({ memberId, memberName, people, initial }: Props) {
  const [days, setDays] = useState<Day[]>(() =>
    WEEKDAYS.map(({ n }) => {
      const p = initial.find((d) => d.weekday === n);
      return { weekday: n, dropBy: p?.dropBy ?? null, dropTime: p?.dropTime ?? null, pickBy: p?.pickBy ?? null, pickTime: p?.pickTime ?? null };
    })
  );
  const [error, setError] = useState<string | null>(null);
  const save = useCallback(
    async (value: Day[]) => {
      const res = await saveCarePlan({ memberId, days: value });
      setError(res.ok ? null : (res.message ?? "Kunne ikke lagre"));
      return res.ok;
    },
    [memberId]
  );
  const { state } = useAutosave(days, save, { key: (v) => JSON.stringify(v) });

  const update = (weekday: number, patch: Partial<Day>) =>
    setDays((list) => list.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
  const copyMonday = () => setDays((list) => list.map((d) => ({ ...list[0], weekday: d.weekday })));

  return (
    <section className={`${card} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold sm:text-xl">Levering og henting</h2>
        <span className="text-sm font-semibold text-ink-light" aria-live="polite">
          {error ?? autosaveLabel(state)}
        </span>
      </div>
      <p className="text-sm text-ink-light">
        Hvem som leverer og henter {memberName} i barnehagen eller på skolen på hverdager. Vises på {memberName} sin dag i kalenderen
        («Per person») og under «I dag».
      </p>
      <ul className="flex flex-col gap-2">
        {days.map((d) => (
          <li key={d.weekday} className="flex flex-col gap-2 rounded-2xl bg-card-soft p-2 sm:p-3">
            <span className="font-bold">{WEEKDAYS[d.weekday - 1].label}</span>
            <PlanLine
              label="Lever"
              people={people}
              by={d.dropBy}
              time={d.dropTime}
              onBy={(dropBy) => update(d.weekday, { dropBy })}
              onTime={(dropTime) => update(d.weekday, { dropTime })}
            />
            <PlanLine
              label="Henter"
              people={people}
              by={d.pickBy}
              time={d.pickTime}
              onBy={(pickBy) => update(d.weekday, { pickBy })}
              onTime={(pickTime) => update(d.weekday, { pickTime })}
            />
          </li>
        ))}
      </ul>
      <button type="button" className={`${buttonGhost} self-start`} onClick={copyMonday}>
        <Copy size={18} aria-hidden /> Bruk mandag på alle dagene
      </button>
    </section>
  );
}

function PlanLine({
  label,
  people,
  by,
  time,
  onBy,
  onTime,
}: {
  label: string;
  people: Person[];
  by: string | null;
  time: string | null;
  onBy: (id: string | null) => void;
  onTime: (t: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-14 text-sm font-bold text-ink-light">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {people.map((p) => {
          const on = by === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onBy(on ? null : p.id)}
              className={`flex min-h-12 items-center gap-1.5 rounded-2xl border-2 px-2 font-semibold transition ${
                on ? "bg-card" : "border-transparent text-ink-light opacity-70"
              }`}
              style={on ? { borderColor: p.color } : undefined}
            >
              <Avatar name={p.name} color={p.color} icon={p.icon} url={p.avatarUrl} size={28} ring={on} />
              <span className="text-sm">{p.name}</span>
            </button>
          );
        })}
      </div>
      <input
        type="time"
        aria-label={`${label} klokkeslett`}
        className={`${input} max-w-36`}
        value={time ?? ""}
        onChange={(e) => onTime(e.target.value ? e.target.value.slice(0, 5) : null)}
      />
    </div>
  );
}
