import { describe, expect, it } from "vitest";
import { careChildId, careItems } from "./calendar";
import { careFor, shortTime, upcomingWeekdays, usualTime, type CareData } from "./plan";

const olav = "olav";
const slot = (by: string | null, time: string | null) => ({ by, time });
const care: CareData = {
  entries: [
    { memberId: olav, date: "2026-10-19", drop: slot("marius", "08:00"), pick: slot("ingvild", "16:00") },
    { memberId: olav, date: "2026-10-20", drop: slot(null, null), pick: slot("marius", "15:30") },
    { memberId: olav, date: "2026-10-21", drop: slot(null, null), pick: slot(null, null) },
  ],
};

describe("careFor", () => {
  it("dagens registrering", () => {
    expect(careFor(care, olav, "2026-10-19")).toMatchObject({ drop: { by: "marius", time: "08:00" }, pick: { by: "ingvild", time: "16:00" } });
    const tue = careFor(care, olav, "2026-10-20");
    expect(tue?.drop).toBeNull();
    expect(tue?.pick).toMatchObject({ by: "marius" });
  });

  it("ingenting når dagen er tom eller ikke registrert", () => {
    expect(careFor(care, olav, "2026-10-21")).toBeNull();
    expect(careFor(care, olav, "2026-10-22")).toBeNull();
    expect(careFor(care, "edvard", "2026-10-19")).toBeNull();
  });
});

describe("careItems", () => {
  it("heldagselementer hos den som har ansvaret", () => {
    const members = [{ id: olav, name: "Olav", color: "#000", icon: "⚽", isShared: false, avatarUrl: null }];
    const items = careItems(care, members, ["2026-10-19"]);
    expect(items.map((i) => [i.title, i.participantIds[0]])).toEqual([
      ["🚸 Levere Olav 08:00", "marius"],
      ["🚸 Hente Olav 16:00", "ingvild"],
    ]);
    expect(careChildId(items[0].id)).toBe(olav);
  });
});

describe("hjelpere", () => {
  it("usualTime foreslår sist brukte tid", () => {
    expect(usualTime(care.entries, "pick")).toBe("15:30");
    expect(usualTime(care.entries, "drop")).toBe("08:00");
    expect(usualTime([], "drop")).toBeNull();
  });
  it("upcomingWeekdays hopper over helgen", () => {
    expect(upcomingWeekdays("2026-10-16", 1)).toEqual(["2026-10-16", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"]);
  });
  it("shortTime", () => {
    expect(shortTime("08:15:00")).toBe("08:15");
  });
});
