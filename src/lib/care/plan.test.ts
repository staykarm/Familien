import { describe, expect, it } from "vitest";
import { careFor, careSummary, careText, shortTime, upcomingWeekdays, usedOthers, usualTime, type CareData } from "./plan";

const olav = "olav";
const slot = (by: string | null, time: string | null, other: string | null = null) => ({ by, other, time });
const care: CareData = {
  entries: [
    { memberId: olav, date: "2026-10-19", drop: slot("marius", "08:00"), pick: slot("ingvild", "16:00") },
    { memberId: olav, date: "2026-10-20", drop: slot(null, null), pick: slot("marius", "15:30") },
    { memberId: olav, date: "2026-10-21", drop: slot(null, null), pick: slot(null, null) },
    { memberId: olav, date: "2026-10-22", drop: slot("ingvild", "08:00"), pick: slot("ingvild", "16:00") },
  ],
};
const names: Record<string, string> = { olav: "Olav", marius: "Marius", ingvild: "Ingvild", edvard: "Edvard" };
const nameOf = (id: string) => names[id] ?? id;

describe("careFor", () => {
  it("dagens registrering", () => {
    expect(careFor(care, olav, "2026-10-19")).toMatchObject({ drop: { by: "marius", time: "08:00" }, pick: { by: "ingvild", time: "16:00" } });
    const tue = careFor(care, olav, "2026-10-20");
    expect(tue?.drop).toBeNull();
    expect(tue?.pick).toMatchObject({ by: "marius" });
  });

  it("ingenting når dagen er tom eller ikke registrert", () => {
    expect(careFor(care, olav, "2026-10-21")).toBeNull();
    expect(careFor(care, olav, "2026-10-23")).toBeNull();
    expect(careFor(care, "edvard", "2026-10-19")).toBeNull();
  });
});

describe("careText", () => {
  const text = (date: string, c: CareData = care) => careText(careSummary(c, date), nameOf);
  it("kort tekst om hvem som leverer og henter", () => {
    expect(text("2026-10-19")).toBe("Marius leverer, Ingvild henter");
    expect(text("2026-10-20")).toBe("Marius henter");
    expect(text("2026-10-22")).toBe("Ingvild leverer og henter");
    expect(text("2026-10-21")).toBe("");
  });
  it("fritekst for noen utenfor appen", () => {
    const c: CareData = { entries: [{ memberId: olav, date: "2026-10-23", drop: slot("ingvild", "08:00"), pick: slot(null, "15:00", "Farmor") }] };
    expect(text("2026-10-23", c)).toBe("Ingvild leverer, Farmor henter");
    const both: CareData = { entries: [{ memberId: olav, date: "2026-10-23", drop: slot(null, null, "Farmor"), pick: slot(null, null, "farmor") }] };
    expect(text("2026-10-23", both)).toBe("Farmor leverer og henter");
    expect(usedOthers([...c.entries, ...both.entries])).toEqual(["Farmor"]);
  });
  it("barnets navn når flere barn har noe samme dag", () => {
    const two: CareData = { entries: [...care.entries, { memberId: "edvard", date: "2026-10-22", drop: slot("marius", null), pick: slot(null, null) }] };
    expect(text("2026-10-22", two)).toBe("Olav: Ingvild leverer og henter · Edvard: Marius leverer");
  });
});

describe("hjelpere", () => {
  it("usualTime foreslår sist brukte tid", () => {
    expect(usualTime(care.entries, "pick")).toBe("16:00");
    expect(usualTime([], "drop")).toBeNull();
  });
  it("upcomingWeekdays hopper over helgen", () => {
    expect(upcomingWeekdays("2026-10-16", 1)).toEqual(["2026-10-16", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"]);
  });
  it("shortTime", () => {
    expect(shortTime("08:15:00")).toBe("08:15");
  });
});
