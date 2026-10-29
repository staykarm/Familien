import { describe, expect, it } from "vitest";
import { describeHome, mergeUndo, targetClimates, targetCovers, targetLights, targetRooms, undoLight } from "./agentTargets";
import type { HomeState, Light, Room } from "./home";

const light = (id: string, on: boolean, brightness: number | null = on ? 40 : 0, available = true): Light => ({
  id,
  name: id.replace("light.", ""),
  on,
  available,
  brightness,
  dimmable: brightness !== null,
  kelvin: null,
});

const room = (id: string, floor: 1 | 2 | null, lights: Light[], outdoor = false): Room => ({
  id,
  name: id,
  outdoor,
  floor,
  lights,
  scenes: [],
  climate: { id: `climate.${id}`, name: id, available: true, current: 21, target: 21.5, min: 5, max: 30, heating: false, humidity: null, floor: null },
  covers: [{ id: `cover.${id}`, name: id, available: true, position: 100, moving: null }],
});

const home: HomeState = {
  rooms: [
    room("stue", 2, [light("light.stue_a", true), light("light.stue_b", false)]),
    room("gang", 1, [light("light.gang", true), light("light.gang_borte", true, 40, false)]),
    room("lekerom", 1, [light("light.lek", false)]),
    { ...room("ute", null, [light("light.ute", true, null)], true), climate: null, covers: [] },
  ],
  sharedCovers: [{ id: "cover.felles", name: "Felles", available: true, position: null, moving: null }],
  outdoorTemp: 5,
};

describe("mål for beskjeder", () => {
  it("finner rom etter id, etasje, ute og hele huset", () => {
    expect(targetRooms(home, { rooms: ["stue"] }).map((r) => r.id)).toEqual(["stue"]);
    expect(targetRooms(home, { floors: [1] }).map((r) => r.id)).toEqual(["gang", "lekerom"]);
    expect(targetRooms(home, { floors: ["ute"] }).map((r) => r.id)).toEqual(["ute"]);
    expect(targetRooms(home, { all: true })).toHaveLength(4);
    expect(targetRooms(home, {})).toEqual([]);
  });

  it("tar bare lys som svarer, og eventuelt bare de som er på", () => {
    expect(targetLights(home, { floors: [1] }).map((x) => x.id)).toEqual(["light.gang", "light.lek"]);
    expect(targetLights(home, { floors: [1] }, true).map((x) => x.id)).toEqual(["light.gang"]);
    expect(targetLights(home, { ids: ["light.stue_b", "light.ukjent"] }).map((x) => x.id)).toEqual(["light.stue_b"]);
  });

  it("finner termostater og persienner, med fellesstyring for hele huset og 2. etasje", () => {
    expect(targetClimates(home, { rooms: ["gang"] }).map((x) => x.id)).toEqual(["climate.gang"]);
    expect(targetCovers(home, { floors: [2] }).map((x) => x.id)).toEqual(["cover.stue", "cover.felles"]);
    expect(targetCovers(home, { floors: [1] }).map((x) => x.id)).toEqual(["cover.gang", "cover.lekerom"]);
  });
});

describe("angre", () => {
  it("husker lysstyrke bare for lys som er på, og den eldste tilstanden per enhet", () => {
    const a = undoLight(light("light.a", true, 30));
    const b = undoLight(light("light.a", false));
    expect(a).toEqual({ kind: "light", id: "light.a", on: true, brightness: 30, kelvin: null });
    expect(mergeUndo([a, b])).toEqual([a]);
  });
});

describe("describeHome", () => {
  it("lister rom, lys og høyttalere med id-er, og hopper over lys som ikke svarer", () => {
    const text = describeHome(
      home,
      [{ id: "media_player.stue", name: "Stue", status: "playing", volume: 20, title: "Sang", artist: "Artist", sources: ["NRK P3"], groupMembers: ["media_player.stue"] }],
      [{ id: "p1", name: "1. etasje", speakerIds: [] }]
    );
    expect(text).toContain("- gang · gang · 1. etg");
    expect(text).toContain("gang [light.gang] på 40%");
    expect(text).not.toContain("gang_borte");
    expect(text).toContain("Stue [media_player.stue] playing «Sang – Artist», volum 20");
    expect(text).toContain("Sonos-favoritter: NRK P3");
    expect(text).toContain("FASTE GRUPPER: 1. etasje [p1]");
  });
});
