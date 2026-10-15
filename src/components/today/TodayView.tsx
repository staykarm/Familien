"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import { Check, ChevronRight } from "lucide-react";
import { setTaskStatus } from "@/actions/tasks";
import { CareBadge } from "@/components/care/CareBadge";
import { Avatar } from "@/components/ui/Avatar";
import { card } from "@/components/ui/styles";
import {
  formatTemp,
  HourWeather,
  WeatherIcon,
  YrCredit,
} from "@/components/weather/WeatherBadge";
import { osloDate, touchesDay } from "@/lib/calendar/dates";
import type {
  CalendarCategory,
  CalendarEvent,
  CalendarMember,
} from "@/lib/calendar/types";
import { careFor, type CareData } from "@/lib/care/plan";
import type { Task } from "@/lib/tasks/types";
import { TIME_ZONE } from "@/lib/time";
import { symbolLabel } from "@/lib/weather/symbols";
import type { Forecast } from "@/lib/weather/yr";

interface Props {
  today: string;
  tomorrow: string;
  nowHour: number;
  members: CalendarMember[];
  categories: CalendarCategory[];
  events: CalendarEvent[];
  tasks: Task[];
  shopping: string[];
  weather: Forecast | null;
  care?: CareData;
}

const hhmm = (iso: string) =>
  DateTime.fromISO(iso).setZone(TIME_ZONE).toFormat("HH:mm");

function when(e: CalendarEvent, day: string): string {
  if (e.allDay) return "Hele dagen";
  const startsToday =
    DateTime.fromISO(e.start).setZone(TIME_ZONE).toISODate() === day;
  const endsToday =
    DateTime.fromISO(e.end).setZone(TIME_ZONE).toISODate() === day;
  if (!startsToday) return `til ${hhmm(e.end)}`;
  return endsToday ? `${hhmm(e.start)}–${hhmm(e.end)}` : `fra ${hhmm(e.start)}`;
}

export function TodayView({
  today,
  tomorrow,
  nowHour,
  members,
  categories,
  events,
  tasks: initialTasks,
  shopping,
  weather,
  care = { plans: [], overrides: [] },
}: Props) {
  const [tasks, setTasks] = useState(initialTasks);
  const [toast, setToast] = useState<string | null>(null);
  const [, start] = useTransition();

  const day = weather?.daily.find((d) => d.date === today);
  const hours = (weather?.hourly ?? [])
    .filter(
      (h) => (h.date === today && h.hour >= nowHour) || h.date === tomorrow,
    )
    .slice(0, 10);

  function done(t: Task) {
    setTasks((list) => list.filter((x) => x.id !== t.id));
    start(async () => {
      const res = await setTaskStatus(t.id, "done");
      if (!res.ok) setTasks((list) => [...list, t]);
      setToast(
        res.ok
          ? (res.message ?? "Gjort")
          : (res.message ?? "Kunne ikke oppdatere"),
      );
      setTimeout(() => setToast(null), 2500);
    });
  }

  const title = osloDate(today).setLocale("nb").toFormat("cccc d. LLLL");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-xl font-bold sm:text-2xl lg:text-3xl">
          I dag
        </h1>
        <p className="font-semibold text-ink-light first-letter:uppercase">
          {title}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        {day && (
          <section
            className={`${card} flex flex-col gap-3 lg:col-span-2`}
            aria-label="Været"
          >
            <div className="flex items-center gap-3">
              <WeatherIcon code={day.symbolCode} size={44} />
              <div className="min-w-0">
                <p className="font-display text-lg font-bold">
                  {formatTemp(day.tempMax)}{" "}
                  <span className="text-base font-semibold text-ink-light">
                    / {formatTemp(day.tempMin)}
                  </span>
                </p>
                <p className="text-sm text-ink-light">
                  {[
                    day.symbolCode ? symbolLabel(day.symbolCode) : null,
                    day.precipitationMm ? `${day.precipitationMm} mm` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
            {hours.length > 0 && (
              <div className="chip-row" aria-label="Time for time">
                {hours.map((h) => (
                  <div
                    key={h.time}
                    className="flex min-w-11 flex-col items-center gap-0.5 rounded-xl bg-card-soft px-1.5 py-1"
                  >
                    <span className="text-[10px] font-bold text-ink-light">
                      {h.date === today
                        ? String(h.hour).padStart(2, "0")
                        : `i morgen ${String(h.hour).padStart(2, "0")}`}
                    </span>
                    <HourWeather hour={h} stacked />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <DaySection
          label="I dag"
          day={today}
          members={members}
          categories={categories}
          events={events}
          care={care}
        />
        <DaySection
          label="I morgen"
          day={tomorrow}
          members={members}
          categories={categories}
          events={events}
          care={care}
        />

        <section className={`${card} flex flex-col gap-2`}>
          <h2 className="font-display text-lg font-bold sm:text-xl">✅ Husk</h2>
          {tasks.length === 0 ? (
            <p className="text-ink-light">
              Ingen oppgaver med frist i dag eller i morgen.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {[...tasks]
                .sort(
                  (a, b) =>
                    (a.dueDate ?? "").localeCompare(b.dueDate ?? "") ||
                    (a.dueTime ?? "").localeCompare(b.dueTime ?? ""),
                )
                .map((t) => {
                  const who = members.find((m) => m.id === t.assigneeId);
                  const overdue = (t.dueDate ?? "") < today;
                  return (
                    <li key={t.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => done(t)}
                        aria-label={`Merk «${t.title}» som gjort`}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-line text-transparent transition hover:border-primary hover:text-primary"
                      >
                        <Check size={18} aria-hidden />
                      </button>
                      <span className="min-w-0 flex-1 wrap-break-word">
                        <span className="font-semibold">{t.title}</span>
                        <span
                          className={`ml-1.5 text-sm ${overdue ? "font-bold text-danger" : "text-ink-light"}`}
                        >
                          {overdue
                            ? "forfalt"
                            : t.dueDate === today
                              ? "i dag"
                              : "i morgen"}
                          {t.dueTime ? ` kl. ${t.dueTime}` : ""}
                        </span>
                      </span>
                      {who && (
                        <Avatar
                          name={who.name}
                          color={who.color}
                          icon={who.icon}
                          url={who.avatarUrl}
                          size={26}
                        />
                      )}
                    </li>
                  );
                })}
            </ul>
          )}
          <Link
            href="/oppgaver"
            className="flex items-center gap-1 self-end text-sm font-bold text-primary-dark"
          >
            Alle oppgaver <ChevronRight size={16} aria-hidden />
          </Link>
        </section>

        <section className={`${card} flex flex-col gap-2`}>
          <h2 className="font-display text-lg font-bold sm:text-xl">
            🛒 Handleliste
          </h2>
          {shopping.length === 0 ? (
            <p className="text-ink-light">Ingenting på listen.</p>
          ) : (
            <p>
              <strong>
                {shopping.length === 1 ? "1 vare" : `${shopping.length} varer`}:
              </strong>{" "}
              {shopping.slice(0, 8).join(", ")}
              {shopping.length > 8 ? " …" : ""}
            </p>
          )}
          <Link
            href="/handleliste"
            className="flex items-center gap-1 self-end text-sm font-bold text-primary-dark"
          >
            Til handlelisten <ChevronRight size={16} aria-hidden />
          </Link>
        </section>
      </div>

      {weather && <YrCredit />}

      {toast && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[90vw] rounded-full bg-ink px-5 py-3 text-center font-bold text-white shadow-lg md:bottom-8"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

/** Én dag: hvem skal hva, gruppert per person (bare de som har noe). */
function DaySection({
  label,
  day,
  members,
  categories,
  events,
  care,
}: {
  label: string;
  day: string;
  members: CalendarMember[];
  categories: CalendarCategory[];
  events: CalendarEvent[];
  care: CareData;
}) {
  const onDay = events
    .filter((e) => touchesDay(e, day))
    .sort(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start),
    );
  const people = members
    .map((m) => ({
      m,
      list: onDay.filter((e) => e.participantIds.includes(m.id)),
      plan: careFor(care, m.id, day),
    }))
    .filter((p) => p.list.length || p.plan);

  return (
    <section className={`${card} flex flex-col gap-3`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold sm:text-xl">
          📅 {label}
        </h2>
        <Link
          href="/"
          className="flex items-center gap-1 text-sm font-bold text-primary-dark"
        >
          Kalender <ChevronRight size={16} aria-hidden />
        </Link>
      </div>
      {people.length === 0 ? (
        <p className="text-ink-light">Ingenting i kalenderen.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {people.map(({ m, list, plan }) => (
            <li key={m.id} className="flex gap-3">
              <Avatar
                name={m.name}
                color={m.color}
                icon={m.icon}
                url={m.avatarUrl}
                size={34}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold" style={{ color: m.color }}>
                  {m.name}
                </p>
                {plan && (
                  <div className="my-0.5 w-fit max-w-full">
                    <CareBadge day={plan} members={members} />
                  </div>
                )}
                <ul className="flex flex-col gap-0.5">
                  {list.map((e) => {
                    const cat = categories.find((c) => c.id === e.categoryId);
                    return (
                      <li key={e.id} className="wrap-break-word">
                        <span className="mr-1.5 text-sm font-bold tabular-nums text-ink-light">
                          {when(e, day)}
                        </span>
                        {cat && <span aria-hidden>{cat.icon} </span>}
                        <span className="font-semibold">{e.title}</span>
                        {e.location && (
                          <span className="text-sm text-ink-light">
                            {" "}
                            · {e.location}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
