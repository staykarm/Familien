import { describe, expect, it } from "vitest";
import { houseStatus } from "./dashboard";
import { roomLook } from "./floorplan";
import { toHatch } from "./hatch";
import { toHome } from "./home";

const cfg = { open: "binary_sensor.takluke_apne", close: "binary_sensor.takluke_lukke", contact: "binary_sensor.takluke_kontakt" };
const s = (entity_id: string, state: string, last_changed?: string) => ({ entity_id, state, attributes: {}, last_changed });

describe("takluka", () => {
  it("anslår åpen/lukket ut fra hvilket relé som gikk sist", () => {
    expect(toHatch([s(cfg.open, "off", "2026-10-30T14:00:00Z"), s(cfg.close, "off", "2026-10-30T09:00:00Z")], cfg)).toMatchObject({ state: "open", text: "Åpen", fromContact: false });
    expect(toHatch([s(cfg.open, "off", "2026-10-30T09:00:00Z"), s(cfg.close, "off", "2026-10-30T14:00:00Z")], cfg)?.state).toBe("closed");
    expect(toHatch([s(cfg.open, "on", "2026-10-30T14:00:00Z"), s(cfg.close, "off", "2026-10-30T09:00:00Z")], cfg)?.text).toBe("Åpner …");
  });

  it("bruker kontaktsensoren når den finnes, og gir ingenting uten sensorer", () => {
    expect(toHatch([s(cfg.contact, "off", "2026-10-30T15:00:00Z"), s(cfg.open, "off", "2026-10-30T16:00:00Z"), s(cfg.close, "off")], cfg)).toMatchObject({ state: "closed", fromContact: true });
    expect(toHatch([], cfg)).toBeNull();
  });

  it("vises på Taket på kartet og i «Huset nå»", () => {
    const home = toHome([s(cfg.open, "off", "2026-10-30T14:00:00Z"), s(cfg.close, "off", "2026-10-30T09:00:00Z")]);
    const taket = home.rooms.find((r) => r.id === "taket")!;
    expect(roomLook(taket, new Set()).badges).toContain("Luke åpen");
    expect(houseStatus(home, [], { valves: [], sensors: [] }).find((r) => r.label === "Takluke")).toMatchObject({ value: "Åpen", active: true });
  });
});
