// Hvem skal hva en dag, gruppert per person. Brukes i «I dag» i appen og på dashboardet (PeopleDay).
// Rene funksjoner uten nettverk, slik at de kan testes.

import { DateTime } from "luxon";
import { touchesDay } from "@/lib/calendar/dates";
import type { CalendarEvent, CalendarMember } from "@/lib/calendar/types";
import { TIME_ZONE } from "@/lib/time";

const hhmm = (iso: string) => DateTime.fromISO(iso).setZone(TIME_ZONE).toFormat("HH:mm");

/** «Hele dagen», «07:45–08:30», «fra 07:45», «til 10:00». */
export function eventWhen(e: CalendarEvent, day: string): string {
  if (e.allDay) return "Hele dagen";
  const startsToday = DateTime.fromISO(e.start).setZone(TIME_ZONE).toISODate() === day;
  const endsToday = DateTime.fromISO(e.end).setZone(TIME_ZONE).toISODate() === day;
  if (!startsToday) return `til ${hhmm(e.end)}`;
  return endsToday ? `${hhmm(e.start)}–${hhmm(e.end)}` : `fra ${hhmm(e.start)}`;
}

export interface PersonDay {
  member: CalendarMember;
  events: CalendarEvent[];
}

/**
 * Avtalene en dag per person (heldagsavtaler først, så etter tid). Avtaler uten noen av medlemmene som
 * deltaker legges på det felles medlemmet («Felles»), så de ikke forsvinner. Oppgaver i kalenderen tas ikke med.
 */
export function peopleForDay(events: CalendarEvent[], day: string, members: CalendarMember[]): PersonDay[] {
  const ids = new Set(members.map((m) => m.id));
  const shared = members.find((m) => m.isShared);
  const onDay = events
    .filter((e) => e.kind !== "task" && touchesDay(e, day))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
  return members
    .map((member) => ({
      member,
      events: onDay.filter((e) => e.participantIds.includes(member.id) || (member === shared && !e.participantIds.some((id) => ids.has(id)))),
    }))
    .filter((p) => p.events.length);
}
