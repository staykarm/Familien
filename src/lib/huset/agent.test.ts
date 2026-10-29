import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Kjører agentløkken med et skriptet Claude-svar og en falsk Home Assistant,
 * siden verken Claude eller huset kan nås fra testene.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ serverEnv: () => "nokkel" }));
const REM = { kind: "track", id: "31AOj9sFz2gM0O3hMARRBx", url: "https://open.spotify.com/track/31AOj9sFz2gM0O3hMARRBx", name: "Losing My Religion", subtitle: "R.E.M.", image: null };
vi.mock("./spotify", () => ({ spotifyConfigured: () => true, searchSpotify: async () => ({ tracks: [REM], playlists: [], albums: [] }) }));

const calls: { domain: string; service: string; data: Record<string, unknown> }[] = [];
const states = [
  { entity_id: "light.stue_ut", state: "on", attributes: { supported_color_modes: ["brightness"], brightness: 102 } },
  { entity_id: "light.stue_kap", state: "on", attributes: { supported_color_modes: ["brightness"], brightness: 51 } },
  { entity_id: "light.gang_kap", state: "on", attributes: { supported_color_modes: ["brightness"], brightness: 255 } },
  { entity_id: "light.lekerom_ut", state: "off", attributes: { supported_color_modes: ["brightness"] } },
  { entity_id: "climate.varme_stue", state: "heat", attributes: { current_temperature: 22, temperature: 22.5, min_temp: 5, max_temp: 30 } },
  { entity_id: "switch.dorapner_1", state: "off", attributes: {} },
  { entity_id: "vacuum.stove_2", state: "docked", attributes: { friendly_name: "Støve 2" } },
  { entity_id: "lawn_mower.klippe_ost", state: "docked", attributes: { friendly_name: "Klippe Øst", battery: 100 } },
  ...["hovedbad", "kjokken", "kontor_2etg"].map((id) => ({
    entity_id: `media_player.${id}`,
    state: "playing",
    attributes: {
      device_class: "speaker",
      friendly_name: id,
      volume_level: 0.33,
      // Hovedbad leder en gruppe med kjøkkenet og kontoret.
      group_members: ["media_player.hovedbad", "media_player.kjokken", "media_player.kontor_2etg"],
      source_list: ["NRK P3"],
    },
  })),
];
vi.mock("./ha", () => ({
  getStates: async () => states,
  callService: async (domain: string, service: string, data: Record<string, unknown>) => {
    calls.push({ domain, service, data });
  },
}));

let script: { content: unknown[]; stop_reason: string }[] = [];
const requests: { messages: { role: string; content: unknown }[] }[] = [];
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (req: { messages: { role: string; content: unknown }[] }) => {
        requests.push(structuredClone(req));
        return script.shift();
      },
    };
  },
}));

const { askHouse, undoHouse } = await import("./agent");

beforeEach(() => {
  calls.length = 0;
  requests.length = 0;
});

const toolUse = (name: string, input: unknown, id = "t1") => ({ content: [{ type: "tool_use", id, name, input }], stop_reason: "tool_use" });
const done = (text: string) => ({ content: [{ type: "text", text }], stop_reason: "end_turn" });

describe("askHouse", () => {
  it("slår av alt lyset i stua og gir angre-data", async () => {
    script = [toolUse("set_lights", { target: { rooms: ["stue"] }, on: false }), done("Slo av 2 lys i stua.")];
    const res = await askHouse([], "skru av alt lyset i stua", []);
    expect(calls).toEqual([{ domain: "light", service: "turn_off", data: { entity_id: ["light.stue_ut", "light.stue_kap"] } }]);
    expect(res.reply).toBe("Slo av 2 lys i stua.");
    expect(res.actions).toEqual(["Slo av 2 lys (Stue)"]);
    expect(res.undo).toEqual([
      { kind: "light", id: "light.stue_ut", on: true, brightness: 40, kelvin: null },
      { kind: "light", id: "light.stue_kap", on: true, brightness: 20, kelvin: null },
    ]);
    // Claude fikk oversikten med rom og etasje, men ikke døråpneren.
    const first = JSON.stringify(requests[0].messages.at(-1));
    expect(first).toContain("stue · Stue · 2. etg");
    expect(first).not.toContain("dorapner");
  });

  it("dimmer bare lys som er på i 1. etasje, og sender verktøyfeil tilbake til Claude", async () => {
    script = [
      { content: [toolUse("set_lights", { target: { floors: [1] }, on: true, brightness: 30, only_lit: true }).content[0], toolUse("set_temperature", { target: { rooms: ["stue"] } }, "t2").content[0]], stop_reason: "tool_use" },
      done("Dimmet lyset i 1. etasje til 30 %."),
    ];
    const res = await askHouse([], "dim alle lys i første etasje", []);
    expect(calls).toEqual([{ domain: "light", service: "turn_on", data: { entity_id: ["light.gang_kap"], brightness_pct: 30 } }]);
    // Begge verktøyresultatene kom tilbake i én melding, og det uten temperatur ble et svar Claude kan bruke.
    const results = requests[1].messages.at(-1)!.content as { tool_use_id: string; content: string }[];
    expect(results.map((r) => r.tool_use_id)).toEqual(["t1", "t2"]);
    expect(results[1].content).toContain("Si hvilken temperatur");
    expect(res.undo).toHaveLength(1);
  });

  it("sier fra når Claude ikke kan hjelpe, uten å styre noe", async () => {
    script = [{ content: [], stop_reason: "refusal" }];
    const res = await askHouse([], "åpne ytterdøra", []);
    expect(calls).toEqual([]);
    expect(res.reply).toBe("Det kan jeg ikke hjelpe med.");
  });
});

describe("undoHouse", () => {
  it("setter lys og varme tilbake, og hopper over enheter som ikke finnes", async () => {
    const n = await undoHouse([
      { kind: "light", id: "light.stue_ut", on: true, brightness: 40, kelvin: null },
      { kind: "light", id: "light.lekerom_ut", on: false, brightness: null, kelvin: null },
      { kind: "climate", id: "climate.varme_stue", target: 22.5 },
      { kind: "light", id: "light.finnes_ikke", on: true, brightness: 10, kelvin: null },
    ]);
    expect(n).toBe(3);
    expect(calls).toEqual([
      { domain: "light", service: "turn_on", data: { entity_id: "light.stue_ut", brightness_pct: 40 } },
      { domain: "light", service: "turn_off", data: { entity_id: "light.lekerom_ut" } },
      { domain: "climate", service: "set_temperature", data: { entity_id: "climate.varme_stue", temperature: 22.5 } },
    ]);
  });
});

describe("musikk i ett rom som er med i en gruppe", () => {
  it("tar rommet ut, setter volumet først og spiller bare der (ikke i resten av gruppen)", async () => {
    script = [
      toolUse("group_speakers", { speakers: ["media_player.kontor_2etg"], alone: true }),
      toolUse("control_music", { speakers: ["media_player.kontor_2etg"], action: "spotify", query: "Losing My Religion", volume: 10 }, "t2"),
      done("Spiller R.E.M. på kontoret."),
    ];
    await askHouse([], "spill losing my religion på kontoret på volum 10", []);
    expect(calls).toEqual([
      { domain: "media_player", service: "unjoin", data: { entity_id: ["media_player.kontor_2etg"] } },
      { domain: "media_player", service: "volume_set", data: { entity_id: ["media_player.kontor_2etg"], volume_level: 0.1 } },
      { domain: "media_player", service: "play_media", data: { entity_id: "media_player.kontor_2etg", media_content_id: REM.url, media_content_type: "music" } },
    ]);
  });

  it("tar rommet ut av gruppen av seg selv når Claude går rett på musikken", async () => {
    script = [toolUse("control_music", { speakers: ["media_player.kontor_2etg"], action: "favorite", favorite: "NRK P3" }), done("Spiller NRK P3 på kontoret.")];
    await askHouse([], "spill nrk p3 på kontoret", []);
    expect(calls.map((c) => `${c.service} ${JSON.stringify(c.data.entity_id)}`)).toEqual([
      'unjoin ["media_player.kontor_2etg"]',
      'select_source "media_player.kontor_2etg"',
    ]);
  });
});

describe("roboter", () => {
  it("starter støvsugeren og sender gressklipperen hjem, og ser robotene i oversikten", async () => {
    script = [
      { content: [toolUse("control_robot", { robots: ["vacuum.stove_2"], command: "start" }).content[0], toolUse("control_robot", { robots: ["lawn_mower.klippe_ost"], command: "home" }, "t2").content[0]], stop_reason: "tool_use" },
      done("Startet Støve 2 og sendte Klippe Øst hjem."),
    ];
    const res = await askHouse([], "start støvsugeren og send klipperen hjem", []);
    expect(calls).toEqual([
      { domain: "vacuum", service: "start", data: { entity_id: "vacuum.stove_2" } },
      { domain: "lawn_mower", service: "dock", data: { entity_id: "lawn_mower.klippe_ost" } },
    ]);
    expect(res.actions).toEqual(["Startet: Støve 2", "Sendte hjem: Klippe Øst"]);
    expect(JSON.stringify(requests[0].messages.at(-1))).toContain("Støve 2 [vacuum.stove_2] støvsuger");
  });
});

describe("familien", () => {
  it("tar med kalender og henting når dashboardet sender dem, og styrer ingenting for et spørsmål", async () => {
    script = [done("I morgen har Edvard tannlege kl. 08.10, og Marius leverer og henter.")];
    const res = await askHouse([], "hva skjer i morgen?", [], "I MORGEN: 08:10 Tannlege (Edvard). Levering og henting: Marius.");
    expect(calls).toEqual([]);
    expect(res.reply).toContain("tannlege");
    expect(JSON.stringify(requests[0].messages.at(-1))).toContain("FAMILIEN:\\nI MORGEN: 08:10 Tannlege (Edvard)");
  });
});
