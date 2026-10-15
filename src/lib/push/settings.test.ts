import { describe, expect, it } from "vitest";
import {
  defaultPushPrefs,
  dueReminders,
  eventTargets,
  inMinutes,
  inQuietHours,
  morningDue,
  pickRecipients,
  readPushPrefs,
} from "./settings";

// Midten av oktober 2026 er fortsatt sommertid i Oslo (UTC+2).
const oslo = (hhmm: string) => new Date(`2026-10-15T${hhmm}:00+02:00`);

describe("inQuietHours", () => {
  const quiet = { enabled: true, from: "22:00", to: "07:00" };
  it("går over midnatt", () => {
    expect(inQuietHours(quiet, oslo("23:30"))).toBe(true);
    expect(inQuietHours(quiet, oslo("06:59"))).toBe(true);
    expect(inQuietHours(quiet, oslo("07:00"))).toBe(false);
    expect(inQuietHours(quiet, oslo("12:00"))).toBe(false);
  });
  it("innenfor samme dag, og av", () => {
    expect(inQuietHours({ enabled: true, from: "12:00", to: "13:00" }, oslo("12:30"))).toBe(true);
    expect(inQuietHours({ ...quiet, enabled: false }, oslo("23:30"))).toBe(false);
  });
});

describe("pickRecipients", () => {
  const on = defaultPushPrefs();
  const noCalendar = { ...on, types: { ...on.types, calendar: false } };
  const quietAllDay = { ...on, quiet: { enabled: true, from: "00:00", to: "23:59" } };
  const subs = [
    { id: "a", memberId: "olav", prefs: on },
    { id: "b", memberId: "marius", prefs: on },
    { id: "c", memberId: null, prefs: on },
    { id: "d", memberId: "ingvild", prefs: noCalendar },
    { id: "e", memberId: "marius", prefs: quietAllDay },
  ];
  const now = oslo("12:00");
  it("hver enhet har sine egne valg", () => {
    expect(pickRecipients(subs, "calendar", { targets: null }, now).map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(pickRecipients(subs, "calendar", { targets: ["marius"] }, now).map((s) => s.id)).toEqual(["b", "c"]);
    expect(pickRecipients(subs, "shopping", { targets: null }, now)).toEqual([]);
  });
  it("ikke den som gjorde endringen, og stille tid per enhet", () => {
    expect(pickRecipients(subs, "calendar", { targets: null, exclude: "marius" }, now).map((s) => s.id)).toEqual(["a", "c"]);
    expect(pickRecipients(subs, "calendar", { targets: ["marius"], ignoreQuiet: true }, now).map((s) => s.id)).toEqual(["b", "c", "e"]);
  });
});

describe("eventTargets", () => {
  it("Felles betyr alle", () => {
    expect(eventTargets(["felles"], ["felles"])).toBeNull();
    expect(eventTargets(["olav"], ["felles"])).toEqual(["olav"]);
  });
});

describe("dueReminders", () => {
  const ev = (id: string, start: string, allDay = false) => ({ id, title: id, start, allDay, participantIds: [] });
  it("innen vinduet, ikke startet, ikke heldags", () => {
    const now = new Date("2026-10-15T10:00:00Z");
    const due = dueReminders(
      [ev("snart", "2026-10-15T10:20:00Z"), ev("senere", "2026-10-15T11:00:00Z"), ev("startet", "2026-10-15T09:59:00Z"), ev("heldag", "2026-10-15T10:10:00Z", true)],
      30,
      now
    );
    expect(due.map((d) => d.event.id)).toEqual(["snart"]);
    expect(due[0].key).toBe("reminder:snart:2026-10-15T10:20:00Z");
  });
});

describe("morningDue og inMinutes", () => {
  it("fra klokkeslettet og to timer fram", () => {
    expect(morningDue("07:00", oslo("06:55"))).toBe(false);
    expect(morningDue("07:00", oslo("07:05"))).toBe(true);
    expect(morningDue("07:00", oslo("09:30"))).toBe(false);
  });
  it("formaterer tid igjen", () => {
    const now = new Date("2026-10-15T10:00:00Z");
    expect(inMinutes("2026-10-15T10:30:00Z", now)).toBe("om 30 min");
    expect(inMinutes("2026-10-15T11:15:00Z", now)).toBe("om 1 t 15 min");
    expect(inMinutes("2026-10-15T12:00:00Z", now)).toBe("om 2 t");
  });
});

describe("readPushPrefs", () => {
  it("fyller inn standardverdier for nye typer og ugyldige verdier", () => {
    const p = readPushPrefs({ types: { shopping: true }, reminderMinutes: 15 });
    expect(p.types.shopping).toBe(true);
    expect(p.types.calendar).toBe(true);
    expect(p.reminderMinutes).toBe(15);
    expect(readPushPrefs({ reminderMinutes: 1 })).toEqual(defaultPushPrefs());
    expect(readPushPrefs(null)).toEqual(defaultPushPrefs());
  });
});
