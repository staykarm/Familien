import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/lib/calendar/types";
import { dayAgenda, familyContext, nextDays, nextHours, openTasks } from "./day";

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: "e",
  title: "Avtale",
  start: "2026-10-30T16:30:00Z",
  end: "2026-10-30T17:30:00Z",
  allDay: false,
  location: null,
  notes: null,
  categoryId: null,
  participantIds: [],
  syncStatus: "synced",
  origin: "app",
  ...over,
});
const names: Record<string, string> = { o: "Olav", e: "Edvard", m: "Marius" };
const nameOf = (id: string) => names[id] ?? id;

describe("dayAgenda", () => {
  it("sorterer heldagsavtaler først, viser Oslo-tid og hopper over oppgaver", () => {
    const list = dayAgenda(
      [
        ev({ id: "fotball", title: "Fotball", participantIds: ["o"], location: "Ekebergsletta" }),
        ev({ id: "ferie", title: "Høstferie", allDay: true, start: "2026-10-29T23:00:00Z", end: "2026-10-30T23:00:00Z" }),
        ev({ id: "task:1", title: "Betale", kind: "task" }),
        ev({ id: "i-morgen", title: "Tannlege", start: "2026-10-31T07:10:00Z", end: "2026-10-31T08:00:00Z" }),
      ],
      "2026-10-30",
      nameOf
    );
    expect(list.map((a) => [a.title, a.when, a.who])).toEqual([
      ["Høstferie", "Hele dagen", ""],
      ["Fotball", "17:30–18:30", "Olav"],
    ]);
  });
});

describe("været", () => {
  const forecast = {
    hourly: [
      { time: "2026-10-30T19:00:00Z", date: "2026-10-30", hour: 20, hours: 1 as const, temp: 9, precipitationMm: 0, windSpeed: 2, symbolCode: "cloudy" },
      { time: "2026-10-30T20:00:00Z", date: "2026-10-30", hour: 21, hours: 1 as const, temp: 8, precipitationMm: 0, windSpeed: 2, symbolCode: "cloudy" },
      { time: "2026-10-30T21:00:00Z", date: "2026-10-30", hour: 22, hours: 1 as const, temp: 8, precipitationMm: 0.4, windSpeed: 3, symbolCode: "rain" },
      { time: "2026-11-01T00:00:00Z", date: "2026-11-01", hour: 1, hours: 6 as const, temp: 6, precipitationMm: 2, windSpeed: 4, symbolCode: "rain" },
    ],
    daily: ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].map((date) => ({
      date,
      symbolCode: "cloudy",
      tempMax: 9,
      tempMin: 4,
      precipitationMm: 0,
      windMax: 4,
    })),
  };

  it("gir timene fra og med timen vi er i, bare timesrader", () => {
    expect(nextHours(forecast, new Date("2026-10-30T20:15:00Z"), 16).map((h) => h.hour)).toEqual([21, 22]);
    expect(nextHours(null, new Date())).toEqual([]);
  });

  it("gir de neste fem dagene etter i dag", () => {
    expect(nextDays(forecast, "2026-10-30").map((d) => d.date)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]);
  });
});

describe("oppgaver og familiekontekst", () => {
  const task = (id: string, dueDate: string | null, status: "todo" | "done" = "todo") => ({ id, title: id, notes: null, assigneeId: null, categoryId: null, dueDate, dueTime: null, status, completedAt: null });

  it("viser åpne oppgaver med frist først", () => {
    expect(openTasks([task("uten", null), task("senere", "2026-11-02"), task("ferdig", "2026-10-01", "done"), task("snart", "2026-10-31")]).map((t) => t.id)).toEqual([
      "snart",
      "senere",
      "uten",
    ]);
  });

  it("lager kort tekst om i dag, i morgen, henting, oppgaver og handlelisten", () => {
    const text = familyContext({
      today: "2026-10-30",
      tomorrow: "2026-10-31",
      events: [ev({ title: "Fotball", participantIds: ["o"] })],
      care: { entries: [{ memberId: "o", date: "2026-10-30", drop: { by: "m", other: null, time: "07:45" }, pick: { by: "m", other: null, time: null } }] },
      tasks: [task("Betale SFO", "2026-10-30")],
      shopping: [
        { id: "1", name: "Melk", quantity: "2", categoryId: null, checked: false, checkedAt: null, addedBy: null, createdAt: "" },
        { id: "2", name: "Brød", quantity: null, categoryId: null, checked: true, checkedAt: null, addedBy: null, createdAt: "" },
      ],
      nameOf,
    });
    expect(text).toContain("I DAG (fredag 30. oktober):\n- 17:30–18:30 Fotball (Olav)\n- levering og henting: Marius leverer og henter");
    expect(text).toContain("I MORGEN (lørdag 31. oktober):\n- ingen avtaler");
    expect(text).toContain("- Betale SFO (frist 2026-10-30)");
    expect(text).toContain("HANDLELISTE: Melk (2)");
    expect(text).not.toContain("Brød");
  });
});
