import { describe, expect, it } from "vitest";
import { FIXTURES, fixtureIndex, fixtureLook, labelDirection } from "./fixtures";
import { FLOORS } from "./floorplan";
import type { Light } from "./home";
import { ROOMS } from "./rooms";

/** Punkt i polygon (strålemetoden). */
const inside = ([x, y]: [number, number], pts: [number, number][]) => {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

describe("lyspunktene", () => {
  it("har unike numre per etasje", () => {
    for (const floor of ["1", "2", "tak"]) {
      const ns = FIXTURES.filter((f) => f.floor === floor).map((f) => f.n);
      expect(new Set(ns).size).toBe(ns.length);
    }
  });

  it("ligger i et rom, og lyset hører til det rommet", () => {
    for (const f of FIXTURES) {
      const floor = FLOORS.find((x) => x.id === f.floor)!;
      const shape = floor.shapes.find((s) => inside([f.x, f.y], s.pts));
      expect(shape, `punkt ${f.n}`).toBeDefined();
      if (!f.light) continue;
      const room = ROOMS.find((r) => r.id === shape!.room)!;
      expect((room.lights ?? []).map((l) => l.id), `punkt ${f.n} i ${room.id}`).toContain(f.light);
    }
  });

  it("lyser etter lysstyrken, og er av når lyset er av eller ikke svarer", () => {
    const light = (on: boolean, brightness: number | null, available = true) => ({ id: "light.x", name: "X", on, brightness, available }) as Light;
    const f = { n: 1, floor: "2" as const, x: 0, y: 0, kind: "spot" as const, light: "light.x" };
    expect(fixtureLook(f, new Map([["light.x", light(true, 40)]]))).toEqual({ on: true, level: 0.4, available: true });
    expect(fixtureLook(f, new Map([["light.x", light(true, null)]])).level).toBe(1);
    expect(fixtureLook(f, new Map([["light.x", light(false, 40)]])).on).toBe(false);
    expect(fixtureLook(f, new Map([["light.x", light(true, 40, false)]]))).toEqual({ on: false, level: 0, available: false });
    expect(fixtureLook({ ...f, light: null }, new Map()).available).toBe(false);
  });

  it("setter nummeret bort fra nærmeste nabo", () => {
    const a = { n: 1, floor: "2" as const, x: 0, y: 0, kind: "spot" as const, light: null };
    const b = { ...a, n: 2, y: 0.2 };
    expect(labelDirection(a, [a, b])).toEqual([0, -1]);
    expect(labelDirection(b, [a, b])).toEqual([0, 1]);
    expect(labelDirection(a, [a])).toEqual([0.71, -0.71]);
  });

  it("lager koblingslisten", () => {
    const { byLight, unassigned } = fixtureIndex(FIXTURES);
    expect(byLight.get("light.bod_2etg_kap")).toEqual([38, 39]);
    expect(unassigned).toEqual([13, 46]);
  });
});
