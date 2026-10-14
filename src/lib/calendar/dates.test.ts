import { describe, expect, it } from "vitest";
import {
  allDayLastDay,
  allDayRangeToUtc,
  formatDuration,
  minutesIntoDay,
  osloLocalToUtc,
  osloToday,
  shiftDate,
  utcToOsloParts,
  viewTitle,
  visibleRange,
} from "./dates";

describe("visibleRange", () => {
  it("uke starter mandag", () => {
    const r = visibleRange("week", "2026-10-15"); // torsdag
    expect(r.days[0]).toBe("2026-10-12");
    expect(r.days).toHaveLength(7);
  });

  it("inneværende uke starter i dag og fylles på med de kommende dagene", () => {
    const r = visibleRange("week", "2026-10-15", "2026-10-14");
    expect(r.days[0]).toBe("2026-10-14");
    expect(r.days.at(-1)).toBe("2026-10-20");
    // Andre uker starter mandag som vanlig.
    expect(visibleRange("week", "2026-10-22", "2026-10-14").days[0]).toBe("2026-10-19");
    expect(viewTitle("week", "2026-10-15", "2026-10-14")).toMatch(/^Uke 42–43 · 14\.–20\. okt/);
  });

  it("måned gir 6 uker fra mandagen før den 1.", () => {
    const r = visibleRange("month", "2026-10-15");
    expect(r.days[0]).toBe("2026-09-28");
    expect(r.days).toHaveLength(42);
  });

  it("dagen over sommertid-skiftet er 23 timer, men fortsatt én dag", () => {
    const r = visibleRange("day", "2026-03-29");
    expect(r.end.diff(r.start, "hours").hours).toBe(23);
    expect(r.days).toEqual(["2026-03-29"]);
  });
});

describe("konvertering Oslo ↔ UTC", () => {
  it("vintertid og sommertid", () => {
    expect(osloLocalToUtc("2026-01-10T17:00")).toBe("2026-01-10T16:00:00.000Z");
    expect(osloLocalToUtc("2026-07-10T17:00")).toBe("2026-07-10T15:00:00.000Z");
    expect(osloLocalToUtc("ikke en dato")).toBeNull();
  });

  it("tilbake til skjemafelt", () => {
    expect(utcToOsloParts("2026-07-10T15:00:00.000Z")).toEqual({ date: "2026-07-10", time: "17:00" });
  });

  it("heldag lagres med eksklusiv slutt og leses tilbake", () => {
    const r = allDayRangeToUtc("2026-10-13", "2026-10-14")!;
    expect(r.start).toBe("2026-10-12T22:00:00.000Z");
    expect(r.end).toBe("2026-10-14T22:00:00.000Z");
    expect(allDayLastDay(r.end)).toBe("2026-10-14");
    expect(allDayRangeToUtc("2026-10-14", "2026-10-13")).toBeNull();
  });
});

describe("diverse", () => {
  it("osloToday følger Oslo, ikke UTC", () => {
    expect(osloToday(new Date("2026-10-12T22:30:00Z"))).toBe("2026-10-13");
  });

  it("blar riktig enhet", () => {
    expect(shiftDate("day", "2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDate("week", "2026-10-13", -1)).toBe("2026-10-06");
    expect(shiftDate("month", "2026-01-31", 1)).toBe("2026-02-28");
  });

  it("titler på norsk", () => {
    expect(viewTitle("day", "2026-10-13")).toBe("tirsdag 13. oktober");
    expect(viewTitle("month", "2026-10-13")).toBe("oktober 2026");
    expect(viewTitle("week", "2026-10-13")).toMatch(/^Uke 42 · 12\.–18\. okt/);
  });

  it("minutter inn i dagen avgrenses", () => {
    expect(minutesIntoDay("2026-10-13T15:30:00.000Z", "2026-10-13")).toBe(17 * 60 + 30);
    expect(minutesIntoDay("2026-10-12T10:00:00.000Z", "2026-10-13")).toBe(0);
  });

  it("varighet", () => {
    expect(formatDuration(30)).toBe("30 min");
    expect(formatDuration(90)).toBe("1 t 30 min");
    expect(formatDuration(120)).toBe("2 t");
  });
});

describe("touchesDay", () => {
  it("aktivitet over midnatt berører begge dager, slutt er eksklusiv", async () => {
    const { touchesDay } = await import("./dates");
    const e = { start: "2026-10-14T21:00:00Z", end: "2026-10-14T23:30:00Z" }; // 23:00–01:30 Oslo
    expect(touchesDay(e, "2026-10-14")).toBe(true);
    expect(touchesDay(e, "2026-10-15")).toBe(true);
    expect(touchesDay({ start: "2026-10-14T22:00:00Z", end: "2026-10-15T22:00:00Z" }, "2026-10-16")).toBe(false);
  });
});
