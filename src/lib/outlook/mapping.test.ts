import { describe, expect, it } from "vitest";
import { categoryFromOutlook, fromGraphEvent, outlookFingerprint, outlookTitle, parseOutlookTitle, presetForColor, toGraphEvent, type CategoryRef, type MemberRef } from "./mapping";

const members: MemberRef[] = [
  { id: "i", name: "Ingvild", isShared: false },
  { id: "m", name: "Marius", isShared: false },
  { id: "e", name: "Edvard", isShared: false },
  { id: "o", name: "Olav", isShared: false },
  { id: "f", name: "Felles", isShared: true },
];
const categories: CategoryRef[] = [
  { id: "trening", name: "Trening", outlookCategory: null },
  { id: "skole", name: "Skole", outlookCategory: "Skole og SFO" },
  { id: "annet", name: "Annet", outlookCategory: null },
];

describe("tittel med deltakere", () => {
  it("legger til navnene i medlemsrekkefølge", () => {
    expect(outlookTitle("Fotball", ["o", "e"], members)).toBe("Fotball (Edvard, Olav)");
  });

  it("bare Felles gir ingen parentes", () => {
    expect(outlookTitle("Middag", ["f"], members)).toBe("Middag");
  });

  it("leser navnene tilbake, også med «og»", () => {
    expect(parseOutlookTitle("Fotball (Edvard, Olav)", members)).toEqual({ title: "Fotball", participantIds: ["e", "o"] });
    expect(parseOutlookTitle("Tannlege (edvard og Ingvild)", members)).toEqual({ title: "Tannlege", participantIds: ["e", "i"] });
  });

  it("lar vanlige parenteser være", () => {
    expect(parseOutlookTitle("Møte (Teams)", members)).toEqual({ title: "Møte (Teams)", participantIds: null });
    expect(parseOutlookTitle("Middag", members)).toEqual({ title: "Middag", participantIds: null });
  });
});

describe("app → Outlook", () => {
  it("sender Oslo-tid, kategori og app-id", () => {
    const body = toGraphEvent(
      {
        id: "abc",
        title: "Fotball",
        start: "2026-10-14T15:00:00.000Z",
        end: "2026-10-14T16:30:00.000Z",
        allDay: false,
        location: "Banen",
        notes: null,
        categoryId: "skole",
        participantIds: ["e"],
      },
      members,
      categories
    );
    expect(body).toMatchObject({
      subject: "Fotball (Edvard)",
      start: { dateTime: "2026-10-14T17:00:00", timeZone: "W. Europe Standard Time" },
      end: { dateTime: "2026-10-14T18:30:00", timeZone: "W. Europe Standard Time" },
      isAllDay: false,
      location: { displayName: "Banen" },
      categories: ["Skole og SFO"],
      transactionId: "abc",
    });
  });

  it("heldag går fra midnatt til midnatt i Oslo", () => {
    const body = toGraphEvent(
      { title: "Høstferie", start: "2026-10-04T22:00:00.000Z", end: "2026-10-09T22:00:00.000Z", allDay: true, location: null, notes: null, categoryId: null, participantIds: ["f"] },
      members,
      categories
    );
    expect(body.start.dateTime).toBe("2026-10-05T00:00:00");
    expect(body.end.dateTime).toBe("2026-10-10T00:00:00");
  });
});

describe("Outlook → app", () => {
  it("leser UTC-tid, deltakere og kategori", () => {
    const ev = fromGraphEvent(
      {
        id: "x",
        subject: "Fotball (Olav)",
        start: { dateTime: "2026-10-14T15:00:00.0000000", timeZone: "UTC" },
        end: { dateTime: "2026-10-14T16:00:00.0000000", timeZone: "UTC" },
        categories: ["trening"],
        body: { contentType: "html", content: "<p>Ta med&nbsp;drikke</p>" },
      },
      { members, categories }
    );
    expect(ev).toEqual({
      title: "Fotball",
      start: "2026-10-14T15:00:00.000Z",
      end: "2026-10-14T16:00:00.000Z",
      allDay: false,
      location: null,
      notes: "Ta med drikke",
      categoryId: "trening",
      participantIds: ["o"],
    });
  });

  it("ny hendelse uten navn blir Felles og «Annet»", () => {
    const ev = fromGraphEvent(
      { id: "x", subject: "Foreldremøte", start: { dateTime: "2026-10-14T16:00:00", timeZone: "UTC" }, end: { dateTime: "2026-10-14T17:00:00", timeZone: "UTC" } },
      { members, categories }
    );
    expect(ev?.participantIds).toEqual(["f"]);
    expect(ev?.categoryId).toBe("annet");
  });

  it("beholder deltakere og kategori fra appen når Outlook ikke sier noe", () => {
    const ev = fromGraphEvent(
      { id: "x", subject: "Foreldremøte", start: { dateTime: "2026-10-14T16:00:00", timeZone: "UTC" }, end: { dateTime: "2026-10-14T17:00:00", timeZone: "UTC" } },
      { members, categories, current: { participantIds: ["i", "m"], categoryId: "skole" } }
    );
    expect(ev?.participantIds).toEqual(["i", "m"]);
    expect(ev?.categoryId).toBe("skole");
  });

  it("heldag: både flytende midnatt og midnatt omregnet til UTC gir riktig dag", () => {
    const floating = fromGraphEvent(
      { id: "x", subject: "Ferie", isAllDay: true, start: { dateTime: "2026-10-05T00:00:00", timeZone: "UTC" }, end: { dateTime: "2026-10-10T00:00:00", timeZone: "UTC" } },
      { members, categories }
    );
    const converted = fromGraphEvent(
      { id: "x", subject: "Ferie", isAllDay: true, start: { dateTime: "2026-10-04T22:00:00", timeZone: "UTC" }, end: { dateTime: "2026-10-09T22:00:00", timeZone: "UTC" } },
      { members, categories }
    );
    const expected = { start: "2026-10-04T22:00:00.000Z", end: "2026-10-09T22:00:00.000Z", allDay: true };
    expect(floating).toMatchObject(expected);
    expect(converted).toMatchObject(expected);
  });

  it("kategorier matches uten hensyn til store bokstaver", () => {
    expect(categoryFromOutlook(["SKOLE OG SFO"], categories)).toBe("skole");
    expect(categoryFromOutlook(["Ukjent"], categories)).toBeNull();
  });
});

describe("presetForColor", () => {
  it("velger nærmeste Outlook-farge", () => {
    expect(presetForColor("#4fb071")).toBe("preset4");
    expect(presetForColor("#4f97d9")).toBe("preset7");
    expect(presetForColor("#a39e93")).toBe("preset12");
    expect(presetForColor("#e26d5a")).toBe("preset0");
  });
});

describe("felt Outlook ikke sender med", () => {
  it("beholder notat og sted fra appen", () => {
    const ev = fromGraphEvent(
      { id: "x", subject: "Middag", start: { dateTime: "2026-10-14T16:00:00", timeZone: "UTC" }, end: { dateTime: "2026-10-14T17:00:00", timeZone: "UTC" } },
      { members, categories, current: { participantIds: ["f"], categoryId: null, notes: "Ta med kake", location: "Hjemme" } }
    );
    expect(ev).toMatchObject({ notes: "Ta med kake", location: "Hjemme" });
  });
});

describe("outlookFingerprint", () => {
  const sent = toGraphEvent(
    { id: "a", title: "Fotball", start: "2026-10-14T15:00:00.000Z", end: "2026-10-14T16:00:00.000Z", allDay: false, location: "Banen", notes: "Ta med  drikke", categoryId: "trening", participantIds: ["o"] },
    members,
    categories
  );

  it("er likt for det vi sender og det Outlook sender tilbake", () => {
    const back = {
      subject: "Fotball (Olav)",
      start: { dateTime: "2026-10-14T15:00:00.0000000", timeZone: "UTC" },
      end: { dateTime: "2026-10-14T16:00:00.0000000", timeZone: "UTC" },
      isAllDay: false,
      location: { displayName: "Banen" },
      body: { contentType: "html", content: "<html><body><p>Ta med drikke</p></body></html>" },
      categories: ["Trening"],
    };
    expect(outlookFingerprint(back)).toBe(outlookFingerprint(sent));
  });

  it("endrer seg når noe synlig endres", () => {
    expect(outlookFingerprint({ ...sent, subject: "Håndball (Olav)" })).not.toBe(outlookFingerprint(sent));
  });

  it("heldag: flytende midnatt og omregnet midnatt gir samme avtrykk", () => {
    const a = { subject: "Ferie", isAllDay: true, start: { dateTime: "2026-10-05T00:00:00", timeZone: "Europe/Oslo" }, end: { dateTime: "2026-10-10T00:00:00", timeZone: "Europe/Oslo" } };
    const b = { subject: "Ferie", isAllDay: true, start: { dateTime: "2026-10-04T22:00:00", timeZone: "UTC" }, end: { dateTime: "2026-10-09T22:00:00", timeZone: "UTC" } };
    expect(outlookFingerprint(a)).toBe(outlookFingerprint(b));
  });
});
