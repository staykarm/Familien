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
  it("slår av lys som er på inne, lar utelyset være, og kan sette det tilbake", () => {
    const night = goodNight(home);
    expect(night.ids).toEqual(["light.a"]);
    expect(night.undo).toEqual([{ kind: "light", id: "light.a", on: true, brightness: 40, kelvin: null }]);
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
      ["lys", "stue · ute: hage", true],
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

  it("teller ikke klippere og vanning som er av for sesongen", () => {
    const mower: Robot = { ...robot, id: "lawn_mower.k", kind: "mower", name: "Klippe øst", state: "error", active: false, problems: ["Feil"], resting: true };
    const rows = houseStatus(home, [{ ...robot, active: false }, mower], { valves: [valve({ problem: "Lavt batteri" })], sensors: [], resting: true });
    expect(rows.find((r) => r.area === "roboter")).toMatchObject({ value: "1 i ro", alert: false });
    expect(rows.find((r) => r.area === "vanning")).toMatchObject({ value: "Av for sesongen", alert: false });
  });

  it("viser luftfukteren med rommet når den melder feil", () => {
    const humidifier = { online: true, problem: true, error: "sjekk vanntanken", temperature: 21, on: null, target: null, humidity: null, text: "Feil – sjekk vanntanken" };
    const rows = houseStatus({ ...home, rooms: [...home.rooms, room("Spisestue", { humidifier })] }, [], { valves: [], sensors: [] });
    expect(rows.find((r) => r.label === "Luftfukter")).toMatchObject({ value: "Feil – sjekk vanntanken (Spisestue)", alert: true });
  });
});

describe("houseStatus med luft", () => {
  const air = (name: string, co2: number | null, temperature = 21) => ({ id: name, name, roomId: null, temperature, humidity: null, co2, voc: null, vocUnit: null, quality: null, online: true, signal: 50 });

  it("viser temperatur når sensorene bare måler det, og CO₂ med varsel når det finnes", () => {
    const only = houseStatus({ ...home, air: [air("Entré", null, 20.6), air("Spisestue", null, 21.4)] }, [], { valves: [], sensors: [] });
    expect(only.find((r) => r.label === "Luft")).toMatchObject({ value: "2 sensorer · 21°", alert: false });
    const bad = houseStatus({ ...home, air: [air("Entré", 600), air("Spisestue", 1250)] }, [], { valves: [], sensors: [] });
    expect(bad.find((r) => r.label === "Luft")).toMatchObject({ value: "CO₂ 1250 ppm i Spisestue · 21°", alert: true });
  });

  it("viser luftkvalitet og fukt fra Homely, og rommet når luften er dårlig", () => {
    const q = (name: string, quality: number, humidity: number, temperature: number) => ({ ...air(name, null, temperature), quality, humidity });
    const fine = houseStatus({ ...home, air: [q("Entré", 5, 35.3, 20.2), q("Barnerom", 5, 36.5, 20.4), q("Spisestue", 5, 38.6, 19.9)] }, [], { valves: [], sensors: [] });
    expect(fine.find((r) => r.label === "Luft")).toMatchObject({ value: "luftkvalitet 5 (utmerket) · 35–39 % · 20°", alert: false });
    const mixed = houseStatus({ ...home, air: [q("Entré", 5, 35, 20), q("Spisestue", 4, 40, 22)] }, [], { valves: [], sensors: [] });
    expect(mixed.find((r) => r.label === "Luft")).toMatchObject({ value: "luftkvalitet 4–5 (god–utmerket) · 35–40 % · 20–22°", alert: false });
    const poor = houseStatus({ ...home, air: [q("Entré", 5, 35, 20), q("Barnerom", 2, 40, 21)] }, [], { valves: [], sensors: [] });
    expect(poor.find((r) => r.label === "Luft")).toMatchObject({ value: "luftkvalitet 2 (dårlig) i Barnerom · 35–40 % · 20–21°", alert: true });
  });
});
