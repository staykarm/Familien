"use client";

import { useMemo, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { Clock, MapPin, StickyNote } from "lucide-react";
import { deleteEvent, saveEvent } from "@/actions/events";
import { Avatar } from "@/components/ui/Avatar";
import { DeleteButton, Sheet } from "@/components/ui/Sheet";
import { buttonPrimary, input, label } from "@/components/ui/styles";
import { formatDuration } from "@/lib/calendar/dates";
import type { CalendarCategory, CalendarMember } from "@/lib/calendar/types";

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
}

const DURATIONS = [30, 45, 60, 90, 120, 180];

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
  members: CalendarMember[];
  categories: CalendarCategory[];
  onClose: () => void;
  /** id er satt når en aktivitet ble lagret (ikke ved sletting). */
  onSaved: (message: string, id?: string) => void;
}

export function EventDialog({ draft: initial, members, categories, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<EventDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const isNew = draft.id === null;

  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const endTime = useMemo(() => endTimeOf(draft.startTime, draft.durationMinutes), [draft.startTime, draft.durationMinutes]);

  function toggleParticipant(id: string) {
    set(
      "participantIds",
      draft.participantIds.includes(id) ? draft.participantIds.filter((p) => p !== id) : [...draft.participantIds, id]
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await saveEvent({
        ...draft,
        endDate: draft.allDay ? draft.endDate : draft.date,
      });
      if (res.ok) onSaved(res.message ?? "Lagret", res.id);
      else setError(res.message ?? "Noe gikk galt");
    });
  }

  function remove() {
    if (!draft.id) return;
    const id = draft.id;
    startTransition(async () => {
      const res = await deleteEvent(id);
      if (res.ok) onSaved(res.message ?? "Slettet");
      else setError(res.message ?? "Noe gikk galt");
    });
  }

  return (
    <Sheet
      title={isNew ? "Ny aktivitet" : "Endre aktivitet"}
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
        <label htmlFor="ev-title" className={label}>
          Hva skal skje?
        </label>
        <input
          id="ev-title"
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
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
                setDraft((d) => ({ ...d, date, endDate: d.endDate < date ? date : d.endDate }));
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
