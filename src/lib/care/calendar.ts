import { DateTime } from "luxon";
import type { CalendarEvent, CalendarMember } from "@/lib/calendar/types";
import { TIME_ZONE } from "@/lib/time";
import { pickupsOn, type CareData } from "./plan";

export const PICKUP_PREFIX = "pickup:";

export function isPickupItemId(id: string): boolean {
  return id.startsWith(PICKUP_PREFIX);
}

/** Barnets id fra et hentingselement i kalenderen. */
export function pickupChildId(id: string): string {
  return id.slice(PICKUP_PREFIX.length).split(":")[0];
}

/**
 * Henting som heldagselement i kalenderen, hos den som henter: «🚸 Hente Olav 16:00».
 * Uten noen satt opp vises det hos barnet. Kan ikke dras; trykk åpner barnets profil.
 */
export function pickupItems(care: CareData, members: CalendarMember[], days: string[]): CalendarEvent[] {
  return days.flatMap((date) =>
    pickupsOn(care, date).map((p): CalendarEvent => {
      const child = members.find((m) => m.id === p.childId)?.name ?? "";
      const day = DateTime.fromISO(date, { zone: TIME_ZONE }).startOf("day");
      return {
        id: `${PICKUP_PREFIX}${p.childId}:${date}`,
        title: p.by ? `🚸 Hente ${child}${p.time ? ` ${p.time}` : ""}` : `🚸 Hvem henter ${child}${p.time ? ` ${p.time}` : ""}?`,
        start: day.toUTC().toISO()!,
        end: day.plus({ days: 1 }).toUTC().toISO()!,
        allDay: true,
        location: null,
        notes: null,
        categoryId: null,
        participantIds: [p.by ?? p.childId],
        syncStatus: "local",
        origin: "app",
        kind: "pickup",
      };
    })
  );
}
