"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight, Plus, Users } from "lucide-react";
import { listEvents, moveEvent } from "@/actions/events";
import { Avatar } from "@/components/ui/Avatar";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";
import {
  allDayLastDay,
  minutesBetween,
  osloToday,
  shiftDate,
  utcToOsloParts,
  viewTitle,
  visibleRange,
  type CalendarViewKind,
} from "@/lib/calendar/dates";
import type { CalendarCategory, CalendarEvent, CalendarMember } from "@/lib/calendar/types";
import { TIME_ZONE } from "@/lib/time";
import { EventDialog, type EventDraft } from "./EventDialog";
import { PersonDayView } from "./PersonDayView";
import { PersonWeekView } from "./PersonWeekView";

// FullCalendar måler DOM-en, så den rendres bare i nettleseren.
const FullCalendarView = dynamic(() => import("./FullCalendarView").then((m) => m.FullCalendarView), {
  ssr: false,
  loading: () => <div className="h-96 animate-pulse rounded-3xl bg-card" />,
});

const VIEWS: { value: CalendarViewKind; label: string }[] = [
  { value: "day", label: "Dag" },
  { value: "week", label: "Uke" },
  { value: "month", label: "Måned" },
];

const PREFS_KEY = "familien.kalender";

interface Prefs {
  view?: CalendarViewKind;
  perPerson?: boolean;
  hidden?: string[];
}

function readPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Prefs;
  } catch {
    return {};
  }
}

function writePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Privat modus o.l. – innstillingen huskes bare ikke.
  }
}

interface Props {
  members: CalendarMember[];
  categories: CalendarCategory[];
  activeMemberId: string | null;
}

export function CalendarApp({ members, categories, activeMemberId }: Props) {
  const [view, setView] = useState<CalendarViewKind>("week");
  const [perPerson, setPerPerson] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [date, setDate] = useState(() => osloToday());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const requestId = useRef(0);

  // Husk visning per enhet. Første gang: dagsvisning på mobil, uke ellers.
  useEffect(() => {
    const prefs = readPrefs();
    const isSmall = window.matchMedia("(max-width: 767px)").matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- engangs-lesing av lagrede valg etter hydrering
    setView(prefs.view ?? (isSmall ? "day" : "week"));
    setPerPerson(prefs.perPerson ?? false);
    setHidden(prefs.hidden ?? []);
  }, []);

  const updatePrefs = (patch: Prefs) => writePrefs({ view, perPerson, hidden, ...patch });

  const range = useMemo(() => visibleRange(view, date), [view, date]);
  const rangeKey = `${range.start.toISO()}|${range.end.toISO()}`;

  // «Laster» er avledet: dataene som vises hører til en annen periode enn den som er valgt.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== rangeKey;

  const reload = useCallback(() => {
    const id = ++requestId.current;
    const key = rangeKey;
    void listEvents({ start: range.start.toUTC().toISO()!, end: range.end.toUTC().toISO()! }).then((result) => {
      // Ignorer svar på eldre forespørsler hvis brukeren har bladd videre.
      if (id !== requestId.current) return;
      setEvents(result);
      setLoadedKey(key);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rangeKey dekker range
  }, [rangeKey]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const visibleMembers = members.filter((m) => !hidden.includes(m.id));
  const visibleEvents = useMemo(
    () => events.filter((e) => e.participantIds.some((id) => !hidden.includes(id))),
    [events, hidden]
  );

  // --- Åpne dialog -------------------------------------------------------------------

  const defaultParticipants = (memberId?: string) =>
    memberId ? [memberId] : activeMemberId ? [activeMemberId] : [];

  function newDraft(partial: Partial<EventDraft>): EventDraft {
    const base: EventDraft = {
      id: null,
      title: "",
      participantIds: defaultParticipants(),
      categoryId: null,
      allDay: false,
      date,
      startTime: DateTime.now().setZone(TIME_ZONE).plus({ hours: 1 }).startOf("hour").toFormat("HH:mm"),
      durationMinutes: 60,
      endDate: date,
      location: "",
      notes: "",
    };
    const merged = { ...base, ...partial };
    return { ...merged, endDate: partial.endDate ?? merged.date };
  }

  function openNewFromRange(start: Date, end: Date, allDay: boolean) {
    const s = utcToOsloParts(start.toISOString());
    if (allDay) {
      setDraft(newDraft({ allDay: true, date: s.date, endDate: allDayLastDay(end.toISOString()) }));
    } else {
      const minutes = minutesBetween(start.toISOString(), end.toISOString());
      setDraft(newDraft({ date: s.date, startTime: s.time, durationMinutes: minutes <= 30 ? 60 : minutes }));
    }
  }

  function openExisting(id: string) {
    const e = events.find((x) => x.id === id);
    if (!e) return;
    const s = utcToOsloParts(e.start);
    setDraft({
      id: e.id,
      title: e.title,
      participantIds: e.participantIds,
      categoryId: e.categoryId,
      allDay: e.allDay,
      date: s.date,
      startTime: e.allDay ? "09:00" : s.time,
      durationMinutes: e.allDay ? 60 : Math.max(5, minutesBetween(e.start, e.end)),
      endDate: e.allDay ? allDayLastDay(e.end) : s.date,
      location: e.location ?? "",
      notes: e.notes ?? "",
    });
  }

  async function handleMove(id: string, start: Date, end: Date, allDay: boolean, revert: () => void) {
    // FullCalendar gir ingen slutt når en aktivitet dras mellom heldag og klokkeslett.
    let endDate = end;
    if (end.getTime() === start.getTime()) {
      endDate = new Date(start.getTime() + (allDay ? 24 : 1) * 60 * 60 * 1000);
    }
    const res = await moveEvent({ id, start: start.toISOString(), end: endDate.toISOString(), allDay });
    if (!res.ok) {
      revert();
      setToast(res.message ?? "Kunne ikke flytte");
      return;
    }
    reload();
  }

  function goToDay(d: string) {
    setDate(d);
    setView("day");
    updatePrefs({ view: "day" });
  }

  function toggleMember(id: string) {
    const next = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
    if (next.length === members.length) return; // minst én må vises
    setHidden(next);
    updatePrefs({ hidden: next });
  }

  const today = osloToday();
  const showPersonView = perPerson && view !== "month";

  return (
    <div className="flex flex-col gap-4">
      {/* Verktøylinje */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <button className={`${buttonSecondary} shrink-0 px-3`} onClick={() => setDate(shiftDate(view, date, -1))} aria-label="Forrige">
            <ChevronLeft size={24} aria-hidden />
          </button>
          <button className={`${buttonSecondary} shrink-0 whitespace-nowrap px-4`} onClick={() => setDate(today)}>
            I dag
          </button>
          <button className={`${buttonSecondary} shrink-0 px-3`} onClick={() => setDate(shiftDate(view, date, 1))} aria-label="Neste">
            <ChevronRight size={24} aria-hidden />
          </button>
          <h2 className="ml-1 min-w-0 font-display text-xl font-bold leading-tight first-letter:uppercase sm:text-2xl">{viewTitle(view, date)}</h2>
          {loading && <span className="h-3 w-3 animate-ping rounded-full bg-primary" aria-label="Laster" />}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-2xl bg-card-soft p-1" role="tablist" aria-label="Visning">
            {VIEWS.map((v) => (
              <button
                key={v.value}
                role="tab"
                aria-selected={view === v.value}
                onClick={() => {
                  setView(v.value);
                  updatePrefs({ view: v.value });
                }}
                className={`min-h-11 rounded-xl px-4 font-bold transition ${
                  view === v.value ? "bg-card text-primary-dark shadow-sm" : "text-ink-light"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          {view !== "month" && (
            <button
              aria-pressed={perPerson}
              onClick={() => {
                setPerPerson(!perPerson);
                updatePrefs({ perPerson: !perPerson });
              }}
              className={`inline-flex min-h-12 items-center gap-2 rounded-2xl px-4 font-bold transition ${
                perPerson ? "bg-primary text-white" : "bg-card-soft text-ink"
              }`}
            >
              <Users size={20} aria-hidden /> Per person
            </button>
          )}
          <button className={buttonPrimary} onClick={() => setDraft(newDraft({}))}>
            <Plus size={22} aria-hidden /> Ny
          </button>
        </div>
      </div>

      {/* Hvem vises */}
      <div className="flex flex-wrap gap-2" aria-label="Vis familiemedlemmer">
        {members.map((m) => {
          const on = !hidden.includes(m.id);
          return (
            <button
              key={m.id}
              aria-pressed={on}
              onClick={() => toggleMember(m.id)}
              className={`flex min-h-12 items-center gap-2 rounded-full border-2 py-1 pl-1 pr-4 text-sm font-bold transition ${
                on ? "" : "opacity-45 grayscale"
              }`}
              style={{ borderColor: on ? m.color : "var(--color-line)", background: on ? `${m.color}1f` : "transparent" }}
            >
              <Avatar name={m.name} color={m.color} icon={m.icon} url={m.avatarUrl} size={32} ring={false} />
              {m.name}
            </button>
          );
        })}
      </div>

      {showPersonView && view === "day" ? (
        <PersonDayView
          date={date}
          events={visibleEvents}
          members={visibleMembers}
          categories={categories}
          onOpen={openExisting}
          onCreateAt={(memberId, hour) =>
            setDraft(newDraft({ participantIds: [memberId], startTime: `${String(hour).padStart(2, "0")}:00` }))
          }
        />
      ) : showPersonView && view === "week" ? (
        <PersonWeekView
          days={range.days}
          today={today}
          events={visibleEvents}
          members={visibleMembers}
          categories={categories}
          onOpen={openExisting}
          onDayClick={goToDay}
          onCreateOn={(memberId, d) => setDraft(newDraft({ participantIds: [memberId], date: d }))}
        />
      ) : (
        <div className="rounded-3xl bg-card p-2 shadow-[0_2px_12px_rgba(120,90,60,0.08)] sm:p-4">
          <FullCalendarView
            view={view}
            date={date}
            events={visibleEvents}
            members={members}
            categories={categories}
            onCreate={openNewFromRange}
            onOpen={openExisting}
            onMove={handleMove}
            onDayClick={goToDay}
          />
        </div>
      )}

      {!loading && visibleEvents.length === 0 && (
        <p className="text-center text-ink-light">
          Ingenting planlagt her ennå. Trykk på <strong>Ny</strong> eller i kalenderen for å legge til.
        </p>
      )}

      {draft && (
        <EventDialog
          key={draft.id ?? "ny"}
          draft={draft}
          members={members}
          categories={categories}
          onClose={() => setDraft(null)}
          onSaved={(message) => {
            setDraft(null);
            setToast(message);
            reload();
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit rounded-full bg-ink px-5 py-3 font-bold text-white shadow-lg md:bottom-8"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
