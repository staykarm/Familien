"use client";

import { useEffect, useMemo, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import nbLocale from "@fullcalendar/core/locales/nb";
import type { DayCellContentArg, DayHeaderContentArg, EventContentArg, EventInput } from "@fullcalendar/core";
import { DateTime } from "luxon";
import { WeatherBadge } from "@/components/weather/WeatherBadge";
import type { DailyWeather } from "@/lib/weather/yr";
import { eventColor, tint } from "@/lib/calendar/colors";
import type { CalendarViewKind } from "@/lib/calendar/dates";
import type { CalendarCategory, CalendarEvent, CalendarMember } from "@/lib/calendar/types";
import { TIME_ZONE } from "@/lib/time";
import { EventChipContent } from "./EventChip";

const FC_VIEW: Record<CalendarViewKind, string> = {
  day: "timeGridDay",
  week: "timeGridWeek",
  month: "dayGridMonth",
};

interface Props {
  view: CalendarViewKind;
  date: string;
  events: CalendarEvent[];
  members: CalendarMember[];
  categories: CalendarCategory[];
  onCreate: (start: Date, end: Date, allDay: boolean) => void;
  onOpen: (id: string) => void;
  onMove: (id: string, start: Date, end: Date, allDay: boolean, revert: () => void) => void;
  onDayClick: (date: string) => void;
  weather: Record<string, DailyWeather>;
  onWeather: (date: string) => void;
}

const osloIsoDate = (d: Date) => DateTime.fromJSDate(d).setZone(TIME_ZONE).toISODate()!;

/** Vanlig dag-/uke-/månedsvisning med FullCalendar (gratisversjonen). */
export function FullCalendarView({ view, date, events, members, categories, onCreate, onOpen, onMove, onDayClick, weather, onWeather }: Props) {
  const ref = useRef<FullCalendar>(null);

  // Navigasjonen styres av appen (egne knapper), ikke av FullCalendar sin verktøylinje.
  // Visning: kalenderen bygges på nytt (key={view}), så den alltid starter i riktig visning – mer robust enn
  // changeView, som i enkelte nettlesere kunne bli overstyrt når komponenten samtidig fikk nye innstillinger.
  // Dato: flyttes med gotoDate når man blar.
  useEffect(() => {
    ref.current?.getApi().gotoDate(date);
  }, [date]);

  const fcEvents = useMemo<EventInput[]>(
    () =>
      events.map((e) => {
        const color = eventColor(e, members);
        return {
          id: e.id,
          title: e.title,
          start: e.start,
          end: e.end,
          allDay: e.allDay,
          backgroundColor: tint(color, 0.18),
          borderColor: color,
          textColor: "#3a3350",
          // Oppgaver flyttes ved å endre fristen i oppgavedialogen, ikke ved å dra.
          editable: e.kind !== "task",
          classNames: e.kind === "task" ? ["familien-task", ...(e.done ? ["familien-task-done"] : [])] : [],
          extendedProps: { event: e },
        };
      }),
    [events, members]
  );

  const renderEvent = (arg: EventContentArg) => {
    const ev = arg.event.extendedProps.event as CalendarEvent;
    const category = categories.find((c) => c.id === ev.categoryId);
    const isMonth = arg.view.type === "dayGridMonth";
    const box = !isMonth && !ev.allDay;
    const hhmm = (d: Date | null) => (d ? DateTime.fromJSDate(d).setZone(TIME_ZONE).toFormat("HH:mm") : undefined);
    return (
      <div className={`w-full overflow-hidden ${box ? "h-full" : "px-1 py-0.5"}`}>
        <EventChipContent
          event={ev}
          members={members}
          category={category}
          time={ev.allDay ? undefined : { start: hhmm(arg.event.start)!, end: hhmm(arg.event.end) }}
          compact={isMonth}
          box={box}
          showParticipants={!isMonth}
        />
      </div>
    );
  };

  // Værsymbol og maks-temperatur i dagshodene (dag/uke) og i rutene (måned).
  const renderDayHeader = (arg: DayHeaderContentArg) => {
    const day = weather[osloIsoDate(arg.date)];
    return (
      <span className="flex flex-wrap items-center justify-center gap-x-1">
        <span>{arg.text}</span>
        {day && arg.view.type === "timeGridWeek" && <WeatherBadge day={day} size={22} onClick={() => onWeather(day.date)} />}
      </span>
    );
  };

  const renderDayCell = (arg: DayCellContentArg) => {
    const day = arg.view.type === "dayGridMonth" ? weather[osloIsoDate(arg.date)] : undefined;
    return (
      <span className="flex items-center gap-1">
        {day && <WeatherBadge day={day} size={18} onClick={() => onWeather(day.date)} />}
        <span className="familien-daynum">{arg.dayNumberText}</span>
      </span>
    );
  };

  return (
    <div className="familien-fc">
      <FullCalendar
        key={view}
        ref={ref}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, luxonPlugin]}
        initialView={FC_VIEW[view]}
        initialDate={date}
        headerToolbar={false}
        locale={nbLocale}
        timeZone={TIME_ZONE}
        firstDay={1}
        height="auto"
        slotMinTime="06:00:00"
        slotMaxTime="24:00:00"
        slotDuration="00:30:00"
        slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        dayHeaderFormat={view === "month" ? { weekday: "short" } : { weekday: "short", day: "numeric" }}
        allDayText="Hele dagen"
        nowIndicator
        dayMaxEvents={3}
        // Aktiviteter samtidig står side om side (ikke oppå hverandre), maks tre; resten samles i «+N til».
        slotEventOverlap={false}
        eventMaxStack={3}
        eventDisplay="block"
        moreLinkText={(n) => `+${n} til`}
        events={fcEvents}
        eventContent={renderEvent}
        dayHeaderContent={renderDayHeader}
        dayCellContent={renderDayCell}
        editable
        // I månedsvisning åpner et trykk dagen i stedet for å lage en ny aktivitet.
        selectable={view !== "month"}
        selectMirror
        longPressDelay={350}
        select={(info) => {
          onCreate(info.start, info.end, info.allDay);
          info.view.calendar.unselect();
        }}
        // Klikk/trykk på et ledig tidspunkt (eller «Hele dagen»-feltet) lager en ny aktivitet der.
        // Dra over flere felt for å velge lengden. I månedsvisning åpner trykket dagen.
        selectMinDistance={8}
        dateClick={(info) => {
          if (info.view.type === "dayGridMonth") onDayClick(info.dateStr.slice(0, 10));
          else onCreate(info.date, new Date(info.date.getTime() + (info.allDay ? 86_400_000 : 30 * 60_000)), info.allDay);
        }}
        eventClick={(info) => onOpen(info.event.id)}
        eventDrop={(info) =>
          onMove(info.event.id, info.event.start!, info.event.end ?? info.event.start!, info.event.allDay, info.revert)
        }
        eventResize={(info) =>
          onMove(info.event.id, info.event.start!, info.event.end ?? info.event.start!, info.event.allDay, info.revert)
        }
      />
    </div>
  );
}
