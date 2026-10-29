import { describe, expect, it } from "vitest";
import { homeCommandSchema } from "./huset";

describe("homeCommandSchema", () => {
  it("godtar gyldige handlinger", () => {
    expect(homeCommandSchema.safeParse({ action: "light", id: "light.kjokken_benkelys", brightness: 30 }).success).toBe(true);
    expect(homeCommandSchema.safeParse({ action: "climate", id: "climate.varme_stue", temperature: 22.5 }).success).toBe(true);
    expect(homeCommandSchema.safeParse({ action: "cover", id: "cover.persienne_stue", command: "stop" }).success).toBe(true);
    expect(homeCommandSchema.safeParse({ action: "lights_off", ids: ["light.a", "light.b"] }).success).toBe(true);
  });

  it("avviser feil type enhet, rare id-er og ugyldige verdier", () => {
    expect(homeCommandSchema.safeParse({ action: "light", id: "switch.dor_apner" }).success).toBe(false);
    expect(homeCommandSchema.safeParse({ action: "light", id: "lightXstue" }).success).toBe(false);
    expect(homeCommandSchema.safeParse({ action: "scene", id: "scene.stue; rm" }).success).toBe(false);
    expect(homeCommandSchema.safeParse({ action: "climate", id: "climate.varme_stue", temperature: 22.3 }).success).toBe(false);
    expect(homeCommandSchema.safeParse({ action: "climate", id: "climate.varme_stue", temperature: 40 }).success).toBe(false);
    expect(homeCommandSchema.safeParse({ action: "cover_position", id: "cover.persienne_stue", position: 120 }).success).toBe(false);
  });
});
