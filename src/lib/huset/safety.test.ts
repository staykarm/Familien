import { describe, expect, it } from "vitest";
import { toHome } from "./home";
import { toSafety } from "./safety";

const b = (entity_id: string, state: string, device_class?: string) => ({ entity_id, state, attributes: device_class ? { device_class } : {} });
const smoke = (prefix: string, fire = "off", battery = "off", online = "on", suffix = "") => [
  b(`binary_sensor.${prefix}_brann${suffix}`, fire, "smoke"),
  b(`binary_sensor.${prefix}_lavt_batteri${suffix}`, battery, "battery"),
  b(`binary_sensor.${prefix}_tilkoblet${suffix}`, online, "connectivity"),
  { entity_id: `sensor.${prefix}_temperatur${suffix}`, state: "21.3", attributes: {} },
];

describe("toSafety", () => {
  it("viser alarmen og røykvarslerne med romnavn fra romkartet", () => {
    const s = toSafety([
      { entity_id: "alarm_control_panel.hjemme", state: "disarmed", attributes: {} },
      ...smoke("spisestue_intelligent_smoke_alarm"),
      ...smoke("kid_s_room_intelligent_smoke_alarm"),
      ...smoke("kid_s_room_intelligent_smoke_alarm", "off", "off", "on", "_2"),
      b("binary_sensor.entrance_bevgelsessensor_bevegelse", "on", "motion"),
      { entity_id: "binary_sensor.under_trappa_kontoret_oppe_bevegelse", state: "unavailable", attributes: { device_class: "motion", friendly_name: "Kontoret oppe Bevegelse" } },
    ]);
    expect(s.alarm).toMatchObject({ label: "Av", armed: false, triggered: false });
    expect(s.smoke.map((x) => [x.name, x.roomId, x.temperature])).toEqual([
      ["Barnerom", null, 21.3],
      ["Barnerom 2", null, 21.3],
      ["Spisestue", "spisestue", 21.3],
    ]);
    expect(s.motion.map((m) => [m.name, m.motion, m.online])).toEqual([
      ["Entré", true, true],
      ["Kontoret oppe", false, false],
    ]);
    expect(s.problems).toEqual([]);
    expect(s.urgent).toBe(false);
  });

  it("melder brann først, så utløst alarm, frakoblede og lavt batteri", () => {
    const s = toSafety([
      { entity_id: "alarm_control_panel.hjemme", state: "triggered", attributes: {} },
      ...smoke("teknisk_rom_intelligent_smoke_alarm", "off", "on"),
      ...smoke("laundry_room_intelligent_smoke_alarm", "off", "off", "off"),
      ...smoke("spisestue_intelligent_smoke_alarm", "on"),
    ]);
    expect(s.problems).toEqual([
      "Brannalarm: røykvarsleren i Spisestue har gått!",
      "Innbruddsalarmen er utløst!",
      "Røykvarsleren i Vaskerom svarer ikke",
      "Røykvarsleren i Teknisk rom har lavt batteri",
    ]);
    expect(s.urgent).toBe(true);
  });

  it("merker rommet på kartet når røykvarsleren går", () => {
    const home = toHome([...smoke("spisestue_intelligent_smoke_alarm", "on")]);
    expect(home.rooms.find((r) => r.id === "spisestue")?.fire).toBe(true);
    expect(home.rooms.find((r) => r.id === "stue")?.fire).toBeUndefined();
  });
});
