import { describe, expect, it } from "vitest";
import { careChildId, careItems } from "./calendar";
import { careFor, nextWeekdays, periodText, shortTime, type CareData } from "./plan";

const olav = "olav";
const slot = (by: string | null, time: string | null) => ({ by, time });
const care: CareData = {
  plans: [
    { memberId: olav, weekday: 1, drop: slot("marius", "08:00"), pick: slot("ingvild", "16:00") },
    { memberId: olav, weekday: 2, drop: slot("marius", "08:00"), pick: slot("ingvild", "16:00") },
    { memberId: olav, weekday: 3, drop: slot(null, null), pick: slot(null, null) },
  ],
  overrides: [
    // Uke 43: Marius henter mandag–tirsdag, levering som vanlig.
    { id: "a", memberId: olav, from: "2026-10-19", to: "2026-10-20", note: null, drop: null, pick: slot("marius", "15:30"), createdAt: "2026-10-01T10:00:00Z" },
    // Tirsdag: ingen levering (lagret senere, gjelder bare levering).
    { id: "b", memberId: olav, from: "2026-10-20", to: "2026-10-20", note: "Fri", drop: slot(null, null), pick: null, createdAt: "2026-10-02T10:00:00Z" },
  ],
};

describe("careFor", () => {
  it("bruker ukeplanen", () => {
    // 2026-10-12 er en mandag.
    expect(careFor(care, olav, "2026-10-12")).toMatchObject({ drop: { by: "marius", time: "08:00", changed: false }, pick: { by: "ingvild", changed: false } });
    expect(careFor(care, "edvard", "2026-10-12")).toBeNull();
  });

  it("unntak over flere dager, per del", () => {
    expect(careFor(care, olav, "2026-10-19")).toMatchObject({ drop: { by: "marius", changed: false }, pick: { by: "marius", time: "15:30", changed: true } });
    const tue = careFor(care, olav, "2026-10-20");
    expect(tue?.drop).toBeNull();
    expect(tue?.pick).toMatchObject({ by: "marius", changed: true });
  });

  it("bare hverdager med innhold", () => {
    expect(careFor(care, olav, "2026-10-14")).toBeNull(); // onsdag, tom
    expect(careFor(care, olav, "2026-10-17")).toBeNull(); // lørdag
  });
});

describe("careItems", () => {
  it("heldagselementer hos den som har ansvaret", () => {
    const members = [{ id: olav, name: "Olav", color: "#000", icon: "⚽", isShared: false, avatarUrl: null }];
    const items = careItems(care, members, ["2026-10-19"]);
    expect(items.map((i) => [i.title, i.participantIds[0]])).toEqual([
      ["🚸 Levere Olav 08:00", "marius"],
      ["🚸 Hente Olav 15:30", "marius"],
    ]);
    expect(careChildId(items[0].id)).toBe(olav);
  });
});

describe("hjelpere", () => {
  it("nextWeekdays hopper over helgen", () => {
    expect(nextWeekdays("2026-10-16", 3)).toEqual(["2026-10-16", "2026-10-19", "2026-10-20"]);
  });
  it("periodText og shortTime", () => {
    expect(periodText("2026-10-20", "2026-10-24")).toBe("20.–24. okt");
    expect(periodText("2026-10-30", "2026-11-03")).toBe("30. okt–3. nov");
    expect(shortTime("08:15:00")).toBe("08:15");
  });
});
