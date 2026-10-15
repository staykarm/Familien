"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight, Plus, Users } from "lucide-react";
import { listEvents, moveEvent } from "@/actions/events";
import { listTasksDue } from "@/actions/tasks";
import { getWeather, type WeatherData } from "@/actions/weather";
import { formatTemp, WeatherIcon, YrCredit } from "@/components/weather/WeatherBadge";
import { WeatherDialog } from "@/components/weather/WeatherDialog";
import { symbolLabel } from "@/lib/weather/symbols";
import type { DailyWeather } from "@/lib/weather/yr";
import { hourlyForDate } from "@/lib/weather/hourly";
import { TaskDialog, draftFromTask, type TaskDraft } from "@/components/tasks/TaskDialog";
import { Avatar } from "@/components/ui/Avatar";
import { useRealtimeRefresh } from "@/components/useRealtimeRefresh";
import { CALENDAR_TOPIC } from "@/lib/realtimeTopics";
import { buttonPrimary } from "@/components/ui/styles";
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
import type { CarePlanDay } from "@/lib/care/plan";
import { isTaskItemId, TASK_PREFIX, taskToCalendarItem } from "@/lib/tasks/calendar";
import type { Task } from "@/lib/tasks/types";
import { TIME_ZONE } from "@/lib/time";
import { useUndo } from "@/components/ui/UndoToast";
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

/** Blaknapper: 40px høye på telefon, 48px fra sm. */
const NAV_BASE =
  "flex h-10 shrink-0 items-center justify-center rounded-2xl border-2 border-line bg-card text-ink transition hover:bg-card-soft active:scale-95 sm:h-12";
const NAV_BTN = `${NAV_BASE} w-10 sm:w-12`;

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
  taskCategories: CalendarCategory[];
  activeMemberId: string | null;
  /** Levering og henting på hverdager (vises i «Per person»). */
  carePlans?: CarePlanDay[];
}

export function CalendarApp({ members, categories, taskCategories, activeMemberId, carePlans = [] }: Props) {
  const [view, setView] = useState<CalendarViewKind>("week");
  const [perPerson, setPerPerson] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [date, setDate] = useState(() => osloToday());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherDate, setWeatherDate] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { offer: offerUndo, node: undoNode } = useUndo((m) => setToast(m ?? null));
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

  const today = osloToday();
  // I inneværende uke starter ukevisningen i dag (se weekStart).
  const range = useMemo(() => visibleRange(view, date, today), [view, date, today]);
  const rangeKey = `${range.start.toISO()}|${range.end.toISO()}`;

  // «Laster» er avledet: dataene som vises hører til en annen periode enn den som er valgt.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== rangeKey;

  const reload = useCallback(() => {
    const id = ++requestId.current;
    const key = rangeKey;
    void Promise.all([
      listEvents({ start: range.start.toUTC().toISO()!, end: range.end.toUTC().toISO()! }),
      listTasksDue({ from: range.days[0], to: range.days[range.days.length - 1] }),
    ]).then(([eventResult, taskResult]) => {
      // Ignorer svar på eldre forespørsler hvis brukeren har bladd videre.
      if (id !== requestId.current) return;
      setEvents(eventResult);
      setTasks(taskResult);
      setLoadedKey(key);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rangeKey dekker range
  }, [rangeKey]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Endringer fra Outlook eller andre skjermer.
  useRealtimeRefresh(CALENDAR_TOPIC, reload);

  // Værvarselet hentes én gang; serveren bufrer det etter MET sine regler.
  useEffect(() => {
    void getWeather()
      .then(setWeather)
      .catch(() => setWeather(null));
  }, []);

  const weatherByDate = useMemo(() => {
    const map: Record<string, DailyWeather> = {};
    for (const d of weather?.forecast?.daily ?? []) map[d.date] = d;
    return map;
  }, [weather]);
  const hourlyToday = useMemo(() => hourlyForDate(weather?.forecast?.hourly ?? [], date), [weather, date]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const visibleMembers = members.filter((m) => !hidden.includes(m.id));
  const fellesId = members.find((m) => m.isShared)?.id ?? null;
  const visibleEvents = useMemo(() => {
    const taskItems = tasks.map((t) => taskToCalendarItem(t, fellesId)).filter((t): t is CalendarEvent => t !== null);
    return [...events, ...taskItems].filter((e) => e.participantIds.some((id) => !hidden.includes(id)));
  }, [events, tasks, hidden, fellesId]);

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
    if (isTaskItemId(id)) {
      const task = tasks.find((t) => t.id === id.slice(TASK_PREFIX.length));
      if (task) setTaskDraft(draftFromTask(task));
      return;
    }
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
      recurrence: e.recurrence ?? null,
      seriesId: e.seriesId ?? null,
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

  const showPersonView = perPerson && view !== "month";

  return (
    <div className="flex flex-col gap-4">
      {/* Verktøylinje: to kompakte rader på telefon, én rad på store skjermer */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button className={NAV_BTN} onClick={() => setDate(shiftDate(view, date, -1))} aria-label="Forrige">
              <ChevronLeft size={22} aria-hidden />
            </button>
            <button className={`${NAV_BASE} px-3 font-bold`} onClick={() => setDate(today)}>
              I dag
            </button>
            <button className={NAV_BTN} onClick={() => setDate(shiftDate(view, date, 1))} aria-label="Neste">
              <ChevronRight size={22} aria-hidden />
            </button>
          </div>
          <h2 className="ml-1 min-w-0 flex-1 wrap-break-word font-display text-lg font-bold first-letter:uppercase sm:text-2xl">
            {viewTitle(view, date, today)}
            {loading && <span className="ml-2 inline-block h-2.5 w-2.5 animate-ping rounded-full bg-primary align-middle" aria-label="Laster" />}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-1 rounded-2xl bg-card-soft p-1 sm:flex-none" role="tablist" aria-label="Visning">
            {VIEWS.map((v) => (
              <button
                key={v.value}
                role="tab"
                aria-selected={view === v.value}
                onClick={() => {
                  setView(v.value);
                  updatePrefs({ view: v.value });
                }}
                className={`min-h-10 flex-1 rounded-xl px-3 font-bold transition sm:min-h-11 sm:px-4 ${
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
              aria-label="Per person"
              title="Per person"
              onClick={() => {
                setPerPerson(!perPerson);
                updatePrefs({ perPerson: !perPerson });
              }}
              className={`inline-flex h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-2xl px-3 font-bold transition sm:px-4 ${
                perPerson ? "bg-primary text-white" : "bg-card-soft text-ink"
              }`}
            >
              <Users size={20} aria-hidden /> <span className="hidden sm:inline">Per person</span>
            </button>
          )}
          <button className={`${buttonPrimary} h-12 shrink-0 px-3 sm:px-5`} onClick={() => setDraft(newDraft({}))} aria-label="Ny aktivitet">
            <Plus size={22} aria-hidden /> <span className="hidden sm:inline">Ny</span>
          </button>
        </div>
      </div>

      {/* Hvem vises */}
      <div className="chip-row" aria-label="Vis familiemedlemmer">
        {members.map((m) => {
          const on = !hidden.includes(m.id);
          return (
            <button
              key={m.id}
              aria-pressed={on}
              onClick={() => toggleMember(m.id)}
              className={`flex min-h-10 items-center gap-1.5 rounded-full border-2 py-0.5 pl-0.5 pr-3 text-sm font-bold transition sm:min-h-12 sm:gap-2 sm:pr-4 ${
                on ? "" : "opacity-45 grayscale"
              }`}
              style={{ borderColor: on ? m.color : "var(--color-line)", background: on ? `${m.color}1f` : "transparent" }}
            >
              <Avatar name={m.name} color={m.color} icon={m.icon} url={m.avatarUrl} size={30} ring={false} />
              {m.name}
            </button>
          );
        })}
      </div>

      {view === "day" && weatherByDate[date] && (
        <DayWeatherStrip day={weatherByDate[date]} onOpen={() => setWeatherDate(date)} />
      )}

      {showPersonView && view === "day" ? (
        <PersonDayView
          date={date}
          events={visibleEvents}
          members={visibleMembers}
          categories={categories}
          onOpen={openExisting}
          hourly={hourlyToday}
          carePlans={carePlans}
          onCreateAt={(memberId, hour, minute) =>
            setDraft(
              newDraft({
                participantIds: [memberId],
                startTime: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
                durationMinutes: 60,
              })
            )
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
          weather={weatherByDate}
          onWeather={setWeatherDate}
          carePlans={carePlans}
        />
      ) : (
        <div className="rounded-3xl bg-card p-2 shadow-[0_2px_12px_rgba(120,90,60,0.08)] sm:p-4">
          <FullCalendarView
            view={view}
            date={view === "week" ? range.days[0] : date}
            events={visibleEvents}
            members={members}
            categories={categories}
            onCreate={openNewFromRange}
            onOpen={openExisting}
            onMove={handleMove}
            onDayClick={goToDay}
            weather={weatherByDate}
            onWeather={setWeatherDate}
            hourly={hourlyToday}
          />
        </div>
      )}

      {!loading && visibleEvents.length === 0 && (
        <p className="text-center text-ink-light">
          Ingenting planlagt her ennå. Trykk på et tidspunkt i kalenderen, eller på <strong>+</strong>, for å legge til.
        </p>
      )}

      {draft && (
        <EventDialog
          key={draft.id ?? "ny"}
          draft={draft}
          sync={draft.id ? events.find((e) => e.id === draft.id) : undefined}
          members={members}
          categories={categories}
          onClose={() => setDraft(null)}
          onSaved={(message, _id, undo) => {
            setDraft(null);
            if (undo) {
              setToast(null);
              offerUndo({ text: message, run: async () => {
                const res = await undo();
                reload();
                return res;
              } });
            } else setToast(message);
            reload();
          }}
        />
      )}

      {weather?.forecast && <YrCredit />}

      {weatherDate && weatherByDate[weatherDate] && (
        <WeatherDialog
          day={weatherByDate[weatherDate]}
          hours={(weather?.forecast?.hourly ?? []).filter((h) => h.date === weatherDate)}
          locationLabel={weather?.location.label ?? ""}
          onClose={() => setWeatherDate(null)}
        />
      )}

      {taskDraft && (
        <TaskDialog
          key={taskDraft.id ?? "ny"}
          draft={taskDraft}
          members={members}
          categories={taskCategories}
          onClose={() => setTaskDraft(null)}
          onSaved={(message) => {
            setTaskDraft(null);
            setToast(message);
            reload();
          }}
        />
      )}

      {undoNode}
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

/** Dagens vær over dagsvisningen. Trykk for time-for-time. */
function DayWeatherStrip({ day, onOpen }: { day: DailyWeather; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex min-h-14 items-center gap-3 rounded-3xl bg-sky/50 px-4 py-2 text-left transition hover:bg-sky"
    >
      <WeatherIcon code={day.symbolCode} size={44} />
      <span className="flex flex-col leading-tight">
        <span className="font-display text-lg font-bold">
          {formatTemp(day.tempMax)} <span className="text-base text-ink-light">/ {formatTemp(day.tempMin)}</span>
        </span>
        <span className="text-sm text-ink-light">
          {symbolLabel(day.symbolCode) ?? ""}
          {day.precipitationMm ? ` · ${day.precipitationMm} mm` : ""}
        </span>
      </span>
      <span className="ml-auto text-sm font-bold text-primary-dark">Time for time ›</span>
    </button>
  );
}
