import { describe, expect, it } from "vitest";
import { eventFormSchema } from "@/lib/validation/event";
import { taskFormSchema } from "@/lib/validation/task";
import { applyPeople, eventSuggestionToForm, taskSuggestionToForm } from "./map";
import { buildExtractionSchema } from "./schema";

const members = [
  { id: "8d0f3c8e-6b7a-4c51-9a8e-2f9b1a3c4d51", name: "Edvard" },
  { id: "8d0f3c8e-6b7a-4c51-9a8e-2f9b1a3c4d52", name: "Olav" },
  { id: "8d0f3c8e-6b7a-4c51-9a8e-2f9b1a3c4d55", name: "Felles" },
];
const categories = [{ id: "8d0f3c8e-6b7a-4c51-9a8e-2f9b1a3c4d60", name: "Skole" }];
const felles = members[2].id;

const base = {
  title: "Foreldremøte",
  date: "2026-10-20",
  endDate: null,
  startTime: "18:00",
  endTime: "19:30",
  allDay: false,
  location: "Klasserommet",
  notes: null,
  participants: ["Edvard"],
  category: "Skole",
};

describe("eventSuggestionToForm", () => {
  it("kobler navn og kategori, regner varighet, og gir gyldig skjema", () => {
    const form = eventSuggestionToForm(base, members, categories, felles);
    expect(form.participantIds).toEqual([members[0].id]);
    expect(form.categoryId).toBe(categories[0].id);
    expect(form.durationMinutes).toBe(90);
    const parsed = eventFormSchema.parse(form);
    expect(parsed.start).toBe("2026-10-20T16:00:00.000Z");
    expect(parsed.end).toBe("2026-10-20T17:30:00.000Z");
  });

  it("uten kjente deltakere og uten klokkeslett: Felles og heldag", () => {
    const form = eventSuggestionToForm(
      { ...base, participants: ["Ukjent"], startTime: null, endTime: null, allDay: false, endDate: "2026-10-22" },
      members,
      categories,
      felles
    );
    expect(form.participantIds).toEqual([felles]);
    expect(form.allDay).toBe(true);
    expect(eventFormSchema.parse(form).end).toBe("2026-10-22T22:00:00.000Z");
  });

  it("ugyldig slutt-tid gir 60 min", () => {
    expect(eventSuggestionToForm({ ...base, endTime: "17:00" }, members, categories, felles).durationMinutes).toBe(60);
  });
});

describe("taskSuggestionToForm", () => {
  it("kobler ansvarlig og dropper klokkeslett uten dato", () => {
    const form = taskSuggestionToForm({ title: "Ta med matpakke", dueDate: null, dueTime: "08:00", assignee: "olav", notes: null }, members);
    expect(form.assigneeId).toBe(members[1].id);
    expect(form.dueTime).toBeNull();
    expect(taskFormSchema.safeParse(form).success).toBe(true);
  });
});

describe("buildExtractionSchema", () => {
  it("godtar ukjente navn (kobles bort senere) så ett feil navn ikke ødelegger hele svaret", () => {
    const schema = buildExtractionSchema(["Edvard", "Olav"], ["Skole"]);
    const ok = { summary: "x", events: [{ ...base, participants: ["Per"] }], tasks: [], shopping: [] };
    expect(schema.safeParse(ok).success).toBe(true);
    expect(schema.safeParse({ ...ok, events: [{ ...base, date: undefined }] }).success).toBe(false);
  });
});

describe("applyPeople", () => {
  const items = {
    events: [{ title: "Tur", participants: ["Felles"] }],
    tasks: [
      { title: "Gymtøy", assignee: "Olav" },
      { title: "Svarslipp", assignee: null },
    ],
  };

  it("setter valgt person på alt", () => {
    const r = applyPeople(items, ["Edvard"]);
    expect(r.events[0].participants).toEqual(["Edvard"]);
    expect(r.tasks.map((t) => t.assignee)).toEqual(["Edvard", "Edvard"]);
  });

  it("beholder Claude sin ansvarlige når den er blant de valgte", () => {
    const r = applyPeople(items, ["Edvard", "Olav"]);
    expect(r.events[0].participants).toEqual(["Edvard", "Olav"]);
    expect(r.tasks.map((t) => t.assignee)).toEqual(["Olav", "Edvard"]);
  });

  it("tom liste endrer ingenting", () => {
    expect(applyPeople(items, [])).toBe(items);
  });
});
