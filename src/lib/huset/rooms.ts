// Romkartet for huset: hvilke lys, termostater, persienner og sensorer i Home Assistant som hører til hvilket rom,
// og hva de skal hete i Huset. KNX-navnene kommer fra ETS-prosjektet. UT og KAP (spottetyper fra Flos) heter bare «Lys»;
// har et rom begge, får den andre «Lys 2».
// Hue-grupper ute vises som ett lys (de styrer mange lyslister og spotter samtidig).
// Lys som ikke står her, havner i «Andre lys», så ingenting forsvinner.

export interface RoomLight {
  id: string;
  name: string;
}

export interface RoomConfig {
  id: string;
  name: string;
  /** Ute: med i «Utelys av». */
  outdoor?: boolean;
  /** 1 eller 2. Ute-rom har ingen etasje. Brukes når man sier «1. etasje» til Huset. */
  floor?: 1 | 2;
  lights?: RoomLight[];
  /** Hue-scener: alle scene.<prefiks>_* hører til rommet. */
  scenePrefix?: string;
  climate?: string;
  humidity?: string;
  floorTemp?: string;
  covers?: RoomLight[];
  /** Sonos-høyttalerne i rommet (media_player.*). Brukes på kartet og av «Spør huset». */
  speakers?: string[];
  /** Røykvarsleren fra Homely i rommet: starten på entity-id-ene (binary_sensor.<smoke>_brann osv.). */
  smoke?: string;
  /** Luftsensoren fra Homely i rommet: starten på entity-id-ene (sensor.<air>_temperatur osv.). */
  air?: string;
  /** Miele-maskinene i rommet: starten på entity-id-ene (sensor.<id>, sensor.<id>_program osv.). */
  appliances?: string[];
  /** Vanningsventilene i rommet (valve.*). */
  valves?: string[];
  /** Takluka (bare visning, styres aldri fra appen). */
  hatch?: HatchConfig;
  /** Brytere (switch.*) som kan slås av og på fra appen, f.eks. varmekabler. Bare disse kan styres. */
  switches?: RoomLight[];
}

import type { HatchConfig } from "./hatch";

const l = (id: string, name: string): RoomLight => ({ id: `light.${id}`, name });
const c = (id: string, name: string): RoomLight => ({ id: `cover.${id}`, name });
const sp = (...ids: string[]) => ids.map((id) => `media_player.${id}_${id}`);

export const ROOMS: RoomConfig[] = [
  {
    id: "stue", floor: 2,
    speakers: sp("stue", "hylla_i_stua"),
    name: "Stue",
    lights: [
      l("stue_ut", "Lys"),
      l("stue_ut_hjorne", "Lys i hjørnet"),
      l("stue_kap", "Lys 2"),
      l("stue_lav_stalampe_stua", "Lav stålampe"),
      l("stue_stalampe_stua", "Stålampe"),
      l("stue_lampe_ved_lenestoler", "Lampe ved lenestolene"),
      l("stue_lampe_i_hylle", "Lampe i hylla"),
      l("stue_ice_cream", "Ice cream"),
    ],
    scenePrefix: "stue_stue",
    climate: "climate.varme_stue",
    humidity: "sensor.stue_fukt",
    covers: [c("persienne_stue", "Stue"), c("persienne_dor_terrasse_venstre", "Terrassedør venstre"), c("persienne_dor_terrasse_hoyre", "Terrassedør høyre")],
  },
  {
    id: "kjokken", floor: 2,
    appliances: ["oppvaskmaskin", "oven_microwave", "steam_oven_combi"],
    speakers: sp("kjokken"),
    name: "Kjøkken",
    lights: [l("kjokken_benkelys", "Benkelys"), l("kjokken_ut_oy", "Lys over øya"), l("kjokken_kap", "Lys"), l("kjokken_kap_peis", "Lys ved peisen")],
    climate: "climate.varme_kjokken",
    humidity: "sensor.kjokken_fukt",
    covers: [c("persienne_kjokken_2etg", "Kjøkken")],
  },
  {
    id: "spisestue", floor: 2,
    smoke: "spisestue_intelligent_smoke_alarm",
    air: "spisestue_luftkvalitet",
    speakers: sp("spisestue"),
    name: "Spisestue",
    lights: [
      l("spisestue_taklys", "Taklys"),
      l("spisestue_ut", "Lys"),
      l("spisestue_kap", "Lys 2"),
      l("spisestue_lampe_lenestol_spisestue", "Lampe ved lenestolen"),
      l("spisestue_hue_smart_plug", "Stikkontakt (Hue)"),
    ],
    climate: "climate.varme_spisestue",
    humidity: "sensor.spisestue_fukt",
    covers: [c("persienne_spisestue_2etg", "Spisestue")],
  },
  {
    id: "kontor-2", floor: 2,
    speakers: sp("kontor_2etg"),
    name: "Kontor 2. etg",
    lights: [
      l("kontor_2etg_ut", "Lys"),
      l("kontor_2etg_kap", "Lys 2"),
      l("kontoret_oppe_skrivebord_kontoret_oppe", "Skrivebord"),
      l("kontoret_oppe_hue_smart_plug_vekstlys", "Vekstlys"),
    ],
    scenePrefix: "kontoret_oppe_kontoret_oppe",
    climate: "climate.varme_kontor_2etg",
    humidity: "sensor.kontor_2etg_fukt",
    covers: [c("persienne_kontor_2etg", "Kontor 2. etg")],
  },
  { id: "bod-2", floor: 2, name: "Bod 2. etg", lights: [l("bod_2etg_kap", "Lys")], climate: "climate.varme_bod_2etg" },
  {
    id: "trapp", floor: 1,
    smoke: "trapp_2_etg_intelligent_smoke_alarm",
    name: "Trappa",
    lights: [l("under_trappa_under_trappa_2", "Under trappa")],
    scenePrefix: "under_trappa_under_trappa",
    climate: "climate.varme_trapperom",
    humidity: "sensor.trapperom_fukt",
  },
  {
    id: "gang", floor: 1,
    name: "Gang",
    lights: [l("gang_kap", "Lys"), l("gang_led_sittebenk", "LED ved sittebenken")],
    climate: "climate.varme_gang",
    humidity: "sensor.gang_fukt",
  },
  { id: "entre", floor: 1, smoke: "entrance_intelligent_smoke_alarm", air: "entrance_luftsensor", name: "Entré", climate: "climate.varme_entre_hall", humidity: "sensor.entre_hall_fukt" },
  {
    id: "kontor-1", floor: 1,
    smoke: "kontoret_nede_intelligent_smoke_alarm",
    speakers: sp("kontor_1etg"),
    name: "Kontor 1. etg",
    lights: [l("kontor_1etg_kap", "Lys"), l("kontoret_nede_lampe_kontoret_nede", "Lampe")],
    scenePrefix: "kontoret_nede_kontoret_nede",
    climate: "climate.varme_kontor",
    humidity: "sensor.kontor_fukt",
    covers: [c("persienne_kontor", "Kontor"), c("persienne_vindu_kontor_1etg_vest", "Vindu mot vest")],
  },
  {
    id: "lekerom", floor: 1,
    speakers: sp("lekerom"),
    name: "Lekerom",
    lights: [l("lekerom_ut", "Lys"), l("lekerom_kap", "Lys 2")],
    climate: "climate.varme_lekerom",
    humidity: "sensor.lekerom_fukt",
    covers: [c("persienne_lekerom", "Lekerom")],
  },
  {
    id: "master", floor: 1,
    smoke: "hovedsoverom_intelligent_smoke_alarm",
    speakers: sp("soverom"),
    name: "Hovedsoverom",
    lights: [l("soverom_master_ut", "Lys"), l("nattbordlamper_hovedsov", "Nattbordlamper"), l("garderobe_master_ut", "Garderobe")],
    climate: "climate.varme_master_sov",
    humidity: "sensor.master_sov_fukt",
    covers: [c("persienne_soverom_master", "Hovedsoverom")],
  },
  {
    id: "sov-venstre", floor: 1,
    name: "Soverom Olav",
    lights: [l("soverom_venstre_takpunkt", "Taklys")],
    climate: "climate.varme_soverom_venstre",
    humidity: "sensor.soverom_venstre_fukt",
  },
  {
    id: "sov-hoyre", floor: 1,
    name: "Soverom Edvard",
    lights: [l("soverom_hoyre_takpunkt", "Taklys")],
    climate: "climate.varme_soverom_hoyre",
    humidity: "sensor.soverom_hoyre_fukt",
  },
  {
    id: "bad-stort", floor: 1,
    speakers: sp("hovedbad"),
    name: "Hovedbad",
    lights: [l("bad_stort_ut_og_kap", "Lys"), l("bad_stort_led_badekar_og_dusj", "LED badekar og dusj"), l("bad_stort_led_speil", "LED speil")],
    climate: "climate.varme_bad_stort",
    humidity: "sensor.bad_stort_fukt",
    floorTemp: "sensor.bad_stort_gulv",
  },
  {
    id: "bad-lite", floor: 1,
    speakers: sp("guttas_bad"),
    name: "Guttas bad",
    lights: [l("bad_lite_ut", "Lys"), l("bad_lite_led_badekar", "LED badekar"), l("bad_lite_led_speil", "LED speil")],
    climate: "climate.varme_bad_lite",
    humidity: "sensor.bad_lite_fukt",
    floorTemp: "sensor.bad_lite_gulv",
  },
  {
    id: "toalett", floor: 1,
    speakers: sp("wc"),
    name: "WC",
    lights: [l("toalett_kap", "Lys")],
    climate: "climate.varme_toalett",
    humidity: "sensor.toalett_fukt",
    floorTemp: "sensor.toalett_gulv",
  },
  { id: "vaskerom", floor: 1, smoke: "laundry_room_intelligent_smoke_alarm", appliances: ["vaskemaskin", "torketrommel"], name: "Vaskerom", lights: [l("vaskerom_kap", "Lys")], climate: "climate.varme_vaskerom", humidity: "sensor.vaskerom_fukt", covers: [c("persienne_vaskerom", "Vaskerom")] },
  { id: "teknisk", floor: 1, smoke: "teknisk_rom_intelligent_smoke_alarm", name: "Teknisk rom", lights: [l("teknisk_lux", "Lys")] },
  {
    // Taket over huset (egen «etasje» på kartet): Hue-lyslistene, høyttaleren og vanningen der oppe.
    id: "taket",
    name: "Taket",
    outdoor: true,
    lights: [l("taket_taket", "Taket (Hue)")],
    speakers: sp("taket"),
    valves: ["valve.taket"],
    // KNX 5/1/9 og 5/1/10 som binary_sensor i knx.yaml («Takluke åpne»/«Takluke lukke»).
    hatch: { open: "binary_sensor.takluke_apne", close: "binary_sensor.takluke_lukke", contact: "binary_sensor.takluke_kontakt" },
  },
  {
    // Den store terrassen ved stua og kjøkkenet, over kontoret og vaskerommet i 1. etasje.
    id: "terrasse",
    name: "Terrasse",
    outdoor: true,
    lights: [l("terrasse_utelys", "Utelys"), l("tak_terrasse_utelys", "Utelys 2"), l("terrasse_terrasse", "Terrasse (Hue)")],
    covers: [c("persienne_felles_terrasse", "Alle på terrassen")],
    speakers: sp("terrassen"),
  },
  {
    // Den lille balkongen ved spisestua.
    id: "balkong",
    name: "Balkong",
    outdoor: true,
    lights: [l("utelys_flauta", "Flauta")],
  },
  {
    id: "ute",
    speakers: sp("garasjen"),
    name: "Hage og inngang",
    outdoor: true,
    switches: [{ id: "switch.varmekabler_trapp_ute", name: "Varmekabler i trappa" }],
    lights: [
      l("utelys_inngang_sor", "Inngang sør"),
      l("utelys_inngang_nord", "Inngang nord"),
      l("utelys_bakside_v_lekerom", "Baksiden ved lekerommet"),
      l("snuplassen_snuplassen", "Snuplassen (Hue)"),
      l("skog_sor_skog_sor", "Skog sør (Hue)"),
      l("bedd_vest_bedd_vest", "Bedd vest (Hue)"),
      l("ute_vv11b_ute_vv11b", "VV11B (Hue)"),
      l("lys_vinter_vest_lys_vinter_vest", "Vinterlys vest (Hue)"),
      l("utendors_julebelysning_utendors_julebelysning", "Julebelysning (Hue)"),
      l("ute_ute", "Ute (Hue)"),
    ],
  },
];

/** Bryterne appen har lov til å styre (alt annet, som `switch.*_effekt` på Miele, røres aldri). */
export const CONTROLLABLE_SWITCHES = new Set(ROOMS.flatMap((r) => (r.switches ?? []).map((s) => s.id)));

/** Persienner som styrer flere vinduer samtidig. Vises øverst. */
export const SHARED_COVERS: RoomLight[] = [c("persienne_felles_alle_stue_kjok_spis", "Stue, kjøkken og spisestue")];

/** Scener fra disse Hue-gruppene ute hører til rommene over. */
export const OUTDOOR_SCENE_PREFIXES: Record<string, string[]> = {
  taket: ["taket_taket"],
  terrasse: ["terrasse_terrasse"],
  ute: ["snuplassen_snuplassen", "skog_sor_skog_sor", "bedd_vest_bedd_vest", "ute_vv11b_ute_vv11b"],
};

export const OUTDOOR_TEMP = "sensor.ute_temperatur";
