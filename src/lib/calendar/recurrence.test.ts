import { describe, expect, it } from "vitest";
import { describeRule, MAX_OCCURRENCES, occurrenceDates, occurrenceRange, sameRule, untilChristmas, untilSummer } from "./recurrence";

describe("occurrenceDates", () => {
  it("hver mandag frem til jul", () => {
    const dates = occurrenceDates("2026-10-19", { freq: "weekly", interval: 1, weekdays: [1], until: "2026-12-23" });
    expect(dates[0]).toBe("2026-10-19");
    expect(dates.at(-1)).toBe("2026-12-21");
    expect(dates).toHaveLength(10);
  });

  it("flere ukedager, og første dato trenger ikke være en av dem", () => {
    const dates = occurrenceDates("2026-10-14", { freq: "weekly", interval: 1, weekdays: [4, 2], until: "2026-10-23" });
    expect(dates).toEqual(["2026-10-15", "2026-10-20", "2026-10-22"]);
  });

  it("annenhver uke", () => {
    const dates = occurrenceDates("2026-10-19", { freq: "weekly", interval: 2, weekdays: [1], until: "2026-11-30" });
    expect(dates).toEqual(["2026-10-19", "2026-11-02", "2026-11-16", "2026-11-30"]);
  });

  it("uten valgte ukedager brukes startdatoens ukedag", () => {
    expect(occurrenceDates("2026-10-14", { freq: "weekly", interval: 1, weekdays: [], until: "2026-10-28" })).toEqual([
      "2026-10-14",
      "2026-10-21",
      "2026-10-28",
    ]);
  });

  it("hver dag og hver måned", () => {
    expect(occurrenceDates("2026-10-30", { freq: "daily", interval: 1, weekdays: [], until: "2026-11-01" })).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
    expect(occurrenceDates("2026-08-31", { freq: "monthly", interval: 1, weekdays: [], until: "2026-12-31" })).toEqual([
      "2026-08-31",
      "2026-10-31",
      "2026-12-31",
    ]);
  });

  it("sluttdato før start gir ingenting, og antallet er begrenset", () => {
    expect(occurrenceDates("2026-10-14", { freq: "daily", interval: 1, weekdays: [], until: "2026-10-13" })).toEqual([]);
    expect(occurrenceDates("2026-01-01", { freq: "daily", interval: 1, weekdays: [], until: "2027-12-31" })).toHaveLength(MAX_OCCURRENCES);
  });
});

describe("occurrenceRange", () => {
  it("samme klokkeslett i Oslo før og etter overgang til vintertid", () => {
    const t = { allDay: false, startTime: "17:30", durationMinutes: 90, allDayDays: 1 };
    expect(occurrenceRange("2026-10-19", t)).toEqual({ start: "2026-10-19T15:30:00.000Z", end: "2026-10-19T17:00:00.000Z" });
    expect(occurrenceRange("2026-10-26", t)).toEqual({ start: "2026-10-26T16:30:00.000Z", end: "2026-10-26T18:00:00.000Z" });
  });

  it("heldag over flere dager", () => {
    expect(occurrenceRange("2026-10-19", { allDay: true, startTime: "09:00", durationMinutes: 60, allDayDays: 2 })).toEqual({
      start: "2026-10-18T22:00:00.000Z",
      end: "2026-10-20T22:00:00.000Z",
    });
  });
});

describe("tekst og snarveier", () => {
  it("beskriver regelen på norsk", () => {
    expect(describeRule({ freq: "weekly", interval: 1, weekdays: [1], until: "2026-12-23" }, "2026-10-19")).toBe(
      "Hver mandag til og med 23. desember 2026"
    );
    expect(describeRule({ freq: "weekly", interval: 2, weekdays: [3, 1], until: "2026-12-23" }, "2026-10-19")).toBe(
      "Annenhver mandag og onsdag til og med 23. desember 2026"
    );
  });

  it("til jul og til sommeren", () => {
    expect(untilChristmas("2026-10-14")).toBe("2026-12-23");
    expect(untilChristmas("2026-12-28")).toBe("2027-12-23");
    expect(untilSummer("2026-10-14")).toBe("2027-06-20");
  });

  it("sammenligner regler", () => {
    const a = { freq: "weekly" as const, interval: 1, weekdays: [1, 3], until: "2026-12-23" };
    expect(sameRule(a, { ...a, weekdays: [3, 1] })).toBe(true);
    expect(sameRule(a, { ...a, until: "2026-12-24" })).toBe(false);
    expect(sameRule(null, null)).toBe(true);
  });
});
