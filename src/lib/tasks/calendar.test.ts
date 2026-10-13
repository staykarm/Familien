import { describe, expect, it } from "vitest";
import { taskToCalendarItem } from "./calendar";
import type { Task } from "./types";

const base: Task = {
  id: "t1",
  title: "Pakke gymtøy",
  notes: null,
  assigneeId: "olav",
  categoryId: null,
  dueDate: "2026-10-14",
  dueTime: null,
  status: "todo",
  completedAt: null,
};

describe("taskToCalendarItem", () => {
  it("heldag på fristdagen i Oslo", () => {
    const item = taskToCalendarItem(base, "felles")!;
    expect(item.id).toBe("task:t1");
    expect(item.allDay).toBe(true);
    expect(item.start).toBe("2026-10-13T22:00:00.000Z");
    expect(item.end).toBe("2026-10-14T22:00:00.000Z");
    expect(item.participantIds).toEqual(["olav"]);
    expect(item.title).toBe("⬜ Pakke gymtøy");
  });

  it("med klokkeslett blir en kort boks, og uten ansvarlig havner hos Felles", () => {
    const item = taskToCalendarItem({ ...base, assigneeId: null, dueTime: "18:00", status: "done" }, "felles")!;
    expect(item.allDay).toBe(false);
    expect(item.start).toBe("2026-10-14T16:00:00.000Z");
    expect(item.end).toBe("2026-10-14T16:30:00.000Z");
    expect(item.participantIds).toEqual(["felles"]);
    expect(item.title.startsWith("✅")).toBe(true);
  });

  it("uten frist vises ikke", () => {
    expect(taskToCalendarItem({ ...base, dueDate: null }, "felles")).toBeNull();
  });
});
