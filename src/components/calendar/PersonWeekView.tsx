"use client";

import { useRef } from "react";
import { DateTime } from "luxon";
import { Plus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { tint } from "@/lib/calendar/colors";
import { osloDate } from "@/lib/calendar/dates";
import type { CalendarCategory, CalendarEvent, CalendarMember } from "@/lib/calendar/types";
import { TIME_ZONE } from "@/lib/time";
import { WeatherBadge } from "@/components/weather/WeatherBadge";
import type { DailyWeather } from "@/lib/weather/yr";
import { EventChipContent } from "./EventChip";
import { usePhoneDayFit } from "./usePhoneDayFit";

interface Props {
  days: string[];
  today: string;
  events: CalendarEvent[];
  members: CalendarMember[];
  categories: CalendarCategory[];
  onCreateOn: (memberId: string, date: string) => void;
  onOpen: (id: string) => void;
  onDayClick: (date: string) => void;
  weather: Record<string, DailyWeather>;
  onWeather: (date: string) => void;
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
export function PersonWeekView({ days, today, events, members, categories, onCreateOn, onOpen, onDayClick, weather, onWeather }: Props) {
  // Telefon: hele uka og alle radene (med Felles) på én skjerm. Radene deler høyden, og hver rute ruller selv ved behov.
  const ref = useRef<HTMLDivElement>(null);
  const fit = usePhoneDayFit(ref, true);
  const phone = fit !== null;
  return (
    <div
      ref={ref}
      className={`rounded-3xl bg-card shadow-[0_2px_12px_rgba(120,90,60,0.08)] ${phone ? "overflow-hidden" : "overflow-x-auto"}`}
      style={phone ? { height: fit } : undefined}
    >
      <div
        className={`grid ${phone ? "h-full" : "min-w-[760px]"}`}
        style={{
          gridTemplateColumns: `${phone ? "2.75rem" : "6.5rem"} repeat(${days.length}, minmax(0, 1fr))`,
          gridTemplateRows: phone ? `auto repeat(${members.length}, minmax(0, 1fr))` : undefined,
        }}
      >
        <div className="sticky left-0 z-10 bg-card" />
        {days.map((d) => {
          const dt = osloDate(d).setLocale("nb");
          const isToday = d === today;
          return (
            <div
              key={d}
              role="button"
              tabIndex={0}
              onClick={() => onDayClick(d)}
              onKeyDown={(e) => e.key === "Enter" && onDayClick(d)}
              className={`flex cursor-pointer flex-col items-center border-b-2 border-line hover:bg-card-soft ${phone ? "py-1" : "py-2"}`}
            >
              <span className={`font-bold uppercase text-ink-light ${phone ? "text-[10px]" : "text-xs"}`}>{dt.toFormat("ccc")}</span>
              <span
                className={`flex items-center justify-center rounded-full font-display font-bold ${phone ? "h-6 w-6 text-sm" : "h-8 w-8 text-lg"} ${
                  isToday ? "bg-primary text-white" : ""
                }`}
              >
                {dt.day}
              </span>
              {weather[d] && <WeatherBadge day={weather[d]} size={phone ? 16 : 22} onClick={() => onWeather(d)} />}
            </div>
          );
        })}

        {members.map((m) => (
          <div key={m.id} className="contents">
            <div
              className={`sticky left-0 z-10 flex flex-col items-center justify-center gap-0.5 border-b border-line bg-card ${phone ? "p-0.5" : "p-2"}`}
              style={{ boxShadow: `inset ${phone ? 3 : 4}px 0 0 ${m.color}` }}
            >
              <Avatar name={m.name} color={m.color} icon={m.icon} url={m.avatarUrl} size={phone ? 26 : 36} />
              <span className={`max-w-full wrap-break-word text-center font-bold ${phone ? "text-[9px] leading-tight" : "text-xs"}`}>{m.name}</span>
            </div>
            {days.map((d) => {
              const dayEvents = events
                .filter((e) => e.participantIds.includes(m.id) && touchesDay(e, d))
                .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
              return (
                <div
                  key={d}
                  className={`group relative flex flex-col border-b border-l border-line ${
                    phone ? "min-h-0 gap-0.5 overflow-y-auto p-0.5" : "min-h-24 gap-1 p-1"
                  } ${d === today ? "bg-sun/30" : ""}`}
                >
                  {dayEvents.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => onOpen(e.id)}
                      className={`border-l-4 text-left ${phone ? "hyphens-auto rounded-md border-l-2 px-0.5 py-0.5" : "rounded-xl px-1.5 py-1"}`}
                      style={{ borderColor: m.color, background: tint(m.color, 0.2) }}
                    >
                      <EventChipContent
                        event={e}
                        members={members}
                        category={categories.find((c) => c.id === e.categoryId)}
                        time={e.allDay ? (phone ? undefined : "Hele dagen") : DateTime.fromISO(e.start).setZone(TIME_ZONE).toFormat("HH:mm")}
                        showParticipants={e.participantIds.length > 1}
                        compact
                      />
                    </button>
                  ))}
                  <button
                    onClick={() => onCreateOn(m.id, d)}
                    aria-label={`Ny aktivitet for ${m.name} ${osloDate(d).setLocale("nb").toFormat("cccc d. LLLL")}`}
                    className={`mt-auto flex shrink-0 items-center justify-center rounded-lg text-ink-faint opacity-60 transition hover:bg-primary-soft hover:text-primary-dark group-hover:opacity-100 ${
                      phone ? "min-h-5" : "min-h-8"
                    }`}
                  >
                    <Plus size={phone ? 14 : 18} aria-hidden />
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
