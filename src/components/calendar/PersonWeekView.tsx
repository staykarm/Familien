"use client";

import { DateTime } from "luxon";
import { Plus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { tint } from "@/lib/calendar/colors";
import { osloDate } from "@/lib/calendar/dates";
import type { CalendarCategory, CalendarEvent, CalendarMember } from "@/lib/calendar/types";
import { TIME_ZONE } from "@/lib/time";
import { EventChipContent } from "./EventChip";

interface Props {
  days: string[];
  today: string;
  events: CalendarEvent[];
  members: CalendarMember[];
  categories: CalendarCategory[];
  onCreateOn: (memberId: string, date: string) => void;
  onOpen: (id: string) => void;
  onDayClick: (date: string) => void;
}

function touchesDay(e: CalendarEvent, day: string): boolean {
  const start = osloDate(day);
  const end = start.plus({ days: 1 });
  const s = DateTime.fromISO(e.start);
  const en = DateTime.fromISO(e.end);
  // Slutt er eksklusiv; null-varighet teller på startdagen.
  return s < end && (en > start || (en.equals(s) && s >= start));
}

/** Én rad per familiemedlem, én kolonne per ukedag. */
export function PersonWeekView({ days, today, events, members, categories, onCreateOn, onOpen, onDayClick }: Props) {
  return (
    <div className="overflow-x-auto rounded-3xl bg-card shadow-[0_2px_12px_rgba(120,90,60,0.08)]">
      <div className="grid min-w-[760px]" style={{ gridTemplateColumns: `6.5rem repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="sticky left-0 z-10 bg-card" />
        {days.map((d) => {
          const dt = osloDate(d).setLocale("nb");
          const isToday = d === today;
          return (
            <button
              key={d}
              onClick={() => onDayClick(d)}
              className="flex flex-col items-center border-b-2 border-line py-2 hover:bg-card-soft"
            >
              <span className="text-xs font-bold uppercase text-ink-light">{dt.toFormat("ccc")}</span>
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full font-display text-lg font-bold ${
                  isToday ? "bg-primary text-white" : ""
                }`}
              >
                {dt.day}
              </span>
            </button>
          );
        })}

        {members.map((m) => (
          <div key={m.id} className="contents">
            <div
              className="sticky left-0 z-10 flex flex-col items-center justify-center gap-1 border-b border-line bg-card p-2"
              style={{ boxShadow: `inset 4px 0 0 ${m.color}` }}
            >
              <Avatar name={m.name} color={m.color} icon={m.icon} url={m.avatarUrl} size={36} />
              <span className="text-xs font-bold">{m.name}</span>
            </div>
            {days.map((d) => {
              const dayEvents = events
                .filter((e) => e.participantIds.includes(m.id) && touchesDay(e, d))
                .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
              return (
                <div
                  key={d}
                  className={`group relative flex min-h-24 flex-col gap-1 border-b border-l border-line p-1 ${
                    d === today ? "bg-sun/30" : ""
                  }`}
                >
                  {dayEvents.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => onOpen(e.id)}
                      className="rounded-xl border-l-4 px-1.5 py-1 text-left"
                      style={{ borderColor: m.color, background: tint(m.color, 0.2) }}
                    >
                      <EventChipContent
                        event={e}
                        members={members}
                        category={categories.find((c) => c.id === e.categoryId)}
                        timeLabel={e.allDay ? "Hele dagen" : DateTime.fromISO(e.start).setZone(TIME_ZONE).toFormat("HH:mm")}
                        showParticipants={e.participantIds.length > 1}
                        compact
                      />
                    </button>
                  ))}
                  <button
                    onClick={() => onCreateOn(m.id, d)}
                    aria-label={`Ny aktivitet for ${m.name} ${osloDate(d).setLocale("nb").toFormat("cccc d. LLLL")}`}
                    className="mt-auto flex min-h-8 items-center justify-center rounded-lg text-ink-faint opacity-60 transition hover:bg-primary-soft hover:text-primary-dark group-hover:opacity-100"
                  >
                    <Plus size={18} aria-hidden />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
