import { describe, expect, it } from "vitest";
import { toRobots } from "./robots";

const s = (entity_id: string, state: string, attributes: Record<string, unknown> = {}) => ({ entity_id, state, attributes });

describe("toRobots", () => {
  const robots = toRobots([
    s("vacuum.stove_2", "docked", { friendly_name: "Støve 2" }),
    s("sensor.stove_2_status", "charging"),
    s("sensor.stove_2_batteri", "100"),
    s("sensor.stove_2_vacuum_error", "none"),
    s("sensor.stove_2_dock_dock_error", "dirty_tank_latch_open"),
    s("sensor.stove_2_filter_time_left", "-564.6"),
    s("sensor.stove_2_dock_maintenance_brush_time_left", "127"),
    s("sensor.stove_2_current_room", "Study"),
    s("vacuum.dustin_1", "cleaning", { friendly_name: "Dustin 1" }),
    s("sensor.dustin_1_status", "segment_cleaning"),
    s("sensor.dustin_1_current_room", "Kitchen"),
    s("binary_sensor.dustin_1_water_shortage", "on"),
    s("image.dustin_1_map_0", "2026-10-31T10:00:00+00:00", { entity_picture: "/api/image_proxy/image.dustin_1_map_0?token=x" }),
    s("lawn_mower.klippe_ost", "mowing", { friendly_name: "Klippe Øst", battery: 63 }),
    s("lawn_mower.klippe_vest", "error", { friendly_name: "Klippe Vest", battery: 12 }),
  ]);

  it("leser støvsugere med status, batteri, feil fra dokken og deler på overtid", () => {
    const stove = robots.find((r) => r.id === "vacuum.stove_2")!;
    expect(stove).toMatchObject({
      kind: "vacuum",
      status: "Lader",
      active: false,
      battery: 100,
      room: null,
      problems: ["Lokket på skittentvannstanken i dokken står åpent"],
      maintenance: ["Filter"],
    });
  });

  it("finner kartet fra Roborock når det finnes", () => {
    expect(robots.find((r) => r.id === "vacuum.dustin_1")?.map).toEqual({ id: "image.dustin_1_map_0", version: "2026-10-31T10:00:00+00:00" });
    expect(robots.find((r) => r.id === "vacuum.stove_2")?.map).toBeUndefined();
  });

  it("viser rommet bare mens støvsugeren er i gang", () => {
    const dustin = robots.find((r) => r.id === "vacuum.dustin_1")!;
    expect(dustin).toMatchObject({ status: "Støvsuger rom", active: true, room: "Kjøkken", problems: ["Rentvannstanken er tom"] });
  });

  it("leser gressklippere og legger dem etter støvsugerne", () => {
    expect(robots.map((r) => r.name)).toEqual(["Dustin 1", "Støve 2", "Klippe Vest", "Klippe Øst"]);
    expect(robots.find((r) => r.name === "Klippe Øst")).toMatchObject({ kind: "mower", status: "Klipper", active: true, battery: 63 });
    expect(robots.find((r) => r.name === "Klippe Vest")?.problems).toHaveLength(1);
  });
});
