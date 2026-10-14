import { describe, expect, it } from "vitest";
import { eventFormSchema, moveEventSchema } from "./event";

const base = {
  title: " Fotball ",
  participantIds: ["8d0f3c8e-6b7a-4c51-9a8e-2f9b1a3c4d5e", "8d0f3c8e-6b7a-4c51-9a8e-2f9b1a3c4d5e"],
  categoryId: null,
  allDay: false,
  date: "2026-10-13",
  startTime: "17:30",
  durationMinutes: 90,
  endDate: "2026-10-13",
  location: "",
  notes: " Ta med drikkeflaske ",
};

describe("eventFormSchema", () => {
  it("regner om Oslo-tid til UTC og legger til varighet", () => {
    const r = eventFormSchema.parse(base);
    expect(r.title).toBe("Fotball");
    expect(r.start).toBe("2026-10-13T15:30:00.000Z");
    expect(r.end).toBe("2026-10-13T17:00:00.000Z");
    expect(r.participantIds).toHaveLength(1);
    expect(r.location).toBeNull();
    expect(r.notes).toBe("Ta med drikkeflaske");
  });

  it("heldag over flere dager", () => {
    const r = eventFormSchema.parse({ ...base, allDay: true, endDate: "2026-10-15" });
    expect(r.start).toBe("2026-10-12T22:00:00.000Z");
    expect(r.end).toBe("2026-10-15T22:00:00.000Z");
  });

  it("avviser manglende deltakere, tom tittel og baklengs heldag", () => {
    expect(eventFormSchema.safeParse({ ...base, participantIds: [] }).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...base, title: "  " }).success).toBe(false);
    const r = eventFormSchema.safeParse({ ...base, allDay: true, endDate: "2026-10-12" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/Sluttdatoen/);
  });
});

describe("moveEventSchema", () => {
  it("avviser slutt før start", () => {
    expect(
      moveEventSchema.safeParse({
        id: "8d0f3c8e-6b7a-4c51-9a8e-2f9b1a3c4d5e",
        start: "2026-10-13T16:00:00Z",
        end: "2026-10-13T15:00:00Z",
        allDay: false,
      }).success
    ).toBe(false);
  });
});

describe("gjentakelse", () => {
  it("lager én forekomst per dato med samme Oslo-klokkeslett", () => {
    const r = eventFormSchema.parse({ ...base, date: "2026-10-19", recurrence: { freq: "weekly", interval: 1, weekdays: [1], until: "2026-12-23" } });
    expect(r.occurrences).toHaveLength(10);
    expect(r.occurrences![0]).toEqual({ start: "2026-10-19T15:30:00.000Z", end: "2026-10-19T17:00:00.000Z" });
    expect(r.occurrences![1]).toEqual({ start: "2026-10-26T16:30:00.000Z", end: "2026-10-26T18:00:00.000Z" });
    expect(r.scope).toBe("one");
  });

  it("avviser en regel uten datoer og for lange serier", () => {
    expect(eventFormSchema.safeParse({ ...base, recurrence: { freq: "daily", interval: 1, weekdays: [], until: "2026-10-01" } }).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...base, recurrence: { freq: "weekly", interval: 1, weekdays: [1], until: "2029-01-01" } }).success).toBe(false);
  });

  it("uten gjentakelse er det ingen forekomster", () => {
    expect(eventFormSchema.parse(base).occurrences).toBeNull();
  });
});
