import { describe, expect, it } from "vitest";
import { hasPlan, planForDate, shortTime, type CarePlanDay } from "./plan";

const olav = "olav";
const plans: CarePlanDay[] = [
  { memberId: olav, weekday: 1, dropBy: "marius", dropTime: "08:00", pickBy: "ingvild", pickTime: "16:00" },
  { memberId: olav, weekday: 3, dropBy: null, dropTime: null, pickBy: null, pickTime: null },
];

describe("planForDate", () => {
  it("finner planen for riktig ukedag", () => {
    // 2026-10-12 er en mandag.
    expect(planForDate(plans, olav, "2026-10-12")?.dropBy).toBe("marius");
    expect(planForDate(plans, "edvard", "2026-10-12")).toBeNull();
  });

  it("gjelder bare hverdager og bare dager med innhold", () => {
    expect(planForDate(plans, olav, "2026-10-14")).toBeNull(); // onsdag, tom
    expect(planForDate(plans, olav, "2026-10-17")).toBeNull(); // lørdag
    expect(planForDate(plans, olav, "2026-10-18")).toBeNull(); // søndag
  });
});

describe("hjelpere", () => {
  it("hasPlan og shortTime", () => {
    expect(hasPlan({ dropBy: null, dropTime: null, pickBy: null, pickTime: "15:30" })).toBe(true);
    expect(hasPlan({ dropBy: null, dropTime: null, pickBy: null, pickTime: null })).toBe(false);
    expect(shortTime("08:15:00")).toBe("08:15");
    expect(shortTime(null)).toBeNull();
  });
});
