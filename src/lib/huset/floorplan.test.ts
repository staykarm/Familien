import { describe, expect, it } from "vitest";
import { FLOORS, labelLines, roomLook } from "./floorplan";
import type { Room } from "./home";
import { ROOMS } from "./rooms";

const room = (over: Partial<Room>): Room => ({
  id: "stue",
  name: "Stue",
  outdoor: false,
  floor: 2,
  lights: [],
  scenes: [],
  climate: null,
  covers: [],
  speakers: [],
  ...over,
});

describe("kartet", () => {
  it("bruker bare rom som finnes i romkartet, og har ett hovedfelt per rom", () => {
    const ids = new Set(ROOMS.map((r) => r.id));
    for (const f of FLOORS) {
      for (const s of f.shapes) expect(ids.has(s.room), s.room).toBe(true);
      const multi = [...new Set(f.shapes.map((s) => s.room))].filter((id) => f.shapes.filter((s) => s.room === id).length > 1);
      for (const id of multi) expect(f.shapes.filter((s) => s.room === id && s.main), id).toHaveLength(1);
    }
  });

  it("har alle rommene inne i riktig etasje", () => {
    for (const r of ROOMS.filter((x) => x.floor)) {
      expect(FLOORS.find((f) => f.id === String(r.floor))!.shapes.some((s) => s.room === r.id), r.id).toBe(true);
    }
  });

  it("deler lange navn i smale felt", () => {
    expect(labelLines("Guttas bad", 1.3)).toEqual(["Guttas", "bad"]);
    expect(labelLines("Soverom Edvard", 4.4)).toEqual(["Soverom Edvard"]);
  });
});

describe("roomLook", () => {
  const light = (on: boolean, brightness: number) => ({ id: "l", name: "Lys", on, available: true, brightness, dimmable: true, kelvin: null });

  it("gir gul farge etter lysstyrken, og merker for temperatur, varme, musikk og persienne nede", () => {
    const look = roomLook(
      room({
        lights: [light(true, 50)],
        climate: { id: "c", name: "Stue", available: true, current: 22.4, target: 22, min: 5, max: 30, heating: true, humidity: null, floor: null },
        speakers: ["media_player.stue"],
        covers: [{ id: "cover.x", name: "Stue", available: true, position: 4, moving: null }],
      }),
      new Set(["media_player.stue"])
    );
    expect(look.glow).toBeCloseTo(0.55);
    expect(look.badges).toEqual(["22°", "🔥", "🎵", "▾"]);
  });

  it("er hvit og uten merker når ingenting er på", () => {
    expect(roomLook(room({ lights: [light(false, 0)] }), new Set())).toEqual({ glow: 0, badges: [] });
    expect(roomLook(undefined, new Set())).toEqual({ glow: 0, badges: [] });
  });
});
