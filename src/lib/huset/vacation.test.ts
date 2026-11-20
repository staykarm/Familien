import { describe, expect, it } from "vitest";
import { toVacation, vacationText } from "./vacation";

const s = (entity_id: string, state: string) => ({ entity_id, state });

describe("toVacation", () => {
  it("er null uten bryteren", () => {
    expect(toVacation([])).toBeNull();
  });
  it("virker bare når alarmen er på borte", () => {
    expect(toVacation([s("input_boolean.ferie", "on"), s("alarm_control_panel.hjemme", "armed_away")])).toEqual({ on: true, active: true });
    expect(toVacation([s("input_boolean.ferie", "on"), s("alarm_control_panel.hjemme", "disarmed")])).toEqual({ on: true, active: false });
    expect(toVacation([s("input_boolean.ferie", "off"), s("alarm_control_panel.hjemme", "armed_away")])).toEqual({ on: false, active: false });
  });
  it("gir en kort tekst", () => {
    expect(vacationText({ on: false, active: false })).toBe("Av");
    expect(vacationText({ on: true, active: false })).toMatch(/starter når alarmen/);
  });
});
