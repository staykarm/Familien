"use client";

import { useEffect, useMemo, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import nbLocale from "@fullcalendar/core/locales/nb";
import type { EventContentArg, EventInput } from "@fullcalendar/core";
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
}

/** Vanlig dag-/uke-/månedsvisning med FullCalendar (gratisversjonen). */
export function FullCalendarView({ view, date, events, members, categories, onCreate, onOpen, onMove, onDayClick }: Props) {
  const ref = useRef<FullCalendar>(null);

  // Navigasjonen styres av appen (egne knapper), ikke av FullCalendar sin verktøylinje.
  useEffect(() => {
    ref.current?.getApi().changeView(FC_VIEW[view], date);
  }, [view, date]);

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
    return (
      <div className="w-full overflow-hidden px-1 py-0.5">
        <EventChipContent
          event={ev}
          members={members}
          category={category}
          timeLabel={ev.allDay ? undefined : arg.timeText}
          compact={isMonth}
          showParticipants={!isMonth}
        />
      </div>
    );
  };

  return (
    <div className="familien-fc">
      <FullCalendar
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
        eventDisplay="block"
        moreLinkText={(n) => `+${n} til`}
        events={fcEvents}
        eventContent={renderEvent}
        editable
        // I månedsvisning åpner et trykk dagen i stedet for å lage en ny aktivitet.
        selectable={view !== "month"}
        selectMirror
        longPressDelay={350}
        select={(info) => {
          onCreate(info.start, info.end, info.allDay);
          info.view.calendar.unselect();
        }}
        dateClick={(info) => {
          if (info.view.type === "dayGridMonth") onDayClick(info.dateStr.slice(0, 10));
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
