import { describe, expect, it } from "vitest";
import { toWatering, wateringAdvice } from "./watering";

const s = (entity_id: string, state: string, attributes: Record<string, unknown> = {}) => ({ entity_id, state, attributes });

describe("toWatering", () => {
  const w = toWatering([
    s("valve.felles_bedd", "closed", { friendly_name: "Felles bedd", battery_level: 0 }),
    s("number.felles_bedd_felles_bedd_watering_duration", "60"),
    s("sensor.felles_bedd_error", "low_battery_prevents_starting"),
    s("valve.plen_nordvest_plen_vest", "open", { friendly_name: "Plen Nordvest Plen Vest" }),
    s("number.plen_nordvest_plen_vest_watering_duration", "20"),
    s("sensor.plen_nordvest_plen_vest_watering_end", "2026-10-30T05:20:00+00:00"),
    s("sensor.plen_nordvest_plen_vest_error", "no_message"),
    s("valve.taket", "unavailable", { friendly_name: "Taket" }),
    s("sensor.sensor_vest_soil_humidity", "65", { friendly_name: "Sensor Vest Soil Humidity" }),
    s("sensor.sensor_vest_soil_temperature_soil_sensor", "6"),
    s("sensor.sensor_vest_battery_level", "78"),
  ]);

  it("leser ventiler med navn uten kontrollboksen foran, type, vanningstid, batteri og feil", () => {
    expect(w.valves.map((v) => [v.name, v.kind])).toEqual([
      ["Felles bedd", "bedd"],
      ["Plen Vest", "plen"],
      ["Taket", "tak"],
    ]);
    expect(w.valves[0]).toMatchObject({ open: false, minutes: 60, durationId: "number.felles_bedd_felles_bedd_watering_duration", battery: 0, problem: "Tomt batteri – bytt batteri" });
    expect(w.valves[1]).toMatchObject({ open: true, endsAt: "2026-10-30T05:20:00+00:00", minutes: 20, problem: null });
    expect(w.valves[2]).toMatchObject({ available: false, durationId: null });
  });

  it("leser jordsensorene", () => {
    expect(w.sensors).toEqual([{ id: "sensor.sensor_vest_soil_humidity", name: "Vest", humidity: 65, temperature: 6, battery: 78 }]);
  });
});

describe("wateringAdvice", () => {
  const sensor = (humidity: number, temperature: number) => ({ id: "x", name: "Vest", humidity, temperature, battery: null });

  it("advarer mot frost og tørr jord, og sier fra når jorda er fuktig nok", () => {
    expect(wateringAdvice([sensor(20, 15)], 20)).toEqual([{ level: "warn", text: "Vest: tørr jord (20 %). Vann i dag, helst tidlig om morgenen." }]);
    expect(wateringAdvice([sensor(65, 6)], 11).map((a) => a.level)).toEqual(["info", "ok"]);
    expect(wateringAdvice([sensor(65, 1)], null)[0].level).toBe("warn");
  });
});
