import { describe, expect, it } from "vitest";
import { airAlerts, airText, toAir } from "./air";
import { roomLook } from "./floorplan";
import { toHome } from "./home";

const sensor = (prefix: string, values: Record<string, [string, string]>, online = "on") => [
  { entity_id: `binary_sensor.${prefix}_tilkoblet`, state: online, attributes: { device_class: "connectivity" } },
  { entity_id: `sensor.${prefix}_signalkvalitet`, state: "19", attributes: {} },
  ...Object.entries(values).map(([cls, [suffix, value]]) => ({ entity_id: `sensor.${prefix}_${suffix}`, state: value, attributes: { device_class: cls, unit_of_measurement: cls === "volatile_organic_compounds_parts" ? "ppb" : undefined } })),
];

describe("toAir", () => {
  const states = [
    ...sensor("spisestue_luftkvalitet", { temperature: ["temperatur", "20.9"], carbon_dioxide: ["co2", "1250"], volatile_organic_compounds_parts: ["voc", "180"] }),
    ...sensor("kid_s_room_luftkvalitet_1", { temperature: ["temperatur", "21"] }),
    ...sensor("entrance_luftsensor", { temperature: ["temperatur", "19.5"] }, "off"),
  ];

  it("leser luftsensorene og knytter dem til rom fra romkartet", () => {
    const air = toAir(states);
    expect(air.map((a) => [a.name, a.roomId, a.temperature, a.co2, a.online, a.signal])).toEqual([
      ["Barnerom", null, 21, null, true, 19],
      ["Entré", "entre", 19.5, null, false, 19],
      ["Spisestue", "spisestue", 20.9, 1250, true, 19],
    ]);
    expect(air.map(airText)).toEqual(["21°", "Svarer ikke", "20,9° · CO₂ 1250 ppm · VOC 180 ppb"]);
    expect(airAlerts(air)).toEqual(["Dårlig luft i Spisestue (CO₂ 1250 ppm) – luft ut"]);
  });

  it("legger sensoren på rommet, og viser CO₂ på kartet når luften er dårlig", () => {
    const home = toHome(states);
    const spisestue = home.rooms.find((r) => r.id === "spisestue")!;
    expect(spisestue.air?.co2).toBe(1250);
    expect(home.air).toHaveLength(3);
    expect(roomLook(spisestue, new Set()).badges).toEqual(["21°", "CO₂"]);
  });
});
