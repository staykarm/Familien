"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { tint } from "@/lib/calendar/colors";
import { minutesIntoDay, utcToOsloParts } from "@/lib/calendar/dates";
import { layoutLanes } from "@/lib/calendar/layout";
import type { CalendarCategory, CalendarEvent, CalendarMember } from "@/lib/calendar/types";
import { CareBadge } from "@/components/care/CareBadge";
import { pickupFor, type CareData } from "@/lib/care/plan";
import { HourWeather } from "@/components/weather/WeatherBadge";
import type { HourlyWeather } from "@/lib/weather/yr";
import { EventChipContent } from "./EventChip";
import { FIT_FIRST_HOUR, FIT_HOURS, usePhoneDayFit } from "./usePhoneDayFit";

const DEFAULT_HOUR_PX = 56;
/** Maks antall aktiviteter side om side i én kolonne. Resten samles i en «+N»-knapp. */
const MAX_LANES = 3;
const DEFAULT_FIRST_HOUR = 6;
const LAST_HOUR = 24;

interface Props {
  date: string;
  events: CalendarEvent[];
  members: CalendarMember[];
  categories: CalendarCategory[];
  onCreateAt: (memberId: string, hour: number, minute: number) => void;
  onOpen: (id: string) => void;
  /** Været time for time denne dagen (vises ved timeaksen). */
  hourly?: Record<number, HourlyWeather>;
  /** Henting (hverdager): «Hentes 16:00» øverst i barnets kolonne. */
  care?: CareData;
}

/** Én tidskolonne per familiemedlem (+ Felles) for én dag. */
export function PersonDayView({ date, events, members, categories, onCreateAt, onOpen, hourly = {}, care }: Props) {
  const timed = events.filter((e) => !e.allDay);
  const allDay = events.filter((e) => e.allDay);

  // Start tidligere enn 06 hvis noe skjer før det.
  const firstHour = useMemo(() => {
    const earliest = Math.min(...timed.map((e) => Math.floor(minutesIntoDay(e.start, date) / 60)), DEFAULT_FIRST_HOUR);
    return Math.max(0, earliest);
  }, [timed, date]);
  const hours = Array.from({ length: LAST_HOUR - firstHour }, (_, i) => firstHour + i);

  const now = useNowMinutes(date);

  // Telefon: fast høyde med rulling inni, avatarer og heldagsrad står fast øverst, og 08–20 synes med en gang.
  const scrollRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const allDayRef = useRef<HTMLDivElement>(null);
  const fitHeight = usePhoneDayFit(scrollRef, true);
  const [head, setHead] = useState({ avatar: 0, total: 0 });
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const avatar = avatarRef.current?.offsetHeight ?? 0;
      // Ikke offsetTop: den endrer seg når raden står fast (sticky) mens man ruller.
      const total = avatar + (allDayRef.current?.offsetHeight ?? 0);
      setHead((h) => (h.avatar === avatar && h.total === total ? h : { avatar, total }));
    });
    return () => cancelAnimationFrame(frame);
  }, [fitHeight, allDay.length, members.length, date, care]);
  const HOUR_PX = fitHeight !== null && head.total > 0 ? Math.max(28, Math.floor((fitHeight - head.total - 10) / FIT_HOURS)) : DEFAULT_HOUR_PX;
  const sticky = fitHeight !== null;

  useEffect(() => {
    const el = scrollRef.current;
    // Litt luft over, så «08» ikke skjules bak den faste toppen.
    if (el && sticky) el.scrollTop = Math.max(0, (FIT_FIRST_HOUR - firstHour) * HOUR_PX - 10);
  }, [sticky, HOUR_PX, firstHour, date]);

  return (
    <div
      ref={scrollRef}
      className={`rounded-3xl bg-card shadow-[0_2px_12px_rgba(120,90,60,0.08)] ${sticky ? "overflow-auto overscroll-contain" : "overflow-x-auto"}`}
      style={sticky ? { height: fitHeight } : undefined}
    >
      {/* Smale kolonner (ca. 4,5rem) slik at hele familien får plass på telefon; flere enn fem gir sidelengs rulling. */}
      <div
        className="relative grid"
        style={{ gridTemplateColumns: `2.25rem repeat(${members.length}, minmax(0, 1fr))`, minWidth: `calc(2.25rem + ${members.length} * 4.5rem)` }}
      >
        {/* Topp: avatarer */}
        <div ref={avatarRef} className={`sticky left-0 z-50 bg-card ${sticky ? "top-0" : ""}`} />
        {members.map((m) => (
          <div key={m.id} className={`flex flex-col items-center gap-1 border-b-2 border-line bg-card px-1 py-2 ${sticky ? "sticky top-0 z-40" : ""}`}>
            <Avatar name={m.name} color={m.color} icon={m.icon} url={m.avatarUrl} size={32} />
            <span className="max-w-full wrap-break-word text-center text-xs font-bold sm:text-sm">{m.name}</span>
          </div>
        ))}

        {/* Heldagsaktiviteter */}
        <div
          ref={allDayRef}
          className="sticky left-0 z-50 flex items-center bg-card px-0.5 text-[9px] leading-tight font-bold text-ink-light"
          style={sticky ? { top: head.avatar } : undefined}
        >
          Hele dagen
        </div>
        {members.map((m) => (
          <div
            key={m.id}
            className={`flex min-h-10 flex-col gap-1 border-b-2 border-l border-line bg-card p-1 ${sticky ? "sticky z-40" : ""}`}
            style={sticky ? { top: head.avatar } : undefined}
          >
            {(() => {
              const pickup = care && pickupFor(care, m.id, date);
              return pickup && <CareBadge pickup={pickup} members={members} compact={sticky} />;
            })()}
            {allDay
              .filter((e) => e.participantIds.includes(m.id))
              .map((e) => (
                <button
                  key={e.id}
                  onClick={() => onOpen(e.id)}
                  className="rounded-xl border-l-4 px-2 py-1 text-left"
                  style={{ borderColor: m.color, background: tint(m.color, 0.18) }}
                >
                  <EventChipContent
                    event={e}
                    members={members}
                    category={categories.find((c) => c.id === e.categoryId)}
                    showParticipants={e.participantIds.length > 1}
                    compact
                  />
                </button>
              ))}
          </div>
        ))}

        {/* Timeakse */}
        <div className="sticky left-0 z-10 bg-card">
          {hours.map((h, i) => (
            <div key={h} className="relative text-right text-xs text-ink-light" style={{ height: HOUR_PX }}>
              <span className={`absolute right-1 tabular-nums ${i === 0 ? "top-0.5" : "-top-2"}`}>
                {String(h).padStart(2, "0")}
              </span>
              {hourly[h] && (
                <span className={`absolute inset-x-0 flex justify-end pr-0.5 ${i === 0 ? "top-4" : "top-2"}`}>
                  <HourWeather hour={hourly[h]} stacked />
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Kolonner */}
        {members.map((m) => {
          const placed = layoutLanes(
            timed.filter((e) => e.participantIds.includes(m.id)),
            (e) => minutesIntoDay(e.start, date),
            (e) => minutesIntoDay(e.end, date),
            MAX_LANES
          );
          // Skjulte aktiviteter per klynge, vist som «+N» ved den første av dem.
          const hiddenByCluster = new Map<number, CalendarEvent[]>();
          for (const p of placed) if (p.hidden) hiddenByCluster.set(p.cluster, [...(hiddenByCluster.get(p.cluster) ?? []), p.item]);
          return (
            <div key={m.id} className="relative border-l border-line" style={{ height: hours.length * HOUR_PX }}>
              {hours.map((h, i) => (
                <button
                  key={h}
                  aria-label={`Ny aktivitet for ${m.name} kl. ${h}`}
                  // Øvre halvdel av timen gir hel time, nedre halvdel halv time.
                  onClick={(ev) => {
                    const rect = ev.currentTarget.getBoundingClientRect();
                    onCreateAt(m.id, h, ev.clientY - rect.top >= rect.height / 2 ? 30 : 0);
                  }}
                  className="absolute inset-x-0 border-t border-line/70 hover:bg-primary-soft/40"
                  style={{ top: i * HOUR_PX, height: HOUR_PX }}
                />
              ))}
              {now !== null && now >= firstHour * 60 && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-danger"
                  style={{ top: ((now - firstHour * 60) / 60) * HOUR_PX }}
                />
              )}
              {[...hiddenByCluster].map(([cluster, hidden]) => (
                <MoreButton
                  key={`more-${cluster}`}
                  events={hidden}
                  top={((minutesIntoDay(hidden[0].start, date) - firstHour * 60) / 60) * HOUR_PX + 1}
                  color={m.color}
                  onOpen={onOpen}
                />
              ))}
              {placed.filter((p) => !p.hidden).map(({ item: e, lane, lanes }) => {
                const startMin = minutesIntoDay(e.start, date);
                const endMin = Math.max(minutesIntoDay(e.end, date), startMin + 20);
                return (
                  <button
                    key={e.id}
                    onClick={() => onOpen(e.id)}
                    className={`absolute z-20 overflow-hidden rounded-xl border-l-4 text-left shadow-sm ${lanes > 2 ? "px-1 py-0.5" : "px-1.5 py-1"}`}
                    style={{
                      top: ((startMin - firstHour * 60) / 60) * HOUR_PX + 1,
                      height: ((endMin - startMin) / 60) * HOUR_PX - 2,
                      left: `calc(${(lane / lanes) * 100}% + 2px)`,
                      width: `calc(${100 / lanes}% - 4px)`,
                      borderColor: m.color,
                      background: tint(m.color, 0.22),
                    }}
                  >
                    <EventChipContent
                      event={e}
                      members={members}
                      category={categories.find((c) => c.id === e.categoryId)}
                      time={{ start: utcToOsloParts(e.start).time, end: utcToOsloParts(e.end).time }}
                      showParticipants={e.participantIds.length > 1}
                      box
                    />
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** «+N» for aktiviteter som ikke får plass side om side. Viser en liten liste ved trykk. */
function MoreButton({ events, top, color, onOpen }: { events: CalendarEvent[]; top: number; color: string; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute right-0.5 z-30" style={{ top }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`${events.length} aktiviteter til`}
        className="min-h-7 rounded-full border-2 bg-card px-2 text-xs font-extrabold shadow-sm"
        style={{ borderColor: color }}
      >
        +{events.length}
      </button>
      {open && (
        <ul className="absolute right-0 mt-1 flex w-48 flex-col gap-1 rounded-2xl bg-card p-2 shadow-lg ring-1 ring-line">
          {events.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpen(e.id);
                }}
                className="flex min-h-10 w-full flex-col items-start rounded-xl px-2 py-1 text-left hover:bg-card-soft"
              >
                <span className="text-sm font-bold">{e.title}</span>
                <span className="text-xs tabular-nums text-ink-light">
                  {utcToOsloParts(e.start).time}–{utcToOsloParts(e.end).time}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Minutter siden midnatt nå, hvis `date` er i dag (oppdateres hvert minutt). */
function useNowMinutes(date: string): number | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  const { date: today } = utcToOsloParts(now.toISOString());
  return today === date ? minutesIntoDay(now.toISOString(), date) : null;
}
