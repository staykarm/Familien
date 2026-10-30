import { describe, expect, it } from "vitest";
import { applianceText, progress, toAppliances } from "./appliances";
import { houseStatus } from "./dashboard";
import { roomLook } from "./floorplan";
import { toHome } from "./home";

const s = (entity_id: string, state: string, attributes: Record<string, unknown> = {}) => ({ entity_id, state, attributes });
const machine = (id: string, status: string, extra: Record<string, string> = {}) => [
  s(`sensor.${id}`, status, { friendly_name: id }),
  s(`sensor.${id}_program`, extra.program ?? "no_program"),
  s(`sensor.${id}_programfase`, extra.phase ?? "not_running", { options: ["spin", "main_wash"] }),
  s(`sensor.${id}_gjenvaerende_tid`, extra.remaining ?? "unknown"),
  s(`sensor.${id}_forlopt_tid`, extra.elapsed ?? "unknown"),
  s(`sensor.${id}_fullfort`, extra.ends ?? "unknown"),
  s(`binary_sensor.${id}_dor`, extra.door ?? "off"),
  s(`binary_sensor.${id}_problem`, extra.problem ?? "off"),
  ...(extra.salt ? [s(`sensor.${id}_saltniva`, extra.salt)] : []),
];

describe("toAppliances", () => {
  const states = [
    ...machine("vaskemaskin", "in_use", { program: "cottons", phase: "spin", remaining: "15", elapsed: "45", ends: "2026-10-30T13:35:00+00:00" }),
    ...machine("oppvaskmaskin", "program_ended", { door: "on", salt: "5" }),
    ...machine("steam_oven_combi", "off"),
    ...machine("torketrommel", "failure"),
  ];

  it("leser status, program, fase, tid igjen, nivåer og feil, med norske navn", () => {
    const list = toAppliances(states);
    expect(list.map((a) => [a.name, a.kind, a.roomId, a.statusText])).toEqual([
      ["Vaskemaskin", "vask", "vaskerom", "Går"],
      ["Oppvaskmaskin", "oppvask", "kjokken", "Ferdig"],
      ["Dampovn", "ovn", "kjokken", "Av"],
      ["Tørketrommel", "tork", "vaskerom", "Feil"],
    ]);
    const [vask, oppvask, ovn, tork] = list;
    expect(applianceText(vask)).toBe("Bomull · Sentrifugerer · ferdig 14:35");
    expect(progress(vask)).toBe(0.75);
    expect(applianceText(oppvask)).toBe("Ferdig – tøm maskinen");
    expect(oppvask.doorOpen).toBe(true);
    expect(oppvask.levels).toEqual([{ name: "Salt", percent: 5, low: true }]);
    expect(applianceText(ovn)).toBe("Av");
    expect(tork.alerts).toEqual(["Tørketrommel: feil – se maskinen eller Miele-appen"]);
  });

  it("legger maskinene i rommene, med merke på kartet og en linje i «Huset nå»", () => {
    const home = toHome(states);
    const vaskerom = home.rooms.find((r) => r.id === "vaskerom")!;
    expect(vaskerom.appliances?.map((a) => a.id)).toEqual(["vaskemaskin", "torketrommel"]);
    expect(roomLook(vaskerom, new Set()).badges).toContain("🧺");
    const row = houseStatus(home, [], { valves: [], sensors: [] }).find((r) => r.area === "maskiner");
    expect(row).toMatchObject({ alert: true, active: true });
    expect(row?.value).toBe("Vaskemaskin ferdig 14:35 · Oppvaskmaskin ferdig · Tørketrommel: feil");
  });

  it("holder ovnslyset utenfor «Andre lys»", () => {
    const home = toHome([...machine("oven_microwave", "off"), s("light.oven_microwave_lys", "off", { friendly_name: "Oven microwave Lys", supported_color_modes: ["onoff"] })]);
    expect(home.rooms.find((r) => r.id === "andre")).toBeUndefined();
  });
});
