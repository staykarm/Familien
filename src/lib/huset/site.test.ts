import { describe, expect, it } from "vitest";
import { area, FLOORS, type Pt } from "./floorplan";
import { SITE, SITE_VIEWBOX } from "./site";

const inside = ([x, y]: Pt, pts: Pt[]) => {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

describe("uteområdet", () => {
  it("har Hus C, nabohusene og flatene innenfor tomta", () => {
    for (const [x0, y0, x1, y1] of FLOORS[0].footprint) {
      expect(inside([x0, y0], SITE.boundary) && inside([x1, y1], SITE.boundary)).toBe(true);
    }
    for (const h of SITE.houses) expect(inside(h.at, SITE.boundary), h.name).toBe(true);
    for (const g of [...SITE.green, ...SITE.paving]) expect(g.filter((p) => inside(p, SITE.boundary)).length / g.length).toBeGreaterThan(0.8);
  });

  it("er tegnet i riktig målestokk (tomta er ca. 2 300 m²) og får plass i utsnittet", () => {
    expect(area(SITE.boundary)).toBeGreaterThan(2000);
    expect(area(SITE.boundary)).toBeLessThan(2600);
    for (const [x, y] of SITE.boundary) {
      expect(x > SITE_VIEWBOX.x && x < SITE_VIEWBOX.x + SITE_VIEWBOX.w && y > SITE_VIEWBOX.y && y < SITE_VIEWBOX.y + SITE_VIEWBOX.h).toBe(true);
    }
  });
});
