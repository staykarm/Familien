import { describe, expect, it } from "vitest";
import { FLOORS, STAIR_HEAT, type Pt } from "./floorplan";
import { FURNITURE, furnitureCenter } from "./furniture";
import { toHome } from "./home";
import { CONTROLLABLE_SWITCHES } from "./rooms";
import { houseStatus } from "./dashboard";

const inside = ([x, y]: Pt, pts: Pt[]) => {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

describe("møbler og trapper", () => {
  it("står midt i et rom i riktig etasje", () => {
    for (const f of FURNITURE) {
      const floor = FLOORS.find((x) => x.id === f.floor)!;
      expect(floor.shapes.some((s) => inside(furnitureCenter(f), s.pts)), `${f.name} (${f.floor})`).toBe(true);
    }
  });

  it("har trinnene inne i trappa, og åpningen ned i 2. etasje rett over trappa i 1. etasje", () => {
    for (const floor of FLOORS)
      for (const s of floor.stairs ?? []) {
        const [x0, y0, x1, y1] = s.box;
        for (const v of s.lines) expect(s.axis === "x" ? v > x0 && v < x1 : v > y0 && v < y1).toBe(true);
      }
    const down = FLOORS[1].stairs!.find((s) => s.kind === "ned")!;
    const below = FLOORS[0].stairs!.find((s) => s.kind === "over")!;
    expect(down.box[1]).toBe(below.box[1]);
    expect(down.box[3]).toBe(below.box[3]);
  });

  it("har utetrappa med varmekabler, og hager og innganger i 1. etasje", () => {
    expect(FLOORS[0].stairs!.filter((s) => s.heat === STAIR_HEAT)).toHaveLength(2);
    expect(FLOORS[0].shapes.filter((s) => s.room === "ute").map((s) => s.label ?? "hoved")).toEqual(["Inngang nord", "Inngang sør", "hoved"]);
  });
});

describe("varmekabler", () => {
  const states = [{ entity_id: STAIR_HEAT, state: "on", attributes: { friendly_name: "Varmekabler trapp ute" } }];

  it("står i «Hage og inngang» og er den eneste bryteren appen kan styre", () => {
    const ute = toHome(states).rooms.find((r) => r.id === "ute")!;
    expect(ute.switches).toEqual([{ id: STAIR_HEAT, name: "Varmekabler i trappa", on: true, available: true }]);
    expect([...CONTROLLABLE_SWITCHES]).toEqual([STAIR_HEAT]);
    expect(CONTROLLABLE_SWITCHES.has("switch.vaskemaskin_effekt")).toBe(false);
  });

  it("vises i «Huset nå» når de er på", () => {
    const home = toHome([...states, { entity_id: "climate.varme_stue", state: "heat", attributes: { current_temperature: 21, temperature: 21, hvac_action: "idle" } }]);
    expect(houseStatus(home, [], { valves: [], sensors: [] }).find((r) => r.area === "varme")?.value).toBe("21° · varmekabler i trappa på");
  });
});
