import { describe, expect, it } from "vitest";
import { area, FLOORS } from "./floorplan";
import { ROOMS } from "./rooms";
import { groupByPlace, inside, placeOf, placeRoom, SITE, SITE_PLACES, SITE_VIEWBOX, siteDeviceLook } from "./site";

describe("uteområdet", () => {
  it("har Hus C, nabohusene og flatene innenfor tomta", () => {
    for (const [x0, y0, x1, y1] of FLOORS[0].footprint) {
      expect(inside([x0, y0], SITE.boundary) && inside([x1, y1], SITE.boundary)).toBe(true);
    }
    for (const h of SITE.houses) expect(inside(h.at, SITE.boundary), h.name).toBe(true);
    for (const g of [...SITE.green, ...SITE.paving]) expect(g.filter((p) => inside(p, SITE.boundary)).length / g.length).toBeGreaterThan(0.8);
  });

  it("viser vår del av tomta: Hus C innenfor, Hus A og Hus B utenfor", () => {
    for (const [x0, y0, x1, y1] of FLOORS[0].footprint) expect(inside([x0, y0], SITE.lot) && inside([x1, y1], SITE.lot)).toBe(true);
    for (const h of SITE.houses) expect(inside(h.at, SITE.lot), h.name).toBe(false);
  });

  it("er tegnet i riktig målestokk (tomta er ca. 2 300 m²) og får plass i utsnittet", () => {
    expect(area(SITE.boundary)).toBeGreaterThan(2000);
    expect(area(SITE.boundary)).toBeLessThan(2600);
    for (const [x, y] of SITE.lot) {
      expect(x > SITE_VIEWBOX.x && x < SITE_VIEWBOX.x + SITE_VIEWBOX.w && y > SITE_VIEWBOX.y && y < SITE_VIEWBOX.y + SITE_VIEWBOX.h).toBe(true);
    }
  });

  it("har lys og ventiler på tomta, og lysene hører til «Hage og inngang» i romkartet", () => {
    const ute = ROOMS.find((r) => r.id === "ute")!;
    const uteLights = new Set((ute.lights ?? []).map((l) => l.id));
    for (const d of SITE.devices) {
      expect(inside(d.at, SITE.lot), d.name).toBe(true);
      if (d.kind === "lys") expect(uteLights.has(d.entity), d.entity).toBe(true);
      else expect(d.entity).toMatch(/^valve\./);
    }
    expect(SITE.rainbed).toEqual([]);
    expect(SITE.labels.some((l) => l.text === "Regnbed")).toBe(false);
  });

  it("viser lys med glorie etter lysstyrken og ventiler som vanner", () => {
    const light = (on: boolean, brightness: number | null, available = true) => ({ id: "light.utelys_inngang_nord", name: "", on, brightness, available }) as never;
    const lights = new Map([["light.utelys_inngang_nord", light(true, 50)]]);
    const valves = new Map([["valve.vest", { id: "valve.vest", open: true, available: true } as never]]);
    const nord = SITE.devices.find((d) => d.entity === "light.utelys_inngang_nord")!;
    const vest = SITE.devices.find((d) => d.entity === "valve.vest")!;
    expect(siteDeviceLook(nord, lights, valves)).toEqual({ on: true, level: 0.5, available: true });
    expect(siteDeviceLook(vest, lights, valves)).toEqual({ on: true, level: 1, available: true });
    expect(siteDeviceLook(vest, lights, new Map())).toEqual({ on: false, level: 0, available: false });
  });

  it("sorterer utelysene etter stedene på kartet, med resten sist", () => {
    expect(SITE_PLACES).toEqual(["Bedd vest", "Skog sør", "Baksiden", "Inngang nord", "Inngang sør"]);
    expect(placeOf("light.utelys_bakside_v_lekerom")).toBe("Baksiden");
    expect(placeOf("light.snuplassen_snuplassen")).toBeNull();
    const lights = [{ id: "light.snuplassen_snuplassen" }, { id: "light.utelys_inngang_sor" }, { id: "light.bedd_vest_bedd_vest" }];
    expect(groupByPlace(lights).map((g) => [g.place, g.lights.map((l) => l.id)])).toEqual([
      ["Bedd vest", ["light.bedd_vest_bedd_vest"]],
      ["Inngang sør", ["light.utelys_inngang_sor"]],
      [null, ["light.snuplassen_snuplassen"]],
    ]);
    expect(groupByPlace([{ id: "light.stue" }])).toEqual([{ place: null, lights: [{ id: "light.stue" }] }]);
  });

  it("åpner ett sted ute med bare lysene der", () => {
    const light = (id: string) => ({ id, name: id, on: false, available: true, brightness: 0, dimmable: true, kelvin: null });
    const ute = { id: "ute", name: "Hage og inngang", outdoor: true, floor: null, lights: [light("light.utelys_bakside_v_lekerom"), light("light.snuplassen_snuplassen")], scenes: [], climate: null, covers: [], speakers: [] };
    expect(placeRoom("Baksiden", ute)?.lights.map((l) => l.id)).toEqual(["light.utelys_bakside_v_lekerom"]);
    expect(placeRoom("Baksiden", ute)?.name).toBe("Baksiden");
    expect(placeRoom("Skog sør", ute)).toBeUndefined();
  });
});
