import { describe, expect, it } from "vitest";
import { area, doorGap, doorSwing, FLOORS, labelLines, roomLook } from "./floorplan";
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

  it("har samme areal som på plantegningene (innenfor 8 %)", () => {
    // m² fra A22-105 og A22-106. Hovedsoverommet er Sov 01 + Garderobe.
    const drawing: Record<string, number> = {
      "bad-stort": 7.8, master: 13.4 + 7.4, "kontor-1": 7.3, vaskerom: 5.4, toalett: 2.0, "bad-lite": 4.5, teknisk: 7.7,
      "sov-venstre": 7.2, "sov-hoyre": 7.2, lekerom: 13.5, gang: 8.7, stue: 31.0, spisestue: 22.5, kjokken: 23.3, "kontor-2": 9.6, "bod-2": 2.7,
    };
    for (const [room, m2] of Object.entries(drawing)) {
      const total = FLOORS.flatMap((f) => f.shapes.filter((s) => s.room === room)).reduce((sum, s) => sum + area(s.pts), 0);
      expect(Math.abs(total - m2) / m2, `${room}: ${total.toFixed(1)} m²`).toBeLessThan(0.08);
    }
  });

  it("har dørene i veggene, med blad like bredt som åpningen", () => {
    for (const f of FLOORS) {
      for (const d of f.doors) {
        const [x, y, w, h] = doorGap(d);
        const inside = f.footprint.some(([x0, y0, x1, y1]) => x >= x0 - 0.05 && y >= y0 - 0.05 && x + w <= x1 + 0.05 && y + h <= y1 + 0.05);
        expect(inside, `${f.name} ${d.wall}${d.at}`).toBe(true);
        expect(d.to - d.from).toBeGreaterThan(0.6);
        for (const { leaf, arc } of doorSwing(d)) {
          expect(Math.hypot(leaf[1][0] - leaf[0][0], leaf[1][1] - leaf[0][1])).toBeCloseTo(arc.r);
        }
      }
    }
  });

  it("tegner slagdører med bladet åpent mot riktig side", () => {
    const [swing] = doorSwing({ wall: "v", at: 2, from: 3, to: 3.8, t: 0.1, hinge: "from", side: 1 });
    expect(swing.leaf).toEqual([
      [2, 3],
      [2.8, 3],
    ]);
    expect(swing.arc.to).toEqual([2, 3.8]);
    expect(doorSwing({ wall: "h", at: 5, from: 0, to: 1.6, t: 0.3, hinge: "both", side: -1 })).toHaveLength(2);
    expect(doorSwing({ wall: "h", at: 5, from: 0, to: 1.2, t: 0.1, slide: true })).toEqual([]);
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

describe("roomLook med røykvarsler", () => {
  it("gjør rommet rødt og legger 🚨 først når røykvarsleren går", () => {
    const look = roomLook(room({ fire: true }), new Set());
    expect(look).toEqual({ glow: 0, badges: ["🚨"], alert: true });
  });
});

describe("Taket, Terrasse og Balkong", () => {
  it("har lys, høyttalere og vanning i riktig rom, og Taket som egen etasje", () => {
    const byId = new Map(ROOMS.map((r) => [r.id, r]));
    expect(byId.get("taket")).toMatchObject({ lights: [{ id: "light.taket_taket" }], speakers: ["media_player.taket_taket"], valves: ["valve.taket"] });
    expect(byId.get("terrasse")?.lights?.map((l) => l.id)).toEqual(["light.terrasse_utelys", "light.tak_terrasse_utelys", "light.terrasse_terrasse"]);
    expect(byId.get("terrasse")?.speakers).toEqual(["media_player.terrassen_terrassen"]);
    expect(byId.get("balkong")?.lights?.map((l) => l.id)).toEqual(["light.utelys_flauta"]);
    expect(byId.get("ute")?.lights?.some((l) => l.id === "light.utelys_flauta")).toBe(false);
    expect(byId.has("takterrasse")).toBe(false);
    expect(FLOORS.map((f) => f.name)).toEqual(["1. etasje", "2. etasje", "Taket"]);
  });
});
