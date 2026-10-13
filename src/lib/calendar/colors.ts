import type { CalendarEvent, CalendarMember } from "./types";

/** Fargen en aktivitet tegnes med: første deltaker som ikke er Felles, ellers Felles sin farge. */
export function eventColor(event: Pick<CalendarEvent, "participantIds">, members: CalendarMember[]): string {
  const participants = event.participantIds
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is CalendarMember => Boolean(m));
  const person = participants.find((m) => !m.isShared) ?? participants[0];
  return person?.color ?? "#a39e93";
}

/** Gjennomsiktig variant av en #rrggbb-farge (alpha 0–1). */
export function tint(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}
