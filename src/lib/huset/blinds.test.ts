import { describe, expect, it } from "vitest";
import { BLINDS, blindLook, coveredTo, slats } from "./blinds";
import { FLOORS } from "./floorplan";
import type { Cover } from "./home";
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
const inRect = ([x, y]: [number, number], [x0, y0, x1, y1]: [number, number, number, number]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

describe("solskjermingen på kartet", () => {
  it("har hver persienne i romkartet med ett vindu", () => {
    const covers = ROOMS.flatMap((r) => (r.covers ?? []).map((c) => c.id));
    for (const b of BLINDS) expect(covers, b.cover).toContain(b.cover);
    expect(new Set(BLINDS.map((b) => b.cover)).size).toBe(BLINDS.length);
  });

  it("ligger i veggen, ikke inne i et rom", () => {
    for (const b of BLINDS) {
      const floor = FLOORS.find((f) => f.id === b.floor)!;
      for (const p of [b.from, b.to, [(b.from[0] + b.to[0]) / 2, (b.from[1] + b.to[1]) / 2] as [number, number]]) {
        expect(floor.footprint.some((r) => inRect(p, r)), `${b.cover} i huset`).toBe(true);
        expect(floor.shapes.find((s) => inside(p, s.pts))?.room, `${b.cover} ikke i et rom`).toBeUndefined();
      }
    }
  });

  it("regner ut hvor langt nede persiennen er", () => {
    const b = BLINDS[0];
    const cover = (position: number | null, available = true): Cover => ({ id: b.cover, name: "X", available, position, moving: null });
    expect(blindLook(b, new Map([[b.cover, cover(100)]])).down).toBe(0);
    expect(blindLook(b, new Map([[b.cover, cover(25)]])).down).toBe(0.75);
    expect(blindLook(b, new Map([[b.cover, cover(null)]])).known).toBe(false);
    expect(blindLook(b, new Map([[b.cover, cover(0, false)]]))).toEqual({ down: 0, known: false, moving: null, available: false });
    expect(blindLook(b, new Map()).available).toBe(false);
  });

  it("tegner lameller etter hvor langt nede den er", () => {
    const b = { cover: "cover.x", floor: "1" as const, from: [0, 0] as [number, number], to: [1.1, 0] as [number, number] };
    expect(slats(b, 0)).toEqual([]);
    expect(slats(b, 1)).toHaveLength(10);
    expect(slats(b, 0.5)).toHaveLength(5);
    expect(slats(b, 1)[0]).toEqual([
      [0.055, -0.13],
      [0.055, 0.13],
    ]);
    expect(coveredTo(b, 0.5)).toEqual([0.55, 0]);
  });
});
