import { describe, expect, it } from "vitest";
import { hourlyForDate } from "./hourly";

const h = (date: string, hour: number, temp: number) => ({ time: "", date, hour, hours: 1 as const, temp, precipitationMm: 0, windSpeed: 1, symbolCode: "clearsky_day" });

describe("hourlyForDate", () => {
  it("slår opp timene for riktig dato", () => {
    const map = hourlyForDate([h("2026-10-14", 8, 5), h("2026-10-14", 9, 6), h("2026-10-15", 8, 2)], "2026-10-14");
    expect(Object.keys(map)).toEqual(["8", "9"]);
    expect(map[9].temp).toBe(6);
  });
});
