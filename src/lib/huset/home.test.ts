import { describe, expect, it } from "vitest";
import { lightsOn, roomBrightness, stepTarget, toHome, type Light } from "./home";
import type { RoomConfig } from "./rooms";

const s = (entity_id: string, state: string, attributes: Record<string, unknown> = {}) => ({ entity_id, state, attributes });

const rooms: RoomConfig[] = [
  {
    id: "stue",
    name: "Stue",
    lights: [
      { id: "light.stue_kap", name: "KAP" },
      { id: "light.stue_lampe", name: "Lampe" },
    ],
    scenePrefix: "stue_stue",
    climate: "climate.varme_stue",
    humidity: "sensor.stue_fukt",
    covers: [{ id: "cover.persienne_stue", name: "Stue" }],
  },
  { id: "terrasse", name: "Ute", outdoor: true, lights: [{ id: "light.taket_taket", name: "Taket" }] },
];

const states = [
  s("light.stue_kap", "on", { supported_color_modes: ["brightness"], brightness: 38 }),
  s("light.stue_lampe", "off", { supported_color_modes: ["color_temp"], min_color_temp_kelvin: 2202, max_color_temp_kelvin: 4504 }),
  s("light.taket_taket", "on", { supported_color_modes: ["color_temp", "xy"], is_hue_group: true, lights: ["Lyslist 1", "Lyslist 2"], brightness: 255 }),
  s("light.taket_lyslist_1", "on", { friendly_name: "Lyslist 1", supported_color_modes: ["xy"] }),
  s("light.stue_stue", "on", { friendly_name: "Stue", is_hue_group: true }),
  s("light.garasje", "off", { friendly_name: "Garasje", supported_color_modes: ["onoff"] }),
  s("light.borte", "unavailable", { friendly_name: "Borte" }),
  s("scene.stue_stue_lyst", "unknown", { name: "Lyst", group_name: "Stue" }),
  s("scene.stue_stue_dimmet", "unknown", { friendly_name: "Stue Dimmet", group_name: "Stue" }),
  s("scene.stue_stue_ny_scene", "unknown", { name: "Ny scene" }),
  s("scene.stue_stue_ny_scene_2", "unknown", { name: "Ny scene" }),
  s("scene.taket_taket_kveld", "unknown", { name: "Taket Kveld", group_name: "Taket" }),
  s("scene.terrasse_terrasse_kveld", "unknown", { name: "kveld", group_name: "Terrasse" }),
  s("climate.varme_stue", "heat", { current_temperature: 22.2, temperature: 22.8, min_temp: 5, max_temp: 30, hvac_action: "heating" }),
  s("sensor.stue_fukt", "41.0"),
  s("cover.persienne_stue", "open", { current_position: 100 }),
  s("sensor.ute_temperatur", "5.21"),
];

describe("toHome", () => {
  const home = toHome(states, rooms);

  it("leser lys med lysstyrke i prosent og fargetemperatur", () => {
    const [kap, lampe] = home.rooms[0].lights;
    expect(kap).toMatchObject({ name: "KAP", on: true, brightness: 15, dimmable: true, kelvin: null });
    expect(lampe).toMatchObject({ on: false, brightness: 0, kelvin: { value: null, min: 2202, max: 4504 } });
  });

  it("samler scener, varme, fukt og persienner i rommet", () => {
    const stue = home.rooms[0];
    expect(stue.scenes.map((x) => x.name)).toEqual(["Dimmet", "Lyst", "Ny scene"]);
    expect(stue.climate).toMatchObject({ current: 22.2, target: 22.8, heating: true, humidity: 41 });
    expect(stue.covers).toEqual([{ id: "cover.persienne_stue", name: "Stue", available: true, position: 100, moving: null }]);
    expect(home.outdoorTemp).toBe(5.21);
    // Flere Hue-grupper i samme rom: gruppenavnet står foran, så like scenenavn ikke slås sammen.
    expect(home.rooms[1].scenes.map((x) => x.name)).toEqual(["Taket: Kveld", "Terrasse: Kveld"]);
  });

  it("legger ukjente lys i «Andre lys», men ikke Hue-grupper, lys i en gruppe i kartet eller lys som ikke svarer", () => {
    const andre = home.rooms.find((r) => r.id === "andre");
    expect(andre?.lights.map((x) => x.name)).toEqual(["Garasje"]);
    expect(andre?.lights[0]).toMatchObject({ dimmable: false, brightness: null });
  });

  it("finner lysene som er på", () => {
    expect(lightsOn(home.rooms).map((x) => x.id)).toEqual(["light.stue_kap", "light.taket_taket"]);
  });
});

describe("stepTarget", () => {
  const climate = { id: "c", name: "Stue", available: true, current: 22, target: 22.8, min: 5, max: 23, heating: false, humidity: null, floor: null };

  it("går i halve grader og holder seg innenfor grensene", () => {
    expect(stepTarget(climate, 0.5)).toBe(23);
    expect(stepTarget(climate, -0.5)).toBe(22.5);
    expect(stepTarget({ ...climate, target: 23 }, 0.5)).toBe(23);
    expect(stepTarget({ ...climate, target: null }, 0.5)).toBeNull();
  });
});

describe("roomBrightness", () => {
  const light = (on: boolean, brightness: number | null, dimmable = true): Light => ({
    id: "light.x", name: "x", on, available: true, brightness, dimmable, kelvin: null,
  });

  it("tar snittet av lysene som er på, og gir 0 når alt er av", () => {
    expect(roomBrightness([light(true, 20), light(true, 60), light(false, 0)])).toBe(40);
    expect(roomBrightness([light(false, 0), light(false, 0)])).toBe(0);
    expect(roomBrightness([light(true, null, false)])).toBe(100);
  });
});
