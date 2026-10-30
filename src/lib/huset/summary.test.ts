import { describe, expect, it } from "vitest";
import type { HomeState, Light, Room } from "./home";
import type { Robot } from "./robots";
import { toGroups, toSpeakers } from "./sonos";
import { summarizeHouse } from "./summary";

const light = (on: boolean, brightness: number | null = on ? 20 : 0, available = true): Light => ({
  id: `light.${Math.random()}`,
  name: "Lys",
  on,
  available,
  brightness,
  dimmable: brightness !== null,
  kelvin: null,
});
const room = (name: string, lights: Light[], outdoor = false): Room => ({
  id: name.toLowerCase(),
  name,
  outdoor,
  floor: outdoor ? null : 1,
  lights,
  scenes: [],
  climate: null,
  covers: [],
  speakers: [],
});
const robot = (over: Partial<Robot>): Robot => ({
  id: "vacuum.x",
  kind: "vacuum",
  name: "Støve 2",
  state: "docked",
  status: "Lader",
  active: false,
  available: true,
  battery: 100,
  room: null,
  problems: [],
  maintenance: [],
  ...over,
});

describe("summarizeHouse", () => {
  const home: HomeState = {
    rooms: [
      room("Stue", [light(true, 10), light(true, 30), light(false)]),
      room("Gang", [light(false), light(true, 40, false)]),
      room("Bod", [light(true, null)]),
      room("Terrasse og tak", [light(true, null)], true),
      room("Hage og inngang", [light(true, 50)], true),
    ],
    sharedCovers: [],
    outdoorTemp: null,
  };
  const groups = toGroups(
    toSpeakers([
      { entity_id: "media_player.stue", state: "playing", attributes: { device_class: "speaker", friendly_name: "Stue", media_title: "Losing My Religion", media_artist: "R.E.M." } },
      { entity_id: "media_player.wc", state: "paused", attributes: { device_class: "speaker", friendly_name: "WC", media_title: "Noe" } },
    ])
  );

  it("viser bare det som er på, per rom, med musikk på samme linje som rommet", () => {
    const { lines } = summarizeHouse(home, groups, [robot({ name: "Dustin 1", active: true, status: "Støvsuger", room: "Kjøkken" })]);
    expect(lines).toEqual([
      { name: "Stue", parts: ["lys 20 %", "musikk: Losing My Religion – R.E.M."] },
      { name: "Bod", parts: ["lys"] },
      { name: "Ute", parts: ["lys: Terrasse og tak, Hage og inngang"] },
      { name: "Dustin 1", parts: ["støvsuger i Kjøkken"] },
    ]);
  });

  it("samler feil fra robotene, og er tomt når alt er av", () => {
    const off: HomeState = { ...home, rooms: [room("Stue", [light(false)])] };
    const res = summarizeHouse(off, [], [robot({ problems: ["Lokket står åpent"] })]);
    expect(res).toMatchObject({ lines: [], alerts: ["Støve 2: Lokket står åpent"], playing: [] });
    // Samme linjer som «Huset nå» på dashboardet.
    expect(res.rows.map((r) => [r.label, r.value, r.alert])).toEqual([
      ["Lys", "Alt av", false],
      ["Roboter", "Støve 2: Lokket står åpent", true],
    ]);
  });
});
