import { describe, expect, it } from "vitest";
import { eventWhen, peopleForDay } from "./peopleDay";
import type { CalendarEvent, CalendarMember } from "./types";

const member = (id: string, name: string, isShared = false) => ({ id, name, color: "#000", icon: null, avatarUrl: null, isShared }) as unknown as CalendarMember;
const ev = (id: string, title: string, start: string, end: string, participantIds: string[], extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  title,
  start,
  end,
  allDay: false,
  location: null,
  notes: null,
  categoryId: null,
  participantIds,
  syncStatus: "synced",
  origin: "app",
  ...extra,
});

const members = [member("m", "Marius"), member("o", "Olav"), member("f", "Felles", true)];

describe("peopleForDay", () => {
  const events = [
    ev("1", "Fotball", "2026-11-03T16:30:00Z", "2026-11-03T17:30:00Z", ["o"]),
    ev("2", "Standup", "2026-11-03T07:30:00Z", "2026-11-03T08:00:00Z", ["m"]),
    ev("3", "Høstferie", "2026-11-03T00:00:00+01:00", "2026-11-04T00:00:00+01:00", ["o"], { allDay: true }),
    ev("4", "Middag hos farmor", "2026-11-03T16:00:00Z", "2026-11-03T19:00:00Z", []),
    ev("task:5", "Vinterdekk", "2026-11-03T08:00:00Z", "2026-11-03T08:00:00Z", ["m"], { kind: "task" }),
    ev("6", "Tannlege", "2026-11-04T07:10:00Z", "2026-11-04T07:40:00Z", ["o"]),
  ];

  it("grupperer per person i medlemsrekkefølge, heldag først, og legger avtaler uten deltaker på Felles", () => {
    const day = peopleForDay(events, "2026-11-03", members);
    expect(day.map((p) => [p.member.name, p.events.map((e) => e.title)])).toEqual([
      ["Marius", ["Standup"]],
      ["Olav", ["Høstferie", "Fotball"]],
      ["Felles", ["Middag hos farmor"]],
    ]);
  });

  it("viser tid i Oslo: heldag, fra–til, og avtaler som går over midnatt", () => {
    expect(eventWhen(events[2], "2026-11-03")).toBe("Hele dagen");
    expect(eventWhen(events[1], "2026-11-03")).toBe("08:30–09:00");
    const late = ev("7", "Nattog", "2026-11-03T21:00:00Z", "2026-11-04T06:00:00Z", ["m"]);
    expect(eventWhen(late, "2026-11-03")).toBe("fra 22:00");
    expect(eventWhen(late, "2026-11-04")).toBe("til 07:00");
  });
});
