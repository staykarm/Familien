import { describe, expect, it } from "vitest";
import { dueLabel, groupTasks, sectionFor } from "./group";
import type { Task } from "./types";

const TODAY = "2026-10-13"; // tirsdag

const task = (p: Partial<Task>): Task => ({
  id: p.id ?? Math.random().toString(),
  title: p.title ?? "Oppgave",
  notes: null,
  assigneeId: null,
  categoryId: null,
  dueDate: null,
  dueTime: null,
  status: "todo",
  completedAt: null,
  ...p,
});

describe("sectionFor", () => {
  it("plasserer etter frist", () => {
    expect(sectionFor(task({ dueDate: "2026-10-12" }), TODAY)).toBe("overdue");
    expect(sectionFor(task({ dueDate: TODAY }), TODAY)).toBe("today");
    expect(sectionFor(task({ dueDate: "2026-10-14" }), TODAY)).toBe("tomorrow");
    expect(sectionFor(task({ dueDate: "2026-10-18" }), TODAY)).toBe("week"); // søndag
    expect(sectionFor(task({ dueDate: "2026-10-19" }), TODAY)).toBe("later");
    expect(sectionFor(task({}), TODAY)).toBe("none");
    expect(sectionFor(task({ dueDate: "2026-10-01", status: "done" }), TODAY)).toBe("done");
  });
});

describe("groupTasks", () => {
  it("sorterer pågående først og deretter etter klokkeslett", () => {
    const groups = groupTasks(
      [
        task({ id: "a", dueDate: TODAY, dueTime: "18:00" }),
        task({ id: "b", dueDate: TODAY, dueTime: "08:00" }),
        task({ id: "c", dueDate: TODAY, status: "doing" }),
      ],
      TODAY
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["c", "b", "a"]);
  });

  it("ferdige sist, nyeste først", () => {
    const groups = groupTasks(
      [
        task({ id: "x", status: "done", completedAt: "2026-10-10T10:00:00Z" }),
        task({ id: "y", status: "done", completedAt: "2026-10-12T10:00:00Z" }),
        task({ id: "z" }),
      ],
      TODAY
    );
    expect(groups.map((g) => g.key)).toEqual(["none", "done"]);
    expect(groups[1].tasks.map((t) => t.id)).toEqual(["y", "x"]);
  });
});

describe("dueLabel", () => {
  it("lager vennlige tekster", () => {
    expect(dueLabel({ dueDate: TODAY, dueTime: "18:00:00" }, TODAY)).toBe("i dag kl. 18:00");
    expect(dueLabel({ dueDate: "2026-10-14", dueTime: null }, TODAY)).toBe("i morgen");
    expect(dueLabel({ dueDate: "2026-10-11", dueTime: null }, TODAY)).toBe("for 2 dager siden");
    expect(dueLabel({ dueDate: "2026-10-16", dueTime: null }, TODAY)).toBe("fredag");
    expect(dueLabel({ dueDate: "2026-11-02", dueTime: null }, TODAY)).toMatch(/^man\.? 2\. nov/);
    expect(dueLabel({ dueDate: null, dueTime: null }, TODAY)).toBeNull();
  });
});
