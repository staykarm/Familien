import { describe, expect, it } from "vitest";
import { humidifierError, toHumidifier } from "./humidifier";

const P = "duux_1_33435";
const base = (over: Record<string, string> = {}) =>
  Object.entries({
    [`binary_sensor.${P}_connected`]: "on",
    [`binary_sensor.${P}_problem`]: "off",
    [`sensor.${P}_error_message`]: "OK",
    [`sensor.${P}_temperatur`]: "21",
    ...over,
  }).map(([entity_id, state]) => ({ entity_id, state }));

describe("toHumidifier", () => {
  it("er null uten sensorer", () => {
    expect(toHumidifier([], P)).toBeNull();
  });

  it("er OK når alt er i orden", () => {
    const h = toHumidifier(base(), P)!;
    expect(h).toMatchObject({ online: true, problem: false, error: null, temperature: 21, on: null, text: "OK" });
  });

  it("ber oss sjekke vanntanken ved ukjent feil", () => {
    const h = toHumidifier(base({ [`binary_sensor.${P}_problem`]: "on", [`sensor.${P}_error_message`]: "Unknown Error" }), P)!;
    expect(h.problem).toBe(true);
    expect(h.text).toBe("Feil – sjekk vanntanken");
  });

  it("sier fra når den ikke svarer", () => {
    expect(toHumidifier(base({ [`binary_sensor.${P}_connected`]: "off" }), P)!.text).toBe("Svarer ikke");
  });

  it("leser av/på og fukt fra humidifier-enheten når den finnes", () => {
    const states = [...base(), { entity_id: `humidifier.${P}`, state: "on", attributes: { humidity: 45, current_humidity: 38 } }];
    const h = toHumidifier(states, P)!;
    expect(h).toMatchObject({ on: true, target: 45, humidity: 38, text: "På · mål 45 % · nå 38 %" });
  });
});

describe("humidifierError", () => {
  it("oversetter", () => {
    expect(humidifierError("Unknown Error")).toBe("sjekk vanntanken");
    expect(humidifierError("Water tank empty")).toBe("tom vanntank");
    expect(humidifierError("E5")).toBe("E5");
  });
});
