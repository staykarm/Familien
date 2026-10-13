import { describe, expect, it } from "vitest";
import { taskFormSchema } from "./task";

const base = {
  title: " Pakk gymtøy ",
  notes: "",
  assigneeId: null,
  categoryId: null,
  dueDate: "2026-10-14",
  dueTime: "",
  status: "todo" as const,
};

describe("taskFormSchema", () => {
  it("trimmer og gjør tomme felt om til null", () => {
    const r = taskFormSchema.parse(base);
    expect(r.title).toBe("Pakk gymtøy");
    expect(r.notes).toBeNull();
    expect(r.dueTime).toBeNull();
    expect(r.id).toBeNull();
  });

  it("krever dato når klokkeslett er satt", () => {
    expect(taskFormSchema.safeParse({ ...base, dueDate: "", dueTime: "18:00" }).success).toBe(false);
    expect(taskFormSchema.safeParse({ ...base, dueTime: "18:00" }).success).toBe(true);
  });

  it("avviser tom tittel og ukjent status", () => {
    expect(taskFormSchema.safeParse({ ...base, title: " " }).success).toBe(false);
    expect(taskFormSchema.safeParse({ ...base, status: "kanskje" }).success).toBe(false);
  });
});
