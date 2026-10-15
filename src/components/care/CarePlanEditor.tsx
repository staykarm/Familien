"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { Ban, ChevronDown, RotateCcw } from "lucide-react";
import { saveCareDay, saveCarePlan } from "@/actions/care";
import { Avatar } from "@/components/ui/Avatar";
import { buttonGhost, buttonSecondary, card, input } from "@/components/ui/styles";
import { autosaveLabel, useAutosave } from "@/components/useAutosave";
import { pickupFor, upcomingWeekdays, WEEKDAYS, type CareData, type CareDay, type CarePlanDay } from "@/lib/care/plan";
import { TIME_ZONE } from "@/lib/time";

interface Person {
  id: string;
  name: string;
  color: string;
  icon: string;
  avatarUrl: string | null;
}

type PlanDay = Omit<CarePlanDay, "memberId">;

interface Props {
  memberId: string;
  memberName: string;
  /** De som kan hente (alle unntatt barnet selv og Felles). */
  people: Person[];
  initial: CareData;
}

/**
 * «Henting» på profilsiden: fast ukeplan for mandag–fredag og endringer for enkeltdager framover.
 * Ukeplanen lagres automatisk; hver dag lagres med en gang den endres.
 */
export function CarePlanEditor({ memberId, memberName, people, initial }: Props) {
  const hasAny = initial.plans.some((p) => p.memberId === memberId) || initial.days.some((d) => d.memberId === memberId);
  const [open, setOpen] = useState(hasAny);
  const [plan, setPlan] = useState<PlanDay[]>(() =>
    WEEKDAYS.map(({ n }) => {
      const p = initial.plans.find((d) => d.memberId === memberId && d.weekday === n);
      return { weekday: n, pickBy: p?.pickBy ?? null, pickTime: p?.pickTime ?? null };
    })
  );
  const [days, setDays] = useState<CareDay[]>(() => initial.days.filter((d) => d.memberId === memberId));
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (value: PlanDay[]) => {
      const res = await saveCarePlan({ memberId, days: value });
      setError(res.ok ? null : (res.message ?? "Kunne ikke lagre"));
      return res.ok;
    },
    [memberId]
  );
  const { state } = useAutosave(plan, save, { key: (v) => JSON.stringify(v), enabled: open });

  const updatePlan = (weekday: number, patch: Partial<PlanDay>) => setPlan((list) => list.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
  const copyMonday = () => setPlan((list) => list.map((d) => ({ ...list[0], weekday: d.weekday })));

  if (!open) {
    return (
      <section className={`${card} flex flex-col gap-2`}>
        <h2 className="font-display text-lg font-bold sm:text-xl">🚸 Henting</h2>
        <p className="text-sm text-ink-light">Hvem som henter {memberName} i barnehagen eller på skolen på hverdager.</p>
        <button type="button" className={`${buttonSecondary} self-start`} onClick={() => setOpen(true)}>
          Sett opp henting
        </button>
      </section>
    );
  }

  return (
    <section id="henting" className={`${card} flex flex-col gap-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold sm:text-xl">🚸 Henting</h2>
        <span className="text-sm font-semibold text-ink-light" aria-live="polite">
          {error ?? autosaveLabel(state)}
        </span>
      </div>
      <p className="-mt-2 text-sm text-ink-light">
        Hvem som henter {memberName} på hverdager. Vises i kalenderen hos den som henter, og under «I dag».
      </p>

      <div className="flex flex-col gap-2">
        <h3 className="font-bold">Fast ukeplan</h3>
        <ul className="flex flex-col gap-1.5">
          {plan.map((d) => (
            <li key={d.weekday} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-card-soft p-2">
              <span className="w-16 font-bold">{WEEKDAYS[d.weekday - 1].label}</span>
              <PeoplePicker people={people} value={d.pickBy} onChange={(pickBy) => updatePlan(d.weekday, { pickBy })} />
              <TimeInput value={d.pickTime} onChange={(pickTime) => updatePlan(d.weekday, { pickTime })} />
            </li>
          ))}
        </ul>
        <button type="button" className={`${buttonGhost} self-start`} onClick={copyMonday}>
          Bruk mandag på alle dagene
        </button>
      </div>

      <UpcomingDays memberId={memberId} people={people} plan={plan} days={days} onDays={setDays} />
    </section>
  );
}

/** Hverdagene framover, dato for dato. Endre hvem som henter en dag, eller sett «ingen henting». */
function UpcomingDays({
  memberId,
  people,
  plan,
  days,
  onDays,
}: {
  memberId: string;
  people: Person[];
  plan: PlanDay[];
  days: CareDay[];
  onDays: (update: (list: CareDay[]) => CareDay[]) => void;
}) {
  const [weeks, setWeeks] = useState(4);
  const today = DateTime.now().setZone(TIME_ZONE).toISODate()!;
  const dates = useMemo(() => upcomingWeekdays(today, weeks), [today, weeks]);
  const care = useMemo(() => ({ plans: plan.map((p) => ({ ...p, memberId })), days }), [plan, days, memberId]);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function set(date: string, change: { reset: true } | { reset: false; pickBy: string | null; pickTime: string | null }) {
    const before = days;
    onDays((list) => {
      const rest = list.filter((d) => d.date !== date);
      return change.reset ? rest : [...rest, { memberId, date, pickBy: change.pickBy, pickTime: change.pickTime }];
    });
    start(async () => {
      const res = await saveCareDay(
        change.reset ? { memberId, date, reset: true, pickBy: null, pickTime: null } : { memberId, date, ...change }
      );
      if (!res.ok) {
        setError(res.message ?? "Kunne ikke lagre");
        onDays(() => before);
      } else setError(null);
    });
  }

  // Grupper per uke.
  const byWeek = new Map<number, string[]>();
  for (const d of dates) {
    const w = DateTime.fromISO(d).weekNumber;
    byWeek.set(w, [...(byWeek.get(w) ?? []), d]);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold">Kommende dager</h3>
        {error && <span className="text-sm font-semibold text-danger">{error}</span>}
      </div>
      <p className="-mt-1 text-sm text-ink-light">Endre en dag ved å velge en annen person eller et annet klokkeslett. ⊘ = ingen henting den dagen, ↺ = tilbake til ukeplanen.</p>
      {[...byWeek].map(([week, list]) => (
        <div key={week} className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-ink-light">Uke {week}</span>
          <ul className="flex flex-col gap-1.5">
            {list.map((date) => {
              const override = days.find((d) => d.date === date);
              const p = pickupFor(care, memberId, date);
              const dt = DateTime.fromISO(date).setLocale("nb");
              const none = !!override && !override.pickBy && !override.pickTime;
              return (
                <li
                  key={date}
                  className={`flex items-center gap-1.5 rounded-2xl px-1.5 py-1 sm:gap-2 sm:p-2 ${override ? "bg-sun/30 ring-1 ring-sun" : "bg-card-soft"}`}
                >
                  <span className="w-11 shrink-0 leading-tight sm:w-16">
                    <span className="block font-bold capitalize">{dt.toFormat("ccc d.")}</span>
                    <span className="block text-xs text-ink-light">{dt.toFormat("LLL")}</span>
                  </span>
                  <PeoplePicker
                    people={people}
                    value={p?.by ?? null}
                    onChange={(pickBy) => set(date, { reset: false, pickBy, pickTime: p?.time ?? null })}
                  />
                  {none ? (
                    <span className="w-28 text-sm font-semibold text-ink-light">Ingen henting</span>
                  ) : (
                    <TimeInput value={p?.time ?? null} onChange={(pickTime) => set(date, { reset: false, pickBy: p?.by ?? null, pickTime })} />
                  )}
                  {override ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => set(date, { reset: true })}
                      aria-label="Tilbake til ukeplanen"
                      className="flex min-h-12 min-w-10 shrink-0 items-center justify-center rounded-2xl text-ink-light hover:bg-card"
                    >
                      <RotateCcw size={18} aria-hidden />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => set(date, { reset: false, pickBy: null, pickTime: null })}
                      aria-label="Ingen henting denne dagen"
                      title="Ingen henting denne dagen"
                      className="flex min-h-12 min-w-10 shrink-0 items-center justify-center rounded-2xl text-ink-light hover:bg-card"
                    >
                      <Ban size={18} aria-hidden />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <button type="button" className={`${buttonGhost} self-start`} onClick={() => setWeeks((w) => w + 4)}>
        <ChevronDown size={18} aria-hidden /> Vis flere uker
      </button>
    </div>
  );
}

function PeoplePicker({
  people,
  value,
  onChange,
}: {
  people: Person[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 sm:gap-1" role="radiogroup" aria-label="Hvem henter">
      {people.map((p) => {
        const on = value === p.id;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={p.name}
            onClick={() => onChange(on ? null : p.id)}
            className={`flex min-h-12 items-center gap-1 rounded-2xl border-2 px-1 transition sm:px-1.5 ${on ? "bg-card" : "border-transparent opacity-45"}`}
            style={on ? { borderColor: p.color } : undefined}
          >
            <Avatar name={p.name} color={p.color} icon={p.icon} url={p.avatarUrl} size={28} ring={on} />
            <span className="hidden text-sm font-semibold sm:inline">{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function TimeInput({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <input
      type="time"
      aria-label="Klokkeslett"
      className={`${input} max-w-28 px-2 sm:max-w-32`}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? e.target.value.slice(0, 5) : null)}
    />
  );
}
