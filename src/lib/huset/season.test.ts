import { describe, expect, it } from "vitest";
import type { Robot } from "./robots";
import { applySeason, IN_SEASON, readSeason } from "./season";

const robot = (kind: Robot["kind"]): Robot => ({ id: `x.${kind}`, kind, name: kind, state: "docked", status: "", active: false, available: true, battery: 100, room: null, problems: [], maintenance: [] });

describe("readSeason", () => {
  it("er i sesong uten lagret valg", () => {
    expect(readSeason(null)).toEqual(IN_SEASON);
    expect(readSeason("tull")).toEqual(IN_SEASON);
  });
  it("leser lagret valg, også halvt", () => {
    expect(readSeason({ mowers: false, watering: false })).toEqual({ mowers: false, watering: false });
    expect(readSeason({ watering: false })).toEqual({ mowers: true, watering: false });
  });
});

describe("applySeason", () => {
  it("merker bare klipperne og vanningen", () => {
    const out = applySeason([robot("vacuum"), robot("mower")], { valves: [], sensors: [] }, { mowers: false, watering: false });
    expect(out.robots.map((r) => !!r.resting)).toEqual([false, true]);
    expect(out.watering.resting).toBe(true);
  });
  it("lar alt være i sesong", () => {
    const out = applySeason([robot("mower")], { valves: [], sensors: [] }, IN_SEASON);
    expect(out.robots[0].resting).toBeUndefined();
    expect(out.watering.resting).toBeUndefined();
  });
});
