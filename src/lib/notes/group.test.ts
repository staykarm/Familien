import { describe, expect, it } from "vitest";
import { groupNotes, noteTimeLabel } from "./group";
import type { NoteSummary } from "./types";

const NOW = new Date("2026-10-13T12:00:00Z");
const note = (id: string, updatedAt: string, pinned = false): NoteSummary => ({
  id,
  title: id,
  preview: "",
  ownerId: null,
  pinned,
  updatedAt,
  deletedAt: null,
  checklist: { done: 0, total: 0 },
});

describe("groupNotes", () => {
  it("festet først, så etter alder", () => {
    const groups = groupNotes(
      [
        note("a", "2026-10-13T09:00:00Z"),
        note("b", "2026-10-12T09:00:00Z"),
        note("c", "2026-10-08T09:00:00Z"),
        note("d", "2026-09-20T09:00:00Z"),
        note("e", "2026-03-01T09:00:00Z"),
        note("p", "2026-01-01T09:00:00Z", true),
      ],
      NOW
    );
    expect(groups.map((g) => g.title)).toEqual(["📌 Festet", "I dag", "I går", "Forrige 7 dager", "Forrige 30 dager", "Mars"]);
  });
});

describe("noteTimeLabel", () => {
  it("klokkeslett i dag, ellers ukedag/dato", () => {
    expect(noteTimeLabel("2026-10-13T09:05:00Z", NOW)).toBe("11:05");
    expect(noteTimeLabel("2026-10-12T09:05:00Z", NOW)).toBe("i går");
    expect(noteTimeLabel("2026-10-09T09:05:00Z", NOW)).toBe("fredag");
    expect(noteTimeLabel("2026-09-01T09:05:00Z", NOW)).toMatch(/^1\. sep/);
  });
});
