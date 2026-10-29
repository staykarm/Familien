import { describe, expect, it } from "vitest";
import { goodNight, houseStatus, outdoorOff } from "./dashboard";
import type { Climate, HomeState, Light, Room } from "./home";
import type { Robot } from "./robots";
import type { Valve } from "./watering";

const light = (id: string, on: boolean, available = true): Light => ({ id, name: "Lys", on, available, brightness: on ? 40 : 0, dimmable: true, kelvin: null });
const room = (id: string, over: Partial<Room> = {}): Room => ({ id, name: id, outdoor: false, floor: 1, lights: [], scenes: [], climate: null, covers: [], speakers: [], ...over });
const climate = (current: number, heating = false): Climate => ({ id: `climate.${current}`, name: "", available: true, current, target: 21, min: 5, max: 30, heating, humidity: null, floor: null });

const home: HomeState = {
  rooms: [
    room("stue", { lights: [light("light.a", true), light("light.b", false)], climate: climate(22.4, true) }),
    room("kjokken", { lights: [light("light.c", true, false)], climate: climate(20.6) }),
    room("hage", { outdoor: true, floor: null, lights: [light("light.ute", true)] }),
  ],
  sharedCovers: [],
  outdoorTemp: 4,
};

describe("God natt og utelys", () => {
  it("slår av alt lys som er på, inne og ute, og kan sette det tilbake", () => {
    const night = goodNight(home);
    expect(night.ids).toEqual(["light.a", "light.ute"]);
    expect(night.undo).toEqual([
      { kind: "light", id: "light.a", on: true, brightness: 40, kelvin: null },
      { kind: "light", id: "light.ute", on: true, brightness: 40, kelvin: null },
    ]);
  });

  it("«Utelys av» tar bare rommene ute", () => {
    expect(outdoorOff(home).ids).toEqual(["light.ute"]);
  });
});

describe("houseStatus", () => {
  const robot: Robot = { id: "vacuum.s", kind: "vacuum", name: "Støve", state: "cleaning", status: "Støvsuger", active: true, available: true, battery: 80, room: "Kjøkken", problems: [], maintenance: [] };
  const valve = (over: Partial<Valve>): Valve => ({ id: "valve.x", name: "Plen", kind: "plen", open: false, available: true, endsAt: null, minutes: 20, durationId: null, battery: 80, problem: null, ...over });

  it("gir én kort linje per område", () => {
    const rows = houseStatus(home, [robot], { valves: [valve({ available: false })], sensors: [] });
    expect(rows.map((r) => [r.area, r.value, r.active])).toEqual([
      ["lys", "1 rom inne · 1 ute", true],
      ["varme", "21–22° · varmer i 1 rom", true],
      ["roboter", "Støve støvsuger i Kjøkken", true],
      ["vanning", "Tatt inn for sesongen", false],
    ]);
  });

  it("viser feil først", () => {
    const rows = houseStatus(home, [{ ...robot, active: false, problems: ["Børsten sitter fast"] }], { valves: [valve({ problem: "Lavt batteri" })], sensors: [] });
    expect(rows.find((r) => r.area === "roboter")).toMatchObject({ value: "Støve: Børsten sitter fast", alert: true });
    expect(rows.find((r) => r.area === "vanning")).toMatchObject({ value: "Plen: Lavt batteri", alert: true });
  });
});
