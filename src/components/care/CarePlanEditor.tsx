"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { deleteCareOverride, restoreCareOverride, saveCareOverride, saveCarePlan } from "@/actions/care";
import { Avatar } from "@/components/ui/Avatar";
import { Sheet } from "@/components/ui/Sheet";
import { useUndo } from "@/components/ui/UndoToast";
import { buttonGhost, buttonPrimary, buttonSecondary, card, input, label } from "@/components/ui/styles";
import { autosaveLabel, useAutosave } from "@/components/useAutosave";
import {
  careFor,
  nextWeekdays,
  PART_LABEL,
  periodText,
  WEEKDAYS,
  type CareData,
  type CareOverride,
  type CarePart,
  type CareSlot,
  type Slot,
  type SlotChange,
} from "@/lib/care/plan";
import { TIME_ZONE } from "@/lib/time";

interface Person {
  id: string;
  name: string;
  color: string;
  icon: string;
  avatarUrl: string | null;
}

interface PlanDay {
  weekday: number;
  drop: Slot;
  pick: Slot;
}

interface Props {
  memberId: string;
  memberName: string;
  /** De som kan levere og hente (alle unntatt barnet selv og Felles). */
  people: Person[];
  initial: CareData;
}

const EMPTY: Slot = { by: null, time: null };
const PARTS: CarePart[] = ["drop", "pick"];

/**
 * «Levering og henting» på barnets profil: fast ukeplan for mandag–fredag (lagres automatisk) og unntak
 * for en periode («Marius henter 20.–24. okt», «Høstferie: ingen levering eller henting»).
 */
export function CarePlanEditor({ memberId, memberName, people, initial }: Props) {
  const mineInitial = useMemo(
    () => ({ plans: initial.plans.filter((p) => p.memberId === memberId), overrides: initial.overrides.filter((o) => o.memberId === memberId) }),
    [initial, memberId]
  );
  const [open, setOpen] = useState(mineInitial.plans.length > 0 || mineInitial.overrides.length > 0);
  const [plan, setPlan] = useState<PlanDay[]>(() =>
    WEEKDAYS.map(({ n }) => {
      const p = mineInitial.plans.find((d) => d.weekday === n);
      return { weekday: n, drop: p?.drop ?? EMPTY, pick: p?.pick ?? EMPTY };
    })
  );
  const [overrides, setOverrides] = useState<CareOverride[]>(mineInitial.overrides);
  const [editing, setEditing] = useState<CareOverride | "new" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { offer, node: undoNode } = useUndo((m) => setMessage(m ?? null));

  const save = useCallback(
    async (value: PlanDay[]) => {
      const res = await saveCarePlan({ memberId, days: value });
      setError(res.ok ? null : (res.message ?? "Kunne ikke lagre"));
      return res.ok;
    },
    [memberId]
  );
  const { state } = useAutosave(plan, save, { key: (v) => JSON.stringify(v), enabled: open });

  const updatePlan = (weekday: number, part: CarePart, patch: Partial<Slot>) =>
    setPlan((list) => list.map((d) => (d.weekday === weekday ? { ...d, [part]: { ...d[part], ...patch } } : d)));
  const copyMonday = () => setPlan((list) => list.map((d) => ({ ...list[0], weekday: d.weekday })));

  const today = DateTime.now().setZone(TIME_ZONE).toISODate()!;
  const care: CareData = useMemo(() => ({ plans: plan.map((p) => ({ ...p, memberId })), overrides }), [plan, overrides, memberId]);
  const upcoming = overrides.filter((o) => o.to >= today).sort((a, b) => a.from.localeCompare(b.from));

  async function remove(o: CareOverride) {
    const res = await deleteCareOverride(o.id);
    if (!res.ok) return setMessage(res.message ?? "Kunne ikke slette");
    setOverrides((list) => list.filter((x) => x.id !== o.id));
    const deleted = res.deleted;
    if (deleted) {
      offer({
        text: "Unntaket er slettet",
        run: async () => {
          const r = await restoreCareOverride(deleted);
          if (r.ok) setOverrides((list) => [...list, deleted]);
          return r;
        },
      });
    }
  }

  if (!open) {
    return (
      <section className={`${card} flex flex-col gap-2`}>
        <h2 className="font-display text-lg font-bold sm:text-xl">🚸 Levering og henting</h2>
        <p className="text-sm text-ink-light">Hvem som leverer og henter {memberName} i barnehagen eller på skolen på hverdager.</p>
        <button type="button" className={`${buttonSecondary} self-start`} onClick={() => setOpen(true)}>
          Sett opp levering og henting
        </button>
      </section>
    );
  }

  return (
    <section id="levering" className={`${card} flex flex-col gap-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold sm:text-xl">🚸 Levering og henting</h2>
        <span className="text-sm font-semibold text-ink-light" aria-live="polite">
          {error ?? autosaveLabel(state)}
        </span>
      </div>
      <p className="-mt-2 text-sm text-ink-light">
        Hvem som leverer og henter {memberName} på hverdager. Vises i kalenderen hos den som har ansvaret, og under «I dag».
      </p>

      {/* Fast ukeplan */}
      <div className="flex flex-col gap-2">
        <h3 className="font-bold">Fast ukeplan</h3>
        <ul className="flex flex-col gap-1.5">
          {plan.map((d) => (
            <li key={d.weekday} className="flex flex-col gap-1 rounded-2xl bg-card-soft p-2">
              <span className="font-bold">{WEEKDAYS[d.weekday - 1].label}</span>
              {PARTS.map((part) => (
                <div key={part} className="flex items-center gap-1.5">
                  <span className="w-12 shrink-0 text-sm font-bold text-ink-light">{part === "drop" ? "Lever" : "Henter"}</span>
                  <PeoplePicker people={people} value={d[part].by} onChange={(by) => updatePlan(d.weekday, part, { by })} />
                  <TimeInput value={d[part].time} onChange={(time) => updatePlan(d.weekday, part, { time })} />
                </div>
              ))}
            </li>
          ))}
        </ul>
        <button type="button" className={`${buttonGhost} self-start`} onClick={copyMonday}>
          Bruk mandag på alle dagene
        </button>
      </div>

      {/* Unntak */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold">Unntak</h3>
          <button type="button" className={buttonSecondary} onClick={() => setEditing("new")}>
            <Plus size={18} aria-hidden /> Nytt unntak
          </button>
        </div>
        <p className="-mt-1 text-sm text-ink-light">For én eller flere dager, f.eks. «Marius henter hele uke 44» eller «Høstferie».</p>
        {upcoming.length === 0 ? (
          <p className="text-sm text-ink-light">Ingen unntak framover.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {upcoming.map((o) => (
              <li key={o.id} className="flex items-start gap-2 rounded-2xl bg-sun/30 p-2 ring-1 ring-sun">
                <div className="min-w-0 flex-1">
                  <p className="font-bold wrap-break-word">
                    {periodText(o.from, o.to)}
                    {o.note && <span className="font-semibold text-ink-light"> · {o.note}</span>}
                  </p>
                  {PARTS.map((part) => (
                    <p key={part} className="flex flex-wrap items-center gap-1 text-sm">
                      <span className="font-bold text-ink-light">{PART_LABEL[part].noun}:</span>
                      <ChangeText change={o[part]} people={people} />
                    </p>
                  ))}
                </div>
                <button
                  type="button"
                  aria-label="Endre unntaket"
                  onClick={() => setEditing(o)}
                  className="flex min-h-12 min-w-10 items-center justify-center rounded-2xl text-ink-light hover:bg-card"
                >
                  <Pencil size={18} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Slett unntaket"
                  onClick={() => void remove(o)}
                  className="flex min-h-12 min-w-10 items-center justify-center rounded-2xl text-ink-light hover:bg-card"
                >
                  <Trash2 size={18} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {message && <p className="text-sm font-semibold text-ink-light">{message}</p>}
      </div>

      {/* Neste dager, slik det faktisk blir */}
      <div className="flex flex-col gap-2">
        <h3 className="font-bold">Neste dager</h3>
        <ul className="flex flex-col gap-1">
          {nextWeekdays(today, 10).map((date) => {
            const day = careFor(care, memberId, date);
            // Markert når et unntak gjelder dagen (også «ingen levering/henting»).
            const changed = overrides.some((o) => date >= o.from && date <= o.to);
            return (
              <li key={date} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-xl px-2 py-1 text-sm ${changed ? "bg-sun/30" : "bg-card-soft"}`}>
                <span className="w-24 font-bold first-letter:uppercase">{DateTime.fromISO(date).setLocale("nb").toFormat("ccc d. LLL")}</span>
                {PARTS.map((part) => (
                  <SlotText key={part} part={part} slot={day?.[part] ?? null} people={people} />
                ))}
              </li>
            );
          })}
        </ul>
      </div>

      {editing && (
        <OverrideSheet
          memberId={memberId}
          people={people}
          initial={editing === "new" ? null : editing}
          today={today}
          onClose={() => setEditing(null)}
          onSaved={(o) => {
            setOverrides((list) => [...list.filter((x) => x.id !== o.id), o]);
            setEditing(null);
          }}
        />
      )}
      {undoNode}
    </section>
  );
}

// --- Unntak-skjema ---------------------------------------------------------------------

type Mode = "same" | "none" | "person";

function modeOf(change: SlotChange): Mode {
  if (change === null) return "same";
  return change.by || change.time ? "person" : "none";
}

function OverrideSheet({
  memberId,
  people,
  initial,
  today,
  onClose,
  onSaved,
}: {
  memberId: string;
  people: Person[];
  initial: CareOverride | null;
  today: string;
  onClose: () => void;
  onSaved: (o: CareOverride) => void;
}) {
  const [from, setFrom] = useState(initial?.from ?? today);
  const [to, setTo] = useState(initial?.to ?? today);
  const [note, setNote] = useState(initial?.note ?? "");
  const [parts, setParts] = useState<Record<CarePart, { mode: Mode; slot: Slot }>>({
    drop: { mode: modeOf(initial?.drop ?? null), slot: initial?.drop ?? EMPTY },
    pick: { mode: modeOf(initial?.pick ?? null), slot: initial?.pick ?? EMPTY },
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const changeOf = (part: CarePart): SlotChange => {
    const p = parts[part];
    return p.mode === "same" ? null : p.mode === "none" ? EMPTY : p.slot;
  };

  function submit() {
    setError(null);
    start(async () => {
      const res = await saveCareOverride({
        id: initial?.id ?? null,
        memberId,
        from,
        to,
        note: note.trim() || null,
        drop: changeOf("drop"),
        pick: changeOf("pick"),
      });
      if (res.ok && res.override) onSaved(res.override);
      else setError(res.message ?? "Kunne ikke lagre");
    });
  }

  return (
    <Sheet
      title={initial ? "Endre unntak" : "Nytt unntak"}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button type="button" className={buttonGhost} onClick={onClose}>
            Avbryt
          </button>
          <button type="submit" className={buttonPrimary} disabled={pending}>
            {pending ? "Lagrer …" : "Lagre"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className={label}>Fra og med</span>
            <input
              type="date"
              className={input}
              value={from}
              required
              onChange={(e) => {
                setFrom(e.target.value);
                if (e.target.value > to) setTo(e.target.value);
              }}
            />
          </label>
          <label>
            <span className={label}>Til og med</span>
            <input type="date" className={input} value={to} min={from} required onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <label>
          <span className={label}>Notat (valgfritt)</span>
          <input type="text" className={input} value={note} maxLength={200} placeholder="F.eks. høstferie" onChange={(e) => setNote(e.target.value)} />
        </label>

        {PARTS.map((part) => {
          const p = parts[part];
          const set = (patch: Partial<{ mode: Mode; slot: Slot }>) => setParts((all) => ({ ...all, [part]: { ...all[part], ...patch } }));
          return (
            <fieldset key={part} className="flex flex-col gap-2 rounded-2xl bg-card-soft p-3">
              <legend className="sr-only">{PART_LABEL[part].noun}</legend>
              <span className="font-bold">{PART_LABEL[part].noun}</span>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["same", "Som vanlig"],
                    ["person", part === "drop" ? "Annen som leverer" : "Annen som henter"],
                    ["none", part === "drop" ? "Ingen levering" : "Ingen henting"],
                  ] as const
                ).map(([mode, text]) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={p.mode === mode}
                    onClick={() => set({ mode })}
                    className={`min-h-12 rounded-2xl border-2 px-3 text-sm font-bold ${p.mode === mode ? "border-primary bg-card" : "border-transparent text-ink-light"}`}
                  >
                    {text}
                  </button>
                ))}
              </div>
              {p.mode === "person" && (
                <div className="flex flex-wrap items-center gap-2">
                  <PeoplePicker people={people} value={p.slot.by} onChange={(by) => set({ slot: { ...p.slot, by } })} showNames />
                  <TimeInput value={p.slot.time} onChange={(time) => set({ slot: { ...p.slot, time } })} />
                </div>
              )}
            </fieldset>
          );
        })}
        {error && <p className="font-semibold text-danger">{error}</p>}
      </div>
    </Sheet>
  );
}

// --- Små byggeklosser -------------------------------------------------------------------

function ChangeText({ change, people }: { change: SlotChange; people: Person[] }) {
  if (change === null) return <span className="text-ink-light">som vanlig</span>;
  if (!change.by && !change.time) return <span className="font-semibold">ingen</span>;
  const who = people.find((p) => p.id === change.by);
  return (
    <span className="inline-flex items-center gap-1 font-semibold">
      {who && <Avatar name={who.name} color={who.color} icon={who.icon} url={who.avatarUrl} size={18} ring={false} />}
      {who?.name ?? "ingen satt opp"}
      {change.time && <span className="tabular-nums">{change.time}</span>}
    </span>
  );
}

function SlotText({ part, slot, people }: { part: CarePart; slot: CareSlot | null; people: Person[] }) {
  const who = people.find((p) => p.id === slot?.by);
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-ink-light">{PART_LABEL[part].short}</span>
      {slot ? (
        <>
          {slot.time && <span className="font-bold tabular-nums">{slot.time}</span>}
          {who ? (
            <Avatar name={who.name} color={who.color} icon={who.icon} url={who.avatarUrl} size={18} ring={false} />
          ) : (
            <span className="font-semibold text-danger">?</span>
          )}
        </>
      ) : (
        <span className="text-ink-light">–</span>
      )}
    </span>
  );
}

function PeoplePicker({
  people,
  value,
  onChange,
  showNames = false,
}: {
  people: Person[];
  value: string | null;
  onChange: (id: string | null) => void;
  showNames?: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-0.5 sm:gap-1" role="radiogroup" aria-label="Hvem">
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
            <span className={`text-sm font-semibold ${showNames ? "" : "hidden sm:inline"}`}>{p.name}</span>
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
