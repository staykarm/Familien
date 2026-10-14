"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { tint } from "@/lib/calendar/colors";
import { minutesIntoDay, utcToOsloParts } from "@/lib/calendar/dates";
import { layoutLanes } from "@/lib/calendar/layout";
import type { CalendarCategory, CalendarEvent, CalendarMember } from "@/lib/calendar/types";
import { EventChipContent } from "./EventChip";

const HOUR_PX = 56;
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
}

/** Én tidskolonne per familiemedlem (+ Felles) for én dag. */
export function PersonDayView({ date, events, members, categories, onCreateAt, onOpen }: Props) {
  const timed = events.filter((e) => !e.allDay);
  const allDay = events.filter((e) => e.allDay);

  // Start tidligere enn 06 hvis noe skjer før det.
  const firstHour = useMemo(() => {
    const earliest = Math.min(...timed.map((e) => Math.floor(minutesIntoDay(e.start, date) / 60)), DEFAULT_FIRST_HOUR);
    return Math.max(0, earliest);
  }, [timed, date]);
  const hours = Array.from({ length: LAST_HOUR - firstHour }, (_, i) => firstHour + i);

  const now = useNowMinutes(date);

  return (
    <div className="overflow-x-auto rounded-3xl bg-card shadow-[0_2px_12px_rgba(120,90,60,0.08)]">
      <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `3.25rem repeat(${members.length}, minmax(0, 1fr))` }}>
        {/* Topp: avatarer */}
        <div className="sticky left-0 z-10 bg-card" />
        {members.map((m) => (
          <div key={m.id} className="flex flex-col items-center gap-1 border-b-2 border-line px-1 py-2">
            <Avatar name={m.name} color={m.color} icon={m.icon} url={m.avatarUrl} size={40} />
            <span className="text-sm font-bold">{m.name}</span>
          </div>
        ))}

        {/* Heldagsaktiviteter */}
        <div className="sticky left-0 z-10 flex items-center bg-card px-1 text-[10px] font-bold text-ink-light">Hele dagen</div>
        {members.map((m) => (
          <div key={m.id} className="flex min-h-10 flex-col gap-1 border-b-2 border-l border-line p-1">
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
              <span className={`absolute right-1.5 tabular-nums ${i === 0 ? "top-0.5" : "-top-2"}`}>
                {String(h).padStart(2, "0")}
              </span>
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
