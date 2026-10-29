import { describe, expect, it } from "vitest";
import { cheapestWindow, hourlyPrices, kr, levelOf, toEnergy, toPricePoints, watt, windowLabel } from "./energy";

const st = (entity_id: string, state: string, attributes: Record<string, unknown> = {}) => ({ entity_id, state, attributes: { friendly_name: `Tibber Pulse Hjem ${entity_id}`, ...attributes } });

describe("toEnergy", () => {
  it("leser pris, effekt, forbruk og kostnad fra Tibber", () => {
    const e = toEnergy([
      st("sensor.hjem_strompris", "2.097", { min_price: 1.943, avg_price: 2.227, max_price: 2.369 }),
      st("sensor.tibber_pulse_hjem_effekt", "5633"),
      st("sensor.tibber_pulse_hjem_maksimal_effekt", "7530"),
      st("sensor.tibber_pulse_hjem_akkumulert_forbruk", "1.7"),
      st("sensor.tibber_pulse_hjem_akkumulert_kostnad", "3.58"),
      st("sensor.tibber_pulse_hjem_estimert_forbruk_i_innevaerende_time", "5.62"),
      st("sensor.hjem_manedlig_kostnad", "2826.76"),
      st("sensor.hjem_manedlig_nettoforbruk", "1624.54"),
      { entity_id: "sensor.annet_effekt", state: "10", attributes: { friendly_name: "Varmepumpe effekt" } },
    ]);
    expect(e).toMatchObject({ price: 2.097, level: "normal", min: 1.943, max: 2.369, powerW: 5633, todayKwh: 1.7, todayCost: 3.58, hourKwh: 5.62, monthCost: 2826.76, monthKwh: 1624.54 });
  });

  it("finner elbilene med batteri, rekkevidde og lading", () => {
    const car = (b: string, extra: Record<string, string>) => [
      { entity_id: `sensor.${b}_ladestatus`, state: extra.battery, attributes: { device_class: "battery", friendly_name: `${b === "q6" ? "Q6 e-tron" : "Tribe"} Ladestatus` } },
      { entity_id: `sensor.${b}_rekkevidde`, state: extra.range, attributes: {} },
      { entity_id: `binary_sensor.${b}_lader`, state: extra.charging, attributes: {} },
      { entity_id: `binary_sensor.${b}_tilkobling`, state: extra.online, attributes: {} },
    ];
    const { cars } = toEnergy([...car("tribe", { battery: "50", range: "0", charging: "unknown", online: "off" }), ...car("q6", { battery: "67", range: "286000", charging: "off", online: "on" })]);
    expect(cars.map((c) => [c.name, c.battery, c.rangeKm, c.charging, c.online])).toEqual([
      ["Q6 e-tron", 67, 286, false, true],
      ["Tribe", 50, 0, null, false],
    ]);
  });

  it("er tom uten Tibber", () => {
    expect(toEnergy([]).price).toBeNull();
  });
});

describe("priser", () => {
  const points = toPricePoints({
    prices: {
      Hjem: [
        ["2026-10-30T00:00:00.000+01:00", 2.0],
        ["2026-10-30T00:30:00.000+01:00", 2.2],
        ["2026-10-30T01:00:00.000+01:00", 1.5],
        ["2026-10-30T02:00:00.000+01:00", 1.4],
        ["2026-10-30T03:00:00.000+01:00", 1.6],
        ["2026-10-30T04:00:00.000+01:00", 3.0],
      ].map(([start_time, price]) => ({ start_time, price })),
    },
  });

  it("samler kvarter til timer og finner de billigste timene fram i tid", () => {
    const hours = hourlyPrices(points);
    expect(hours.map((h) => h.price.toFixed(2))).toEqual(["2.10", "1.50", "1.40", "1.60", "3.00"]);
    const w = cheapestWindow(hours, new Date("2026-10-29T23:40:00Z"), 3)!;
    expect(windowLabel(w)).toBe("01–04");
    expect(w.avg).toBeCloseTo(1.5);
    expect(cheapestWindow(hours, new Date("2026-10-30T03:10:00Z"), 3)).toBeNull();
  });

  it("deler dagen i billig, normal og dyr", () => {
    expect([levelOf(1.95, 1.9, 2.4), levelOf(2.15, 1.9, 2.4), levelOf(2.35, 1.9, 2.4), levelOf(2, 2, 2.02)]).toEqual(["billig", "normal", "dyr", "normal"]);
  });

  it("formaterer kroner og effekt", () => {
    expect([kr(2.097), watt(5633), watt(850), toPricePoints(null).length]).toEqual(["2,10 kr", "5,6 kW", "850 W", 0]);
  });
});
