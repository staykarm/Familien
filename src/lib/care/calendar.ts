import { DateTime } from "luxon";
import type { CalendarEvent, CalendarMember } from "@/lib/calendar/types";
import { TIME_ZONE } from "@/lib/time";
import { careSlotsOn, PART_LABEL, type CareData } from "./plan";

export const CARE_PREFIX = "care:";

export function isCareItemId(id: string): boolean {
  return id.startsWith(CARE_PREFIX);
}

/** Barnets id fra et leverings-/hentingselement i kalenderen. */
export function careChildId(id: string): string {
  return id.slice(CARE_PREFIX.length).split(":")[0];
}

/**
 * Levering og henting som heldagselementer hos den som har ansvaret: «🚸 Levere Olav 08:00», «🚸 Hente Olav 16:00».
 * Uten noen satt opp vises det hos barnet («Hvem henter Olav 16:00?»). Kan ikke dras; trykk åpner barnets profil.
 */
export function careItems(care: CareData, members: CalendarMember[], days: string[]): CalendarEvent[] {
  return days.flatMap((date) =>
    careSlotsOn(care, date).map((s): CalendarEvent => {
      const child = members.find((m) => m.id === s.childId)?.name ?? "";
      const day = DateTime.fromISO(date, { zone: TIME_ZONE }).startOf("day");
      const verb = PART_LABEL[s.part].verb;
      const time = s.time ? ` ${s.time}` : "";
      return {
        id: `${CARE_PREFIX}${s.childId}:${date}:${s.part}`,
        title: s.by ? `🚸 ${verb[0].toUpperCase()}${verb.slice(1)} ${child}${time}` : `🚸 Hvem ${s.part === "drop" ? "leverer" : "henter"} ${child}${time}?`,
        start: day.toUTC().toISO()!,
        end: day.plus({ days: 1 }).toUTC().toISO()!,
        allDay: true,
        location: null,
        notes: null,
        categoryId: null,
        participantIds: [s.by ?? s.childId],
        syncStatus: "local",
        origin: "app",
        kind: "care",
      };
    })
  );
}
