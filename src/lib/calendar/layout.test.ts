import { describe, expect, it } from "vitest";
import { layoutLanes } from "./layout";

type E = { id: string; s: number; e: number };
const run = (items: E[]) =>
  Object.fromEntries(layoutLanes(items, (i) => i.s, (i) => i.e).map((p) => [p.item.id, [p.lane, p.lanes]]));

describe("layoutLanes", () => {
  it("ikke-overlappende får full bredde", () => {
    expect(run([{ id: "a", s: 0, e: 60 }, { id: "b", s: 60, e: 120 }])).toEqual({ a: [0, 1], b: [0, 1] });
  });

  it("overlappende deler bredden, og ledig bane gjenbrukes", () => {
    expect(
      run([
        { id: "a", s: 0, e: 120 },
        { id: "b", s: 30, e: 60 },
        { id: "c", s: 60, e: 90 },
        { id: "d", s: 200, e: 260 },
      ])
    ).toEqual({ a: [0, 2], b: [1, 2], c: [1, 2], d: [0, 1] });
  });
});

describe("layoutLanes med maks tre side om side", () => {
  it("fjerde samtidige aktivitet skjules, de tre første deler bredden", () => {
    const placed = layoutLanes(
      [
        { id: "a", s: 0, e: 60 },
        { id: "b", s: 0, e: 60 },
        { id: "c", s: 0, e: 60 },
        { id: "d", s: 10, e: 50 },
      ],
      (i) => i.s,
      (i) => i.e,
      3
    );
    const byId = Object.fromEntries(placed.map((p) => [p.item.id, p]));
    expect(byId.d.hidden).toBe(true);
    expect([byId.a, byId.b, byId.c].every((p) => !p.hidden && p.lanes === 3)).toBe(true);
    expect(new Set(placed.map((p) => p.cluster)).size).toBe(1);
  });
});
