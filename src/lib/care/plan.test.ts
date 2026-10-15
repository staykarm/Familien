import { describe, expect, it } from "vitest";
import { pickupFor, pickupsOn, shortTime, upcomingWeekdays, type CareData } from "./plan";

const olav = "olav";
const care: CareData = {
  plans: [
    { memberId: olav, weekday: 1, pickBy: "ingvild", pickTime: "16:00" },
    { memberId: olav, weekday: 3, pickBy: null, pickTime: null },
  ],
  days: [
    { memberId: olav, date: "2026-10-19", pickBy: "marius", pickTime: "15:30" },
    { memberId: olav, date: "2026-10-26", pickBy: null, pickTime: null },
  ],
};

describe("pickupFor", () => {
  it("bruker ukeplanen", () => {
    // 2026-10-12 er en mandag.
    expect(pickupFor(care, olav, "2026-10-12")).toEqual({ childId: olav, date: "2026-10-12", by: "ingvild", time: "16:00", changed: false });
    expect(pickupFor(care, "edvard", "2026-10-12")).toBeNull();
  });

  it("en endring for datoen går foran, også «ingen henting»", () => {
    expect(pickupFor(care, olav, "2026-10-19")).toMatchObject({ by: "marius", time: "15:30", changed: true });
    expect(pickupFor(care, olav, "2026-10-26")).toBeNull();
  });

  it("bare hverdager med innhold", () => {
    expect(pickupFor(care, olav, "2026-10-14")).toBeNull(); // onsdag, tom
    expect(pickupFor(care, olav, "2026-10-17")).toBeNull(); // lørdag
  });

  it("pickupsOn finner alle barn med henting", () => {
    expect(pickupsOn(care, "2026-10-12").map((p) => p.childId)).toEqual([olav]);
  });
});

describe("hjelpere", () => {
  it("upcomingWeekdays hopper over helgen", () => {
    expect(upcomingWeekdays("2026-10-16", 1)).toEqual(["2026-10-16", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"]);
  });
  it("shortTime", () => {
    expect(shortTime("08:15:00")).toBe("08:15");
    expect(shortTime(null)).toBeNull();
  });
});

import { pickupItems, pickupChildId } from "./calendar";

describe("pickupItems", () => {
  it("heldagselement hos den som henter", () => {
    const members = [{ id: olav, name: "Olav", color: "#000", icon: "⚽", isShared: false, avatarUrl: null }];
    const [item] = pickupItems(care, members, ["2026-10-19", "2026-10-20"]);
    expect(item).toMatchObject({ title: "🚸 Hente Olav 15:30", participantIds: ["marius"], allDay: true, kind: "pickup" });
    expect(pickupChildId(item.id)).toBe(olav);
  });
});
