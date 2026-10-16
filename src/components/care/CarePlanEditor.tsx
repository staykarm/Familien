"use client";

import { useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import { ChevronDown, Copy } from "lucide-react";
import { saveCareEntry } from "@/actions/care";
import { Avatar } from "@/components/ui/Avatar";
import { buttonGhost, buttonSecondary, card, input } from "@/components/ui/styles";
import { EMPTY_SLOT, hasSlot, PART_LABEL, upcomingWeekdays, usualTime, type CareData, type CareEntry, type CarePart, type Slot } from "@/lib/care/plan";
import { TIME_ZONE } from "@/lib/time";

interface Person {
  id: string;
  name: string;
  color: string;
  icon: string;
  avatarUrl: string | null;
}

interface Props {
  memberId: string;
  memberName: string;
  /** De som kan levere og hente (alle unntatt barnet selv og Felles). */
  people: Person[];
  initial: CareData;
  /** På siden «Henting» er listen alltid åpen, og overskriften er barnets navn. */
  alwaysOpen?: boolean;
  heading?: string;
}

const PARTS: CarePart[] = ["drop", "pick"];

/**
 * «Levering og henting» på barnets profil. Det finnes ikke noe fast mønster, så man velger hvem som leverer og
 * henter dag for dag. Hver endring lagres med en gang.
 */
export function CarePlanEditor({ memberId, memberName, people, initial, alwaysOpen = false, heading = "🚸 Levering og henting" }: Props) {
  const [entries, setEntries] = useState<CareEntry[]>(() => initial.entries.filter((e) => e.memberId === memberId));
  const [open, setOpen] = useState(alwaysOpen || entries.length > 0);
  const [weeks, setWeeks] = useState(3);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const saving = useRef(0);

  const today = DateTime.now().setZone(TIME_ZONE).toISODate()!;
  const dates = useMemo(() => upcomingWeekdays(today, weeks), [today, weeks]);
  const byWeek = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const d of dates) {
      const dt = DateTime.fromISO(d);
      const key = `${dt.weekYear}-${dt.weekNumber}`;
      map.set(key, [...(map.get(key) ?? []), d]);
    }
    return [...map.values()];
  }, [dates]);

  const entryFor = (date: string): CareEntry => entries.find((e) => e.date === date) ?? { memberId, date, drop: EMPTY_SLOT, pick: EMPTY_SLOT };

  /** Lagrer én dag (optimistisk). Feiler det, settes dagen tilbake. */
  async function save(next: CareEntry) {
    const before = entries.find((e) => e.date === next.date) ?? null;
    setEntries((list) => [...list.filter((e) => e.date !== next.date), ...(hasSlot(next.drop) || hasSlot(next.pick) ? [next] : [])]);
    saving.current++;
    setStatus({ text: "Lagrer …", error: false });
    const res = await saveCareEntry({ memberId, date: next.date, drop: next.drop, pick: next.pick });
    saving.current--;
    if (!res.ok) {
      setEntries((list) => [...list.filter((e) => e.date !== next.date), ...(before ? [before] : [])]);
      setStatus({ text: res.message ?? "Kunne ikke lagre", error: true });
    } else if (saving.current === 0) {
      setStatus({ text: "Lagret ✓", error: false });
    }
  }

  function setPart(date: string, part: CarePart, patch: Partial<Slot>) {
    const e = entryFor(date);
    const slot = { ...e[part], ...patch };
    // Velger man en person uten klokkeslett, foreslås det som er brukt sist (f.eks. 08:00 for levering).
    if (patch.by && !slot.time) slot.time = usualTime(entries, part);
    void save({ ...e, [part]: slot });
  }

  /** Fyller tomme dager i uka med det som var registrert samme ukedag uka før. */
  function copyPreviousWeek(week: string[]) {
    for (const date of week) {
      if (entries.some((e) => e.date === date)) continue;
      const prev = entries.find((e) => e.date === DateTime.fromISO(date).minus({ weeks: 1 }).toISODate());
      if (prev) void save({ ...prev, date });
    }
  }

  if (!open) {
    return (
      <section className={`${card} flex flex-col gap-2`}>
        <h2 className="font-display text-lg font-bold sm:text-xl">🚸 Levering og henting</h2>
        <p className="text-sm text-ink-light">Hvem som leverer og henter {memberName} i barnehagen eller på skolen, dag for dag.</p>
        <button type="button" className={`${buttonSecondary} self-start`} onClick={() => setOpen(true)}>
          Sett opp levering og henting
        </button>
      </section>
    );
  }

  return (
    <section id="levering" className={`${card} flex flex-col gap-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold sm:text-xl">{heading}</h2>
        {status && (
          <span className={`text-sm font-semibold ${status.error ? "text-danger" : "text-ink-light"}`} aria-live="polite">
            {status.text}
          </span>
        )}
      </div>
      <p className="-mt-2 text-sm text-ink-light">
        Velg hvem som leverer og henter {memberName} hver dag. Det lagres med en gang og vises i kalenderen hos den som har ansvaret, og
        under «I dag».
      </p>

      {byWeek.map((week) => {
        const first = DateTime.fromISO(week[0]).setLocale("nb");
        const last = DateTime.fromISO(week[week.length - 1]).setLocale("nb");
        const prevHasAny = week.some((d) => entries.some((e) => e.date === DateTime.fromISO(d).minus({ weeks: 1 }).toISODate()));
        const emptyDays = week.some((d) => !entries.some((e) => e.date === d));
        return (
          <div key={week[0]} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold">
                Uke {first.weekNumber}{" "}
                <span className="font-semibold text-ink-light">
                  ·{" "}
                  {week.length === 1
                    ? first.toFormat("d. LLL")
                    : `${first.day}.${first.month === last.month ? "" : ` ${first.toFormat("LLL")}`}–${last.toFormat("d. LLL")}`}
                </span>
              </span>
              {prevHasAny && emptyDays && (
                <button type="button" className={`${buttonGhost} min-h-10 text-sm`} onClick={() => copyPreviousWeek(week)}>
                  <Copy size={16} aria-hidden /> Som uka før
                </button>
              )}
            </div>
            <ul className="flex flex-col gap-1.5">
              {week.map((date) => {
                const e = entryFor(date);
                const dt = DateTime.fromISO(date).setLocale("nb");
                const isToday = date === today;
                return (
                  <li key={date} className={`flex flex-col gap-1 rounded-2xl p-2 ${isToday ? "bg-sun/30 ring-1 ring-sun" : "bg-card-soft"}`}>
                    <span className="font-bold first-letter:uppercase">
                      {dt.toFormat("cccc d. LLL")}
                      {isToday && <span className="font-semibold text-ink-light"> · i dag</span>}
                    </span>
                    {PARTS.map((part) => (
                      <div key={part} className="flex items-center gap-1.5">
                        <span className="w-12 shrink-0 text-sm font-bold text-ink-light">{PART_LABEL[part].doer}</span>
                        <PeoplePicker people={people} value={e[part].by} onChange={(by) => setPart(date, part, { by, ...(by ? {} : { time: null }) })} />
                        {e[part].by && <TimeInput value={e[part].time} onChange={(time) => setPart(date, part, { time })} />}
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <button type="button" className={`${buttonGhost} self-start`} onClick={() => setWeeks((w) => w + 3)}>
        <ChevronDown size={18} aria-hidden /> Vis flere uker
      </button>
    </section>
  );
}

function PeoplePicker({ people, value, onChange }: { people: Person[]; value: string | null; onChange: (id: string | null) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 sm:gap-1" role="radiogroup" aria-label="Hvem">
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
