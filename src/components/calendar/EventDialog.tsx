"use client";

import { useMemo, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { Clock, MapPin, Repeat, StickyNote } from "lucide-react";
import { deleteEvent, saveEvent } from "@/actions/events";
import { resolveOutlookConflict } from "@/actions/outlook";
import { Avatar } from "@/components/ui/Avatar";
import { DeleteButton, Sheet } from "@/components/ui/Sheet";
import { buttonGhost, buttonPrimary, buttonSecondary, input, label } from "@/components/ui/styles";
import { formatDuration, osloDate } from "@/lib/calendar/dates";
import { membersInTitle } from "@/lib/calendar/names";
import { describeRule, occurrenceDates, sameRule, untilChristmas, untilSummer, WEEKDAYS, type RecurrenceRule } from "@/lib/calendar/recurrence";
import type { CalendarCategory, CalendarEvent, CalendarMember } from "@/lib/calendar/types";
import { TIME_ZONE } from "@/lib/time";

export interface EventDraft {
  id: string | null;
  title: string;
  participantIds: string[];
  categoryId: string | null;
  allDay: boolean;
  date: string;
  startTime: string;
  durationMinutes: number;
  endDate: string;
  location: string;
  notes: string;
  /** Gjentakelsen hvis aktiviteten er (eller skal bli) en serie. */
  recurrence?: RecurrenceRule | null;
  seriesId?: string | null;
}

const DURATIONS = [30, 45, 60, 90, 120, 180];

type RepeatKind = "none" | "daily" | "weekly" | "biweekly" | "monthly";
const REPEATS: { kind: RepeatKind; label: string }[] = [
  { kind: "none", label: "Aldri" },
  { kind: "daily", label: "Hver dag" },
  { kind: "weekly", label: "Hver uke" },
  { kind: "biweekly", label: "Annenhver uke" },
  { kind: "monthly", label: "Hver måned" },
];

function repeatKind(r: RecurrenceRule | null | undefined): RepeatKind {
  if (!r) return "none";
  if (r.freq === "weekly") return r.interval === 2 ? "biweekly" : "weekly";
  return r.freq;
}

/** Standard sluttdato: frem til jul, eller til sommeren hvis jula er like om hjørnet. */
function defaultUntil(date: string): string {
  const xmas = untilChristmas(date);
  return osloDate(xmas).diff(osloDate(date), "days").days >= 14 ? xmas : untilSummer(date);
}

const chip = (on: boolean) =>
  `min-h-11 rounded-full px-3 text-sm font-bold transition active:scale-95 ${on ? "bg-primary text-white" : "bg-card text-ink"}`;

function formatWhen(c: { start: string; end: string; allDay: boolean }): string {
  const s = DateTime.fromISO(c.start).setZone(TIME_ZONE).setLocale("nb");
  if (c.allDay) return s.toFormat("cccc d. LLL") + " (hele dagen)";
  const e = DateTime.fromISO(c.end).setZone(TIME_ZONE);
  return `${s.toFormat("cccc d. LLL 'kl.' HH:mm")}–${e.toFormat("HH:mm")}`;
}

function endTimeOf(startTime: string, minutes: number): string {
  return DateTime.fromFormat(startTime, "HH:mm").plus({ minutes }).toFormat("HH:mm");
}

/** Minutter fra start til slutt-klokkeslett. Slutt før start betyr neste dag. */
function minutesUntil(startTime: string, endTime: string): number {
  const s = DateTime.fromFormat(startTime, "HH:mm");
  let e = DateTime.fromFormat(endTime, "HH:mm");
  if (e <= s) e = e.plus({ days: 1 });
  return Math.round(e.diff(s, "minutes").minutes);
}

interface Props {
  draft: EventDraft;
  /** Aktiviteten slik den er lagret, for synkstatus mot Outlook. */
  sync?: Pick<CalendarEvent, "syncStatus" | "syncError" | "conflict" | "origin">;
  members: CalendarMember[];
  categories: CalendarCategory[];
  onClose: () => void;
  /** id er satt når en aktivitet ble lagret (ikke ved sletting). */
  onSaved: (message: string, id?: string) => void;
}

export function EventDialog({ draft: initial, sync, members, categories, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<EventDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [askScope, setAskScope] = useState(false);
  // Har brukeren valgt deltakere selv? Hvis ikke, følger de navn i tittelen («Trening Olav» → Olav).
  const [peopleTouched, setPeopleTouched] = useState(false);
  const [pending, startTransition] = useTransition();
  const isNew = draft.id === null;
  const inSeries = !!draft.seriesId;
  const repeat = draft.recurrence ?? null;
  const ruleChanged = inSeries && !sameRule(repeat, initial.recurrence);
  const repeatCount = useMemo(() => (repeat ? occurrenceDates(draft.date, repeat).length : 0), [repeat, draft.date]);

  function setRepeatKind(kind: RepeatKind) {
    if (kind === "none") return set("recurrence", null);
    const freq = kind === "biweekly" ? "weekly" : kind;
    const weekdays = repeat?.weekdays.length ? repeat.weekdays : [osloDate(draft.date).weekday];
    set("recurrence", { freq, interval: kind === "biweekly" ? 2 : 1, weekdays, until: repeat?.until ?? defaultUntil(draft.date) });
  }

  function toggleWeekday(n: number) {
    if (!repeat) return;
    const has = repeat.weekdays.includes(n);
    if (has && repeat.weekdays.length === 1) return;
    set("recurrence", { ...repeat, weekdays: has ? repeat.weekdays.filter((d) => d !== n) : [...repeat.weekdays, n].sort() });
  }

  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const endTime = useMemo(() => endTimeOf(draft.startTime, draft.durationMinutes), [draft.startTime, draft.durationMinutes]);

  function changeTitle(title: string) {
    if (!isNew || peopleTouched) return set("title", title);
    const named = membersInTitle(title, members);
    setDraft((d) => ({ ...d, title, participantIds: named.length ? named : initial.participantIds }));
  }

  function toggleParticipant(id: string) {
    setPeopleTouched(true);
    set(
      "participantIds",
      draft.participantIds.includes(id) ? draft.participantIds.filter((p) => p !== id) : [...draft.participantIds, id]
    );
  }

  function submit(scope?: "one" | "following") {
    setError(null);
    // Aktivitet i en serie: spør om endringen gjelder bare denne eller også de senere.
    if (inSeries && !scope) {
      setAskScope(true);
      return;
    }
    setAskScope(false);
    startTransition(async () => {
      const res = await saveEvent({
        ...draft,
        endDate: draft.allDay ? draft.endDate : draft.date,
        recurrence: repeat,
        scope,
      });
      if (res.ok) onSaved(res.message ?? "Lagret", res.id);
      else setError(res.message ?? "Noe gikk galt");
    });
  }

  function remove(scope: "one" | "following" | "all" = "one") {
    if (!draft.id) return;
    const id = draft.id;
    startTransition(async () => {
      const res = await deleteEvent(id, scope);
      if (res.ok) onSaved(res.message ?? "Slettet");
      else setError(res.message ?? "Noe gikk galt");
    });
  }

  function resolve(keep: "mine" | "outlook") {
    if (!draft.id) return;
    const id = draft.id;
    startTransition(async () => {
      const res = await resolveOutlookConflict({ id, keep });
      if (res.ok) onSaved(res.message ?? "Løst");
      else setError(res.message ?? "Noe gikk galt");
    });
  }

  return (
    <Sheet
      title={isNew ? "Ny aktivitet" : "Endre aktivitet"}
      onClose={onClose}
      onSubmit={() => submit()}
      footer={
        askScope ? (
          <div className="flex w-full flex-col gap-2">
            <p className="font-bold">Gjelder endringen …</p>
            <div className="flex flex-wrap gap-2">
              {!ruleChanged && (
                <button type="button" className={buttonSecondary} disabled={pending} onClick={() => submit("one")}>
                  Bare denne
                </button>
              )}
              <button type="button" className={buttonPrimary} disabled={pending} onClick={() => submit("following")}>
                {pending ? "Lagrer …" : "Denne og alle senere"}
              </button>
              <button type="button" className={buttonGhost} onClick={() => setAskScope(false)}>
                Avbryt
              </button>
            </div>
          </div>
        ) : confirmDelete && inSeries ? (
          <div className="flex w-full flex-col gap-2">
            <p className="font-bold text-danger">Slette …</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonSecondary} disabled={pending} onClick={() => remove("one")}>
                Bare denne
              </button>
              <button type="button" className={buttonSecondary} disabled={pending} onClick={() => remove("following")}>
                Denne og senere
              </button>
              <button
                type="button"
                className="inline-flex min-h-12 items-center rounded-2xl border-2 border-danger px-4 font-bold text-danger"
                disabled={pending}
                onClick={() => remove("all")}
              >
                Hele serien
              </button>
              <button type="button" className={buttonGhost} onClick={() => setConfirmDelete(false)}>
                Avbryt
              </button>
            </div>
          </div>
        ) : (
          <>
            {!isNew && (
              <DeleteButton
                confirming={confirmDelete}
                onAsk={() => setConfirmDelete(true)}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={() => remove()}
                pending={pending}
                label="🗑️ Slett"
              />
            )}
            <button className={`${buttonPrimary} ml-auto`} disabled={pending}>
              {pending ? "Lagrer …" : isNew ? (repeat && repeatCount > 1 ? `Legg til ${repeatCount}` : "Legg til") : "Lagre"}
            </button>
          </>
        )
      }
    >
      {sync?.syncStatus === "conflict" && sync.conflict && (
        <div className="flex flex-col gap-2 rounded-2xl bg-sun p-3">
          <p className="font-bold">⚠️ Endret både her og i Outlook</p>
          <p className="text-sm">
            Outlook sier: <strong>{sync.conflict.title}</strong>, {formatWhen(sync.conflict)}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonSecondary} disabled={pending} onClick={() => resolve("mine")}>
              Behold min
            </button>
            <button type="button" className={buttonSecondary} disabled={pending} onClick={() => resolve("outlook")}>
              Bruk Outlook sin
            </button>
          </div>
        </div>
      )}
      {sync?.syncStatus === "error" && (
        <p className="rounded-2xl bg-primary-soft p-3 text-sm font-semibold text-danger">
          Ikke synket til Outlook: {sync.syncError ?? "ukjent feil"}. Prøves igjen automatisk.
        </p>
      )}

      <div>
        <label htmlFor="ev-title" className={label}>
          Hva skal skje?
        </label>
        <input
          id="ev-title"
          value={draft.title}
          onChange={(e) => changeTitle(e.target.value)}
          placeholder="F.eks. Fotballtrening"
          className={`${input} text-lg font-bold`}
          autoFocus={isNew}
          required
        />
      </div>

      <fieldset>
        <legend className={label}>Hvem skal være med?</legend>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => {
            const on = draft.participantIds.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleParticipant(m.id)}
                className="flex min-h-12 items-center gap-2 rounded-full border-2 py-1 pl-1 pr-4 font-bold transition active:scale-95"
                style={{
                  borderColor: on ? m.color : "var(--color-line)",
                  background: on ? `${m.color}26` : "var(--color-card)",
                }}
              >
                <Avatar name={m.name} color={m.color} icon={m.icon} url={m.avatarUrl} size={36} ring={on} />
                {m.name}
              </button>
            );
          })}
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
                style={{
                  borderColor: on ? c.color : "var(--color-line)",
                  background: on ? `${c.color}26` : "var(--color-card)",
                }}
              >
                <span aria-hidden>{c.icon}</span> {c.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 rounded-2xl bg-card-soft p-4">
        <label className="flex min-h-12 cursor-pointer items-center justify-between font-bold">
          <span>Hele dagen</span>
          <input
            type="checkbox"
            checked={draft.allDay}
            onChange={(e) => set("allDay", e.target.checked)}
            className="h-7 w-7 accent-[var(--color-primary)]"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="ev-date" className={label}>
              {draft.allDay ? "Fra dato" : "Dato"}
            </label>
            <input
              id="ev-date"
              type="date"
              value={draft.date}
              onChange={(e) => {
                const date = e.target.value;
                setDraft((d) => {
                  // Ukentlig på startdatoens ukedag: følg med når datoen flyttes.
                  let recurrence = d.recurrence ?? null;
                  if (recurrence?.freq === "weekly" && date && recurrence.weekdays.length === 1 && recurrence.weekdays[0] === osloDate(d.date).weekday) {
                    recurrence = { ...recurrence, weekdays: [osloDate(date).weekday] };
                  }
                  return { ...d, date, endDate: d.endDate < date ? date : d.endDate, recurrence };
                });
              }}
              className={input}
              required
            />
          </div>
          {draft.allDay ? (
            <div>
              <label htmlFor="ev-enddate" className={label}>
                Til og med
              </label>
              <input
                id="ev-enddate"
                type="date"
                min={draft.date}
                value={draft.endDate}
                onChange={(e) => set("endDate", e.target.value)}
                className={input}
                required
              />
            </div>
          ) : (
            <div>
              <label htmlFor="ev-start" className={label}>
                Starter kl.
              </label>
              <input
                id="ev-start"
                type="time"
                value={draft.startTime}
                onChange={(e) => set("startTime", e.target.value)}
                className={input}
                required
              />
            </div>
          )}
        </div>

        {!draft.allDay && (
          <div>
            <span className={label}>
              <Clock size={14} className="mr-1 inline" aria-hidden />
              Varighet: {formatDuration(draft.durationMinutes)} (slutter {endTime})
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {DURATIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={draft.durationMinutes === m}
                  onClick={() => set("durationMinutes", m)}
                  className={`min-h-11 rounded-full px-3 text-sm font-bold transition active:scale-95 ${
                    draft.durationMinutes === m ? "bg-primary text-white" : "bg-card text-ink"
                  }`}
                >
                  {formatDuration(m)}
                </button>
              ))}
              <label className="flex items-center gap-2 text-sm font-bold text-ink-light">
                Slutt
                <input
                  type="time"
                  aria-label="Slutter kl."
                  value={endTime}
                  onChange={(e) => e.target.value && set("durationMinutes", minutesUntil(draft.startTime, e.target.value))}
                  className={`${input} w-32`}
                />
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-card-soft p-4">
        <span className={label}>
          <Repeat size={14} className="mr-1 inline" aria-hidden />
          Gjentas
        </span>
        <div className="chip-row -mt-2">
          {REPEATS.map((r) => (
            <button key={r.kind} type="button" aria-pressed={repeatKind(repeat) === r.kind} onClick={() => setRepeatKind(r.kind)} className={chip(repeatKind(repeat) === r.kind)}>
              {r.label}
            </button>
          ))}
        </div>

        {repeat?.freq === "weekly" && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ukedager">
            {WEEKDAYS.map((w) => {
              const on = repeat.weekdays.includes(w.n);
              return (
                <button
                  key={w.n}
                  type="button"
                  aria-pressed={on}
                  aria-label={w.short}
                  onClick={() => toggleWeekday(w.n)}
                  className={`h-11 w-11 rounded-full text-sm font-bold transition active:scale-95 ${on ? "bg-primary text-white" : "bg-card text-ink"}`}
                >
                  {w.short.slice(0, 2)}
                </button>
              );
            })}
          </div>
        )}

        {repeat && (
          <div>
            <label htmlFor="ev-until" className={label}>
              Til og med
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="ev-until"
                type="date"
                min={draft.date}
                value={repeat.until}
                onChange={(e) => e.target.value && set("recurrence", { ...repeat, until: e.target.value })}
                className={`${input} w-44`}
                required
              />
              <button type="button" className={chip(repeat.until === untilChristmas(draft.date))} onClick={() => set("recurrence", { ...repeat, until: untilChristmas(draft.date) })}>
                Til jul
              </button>
              <button type="button" className={chip(repeat.until === untilSummer(draft.date))} onClick={() => set("recurrence", { ...repeat, until: untilSummer(draft.date) })}>
                Til sommeren
              </button>
            </div>
            <p className="mt-2 text-sm text-ink-light">
              {repeatCount > 0 ? (
                <>
                  {describeRule(repeat, draft.date)} · <strong>{repeatCount === 1 ? "1 gang" : `${repeatCount} ganger`}</strong>
                </>
              ) : (
                <span className="font-semibold text-danger">Ingen datoer – sjekk sluttdatoen og ukedagene</span>
              )}
            </p>
            {ruleChanged && <p className="mt-1 text-sm text-ink-light">Endrer du gjentakelsen, lages aktivitetene fra denne datoen og utover på nytt.</p>}
          </div>
        )}
      </div>

      <div>
        <label htmlFor="ev-location" className={label}>
          <MapPin size={14} className="mr-1 inline" aria-hidden />
          Sted
        </label>
        <input
          id="ev-location"
          value={draft.location}
          onChange={(e) => set("location", e.target.value)}
          placeholder="Valgfritt"
          className={input}
        />
      </div>

      <div>
        <label htmlFor="ev-notes" className={label}>
          <StickyNote size={14} className="mr-1 inline" aria-hidden />
          Notat
        </label>
        <textarea
          id="ev-notes"
          value={draft.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
          placeholder="Valgfritt – f.eks. hva som skal være med"
          className={`${input} py-3`}
        />
      </div>

      {error && <p className="rounded-2xl bg-primary-soft p-3 font-semibold text-danger">{error}</p>}
    </Sheet>
  );
}
