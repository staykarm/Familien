// Miele-maskinene (vaskemaskin, tørketrommel, oppvaskmaskin og ovner) fra Home Assistant: status, program, fase,
// tid igjen, nivåer og varsler. Bare visning – appen starter eller stopper ingen maskiner.
// Rene funksjoner uten nettverk, slik at de kan testes.

import { ROOMS, type RoomConfig } from "./rooms";

interface StateLike {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export type ApplianceKind = "vask" | "tork" | "oppvask" | "ovn";

export interface FillLevel {
  name: string;
  percent: number;
  /** Under 10 %: bør fylles. */
  low: boolean;
}

export interface Appliance {
  /** Prefikset til entity-id-ene (f.eks. «vaskemaskin»). */
  id: string;
  name: string;
  kind: ApplianceKind;
  roomId: string | null;
  /** Rå status fra Miele (`in_use`, `program_ended` …). */
  status: string;
  /** «Går», «Ferdig», «Av» … */
  statusText: string;
  running: boolean;
  /** Programmet er ferdig og maskinen bør tømmes. */
  done: boolean;
  /** Satt til å starte senere. */
  waiting: boolean;
  failure: boolean;
  program: string | null;
  phase: string | null;
  remainingMin: number | null;
  elapsedMin: number | null;
  /** Når programmet er ferdig (ISO). */
  endsAt: string | null;
  /** Når en utsatt start begynner (ISO). */
  startsAt: string | null;
  temperature: number | null;
  targetTemperature: number | null;
  doorOpen: boolean;
  levels: FillLevel[];
  /** Varsler fra maskinen: feil, «varsel aktivt». */
  alerts: string[];
}

const STATUS: Record<string, string> = {
  off: "Av",
  on: "På",
  idle: "Klar",
  programmed: "Satt til å starte",
  waiting_to_start: "Venter på start",
  in_use: "Går",
  pause: "Pause",
  program_ended: "Ferdig",
  program_interrupted: "Avbrutt",
  failure: "Feil",
  service: "Service",
  rinse_hold: "Skyllestopp",
  not_connected: "Ikke tilkoblet",
  autocleaning: "Selvrens",
  superheating: "Hurtigoppvarming",
  reserved: "Reservert",
  unavailable: "Svarer ikke",
  unknown: "Ukjent",
};

const RUNNING = new Set(["in_use", "pause", "rinse_hold", "autocleaning", "superheating"]);

const PROGRAMS: Record<string, string> = {
  cottons: "Bomull",
  cottons_eco: "Bomull eco",
  cottons_hygiene: "Bomull hygiene",
  eco_40_60: "ECO 40–60",
  easy_care: "Lettstelt",
  minimum_iron: "Strykefritt",
  delicates: "Finvask",
  woollens: "Ull",
  woollens_handcare: "Ull",
  silks: "Silke",
  silks_handcare: "Silke",
  express: "Ekspress",
  express_20: "Ekspress 20",
  quick_power_wash: "QuickPowerWash",
  quick_power_dry: "QuickPowerDry",
  quick_intense: "Hurtig intensiv",
  shirts: "Skjorter",
  sportswear: "Sportsklær",
  outerwear: "Yttertøy",
  outdoor_garments: "Yttertøy",
  denim: "Jeans",
  dark_jeans: "Mørk jeans",
  dark_garments: "Mørke klær",
  towels: "Håndklær",
  bed_linen: "Sengetøy",
  table_linen: "Duker",
  curtains: "Gardiner",
  pillows: "Puter",
  down_duvets: "Dyner",
  downs_duvets: "Dyner",
  down_filled_items: "Dunplagg",
  rinse: "Skyll",
  drain_spin: "Tøm og sentrifuger",
  separate_rinse_starch: "Skyll og stivelse",
  starch: "Stivelse",
  steam_care: "Dampbehandling",
  steam_smoothing: "Dampglatting",
  smoothing: "Glatting",
  freshen_up: "Oppfrisk",
  powerfresh: "PowerFresh",
  stuffed_toys: "Kosedyr",
  trainers: "Joggesko",
  trainers_refresh: "Joggesko oppfrisk",
  clean_machine: "Maskinrens",
  automatic: "Automatisk",
  automatic_plus: "Automatic plus",
  cool_air: "Kald luft",
  warm_air: "Varm luft",
  hygiene: "Hygiene",
  eco: "ECO",
  normal: "Normal",
  intensive: "Intensiv",
  gentle: "Skånsom",
  extra_quiet: "Ekstra stille",
  comfort_wash: "Komfort",
  comfort_wash_plus: "Komfort plus",
  power_wash: "PowerWash",
  pre_wash: "Forvask",
  glasses_warm: "Varme glass",
  tall_items: "Høye gjenstander",
  pasta_paela: "Pasta/paella",
  pot_rests_and_filters: "Gryterester og filter",
  rinse_and_hold: "Skyll og vent",
  solar_save: "SolarSave",
  maintenance: "Vedlikehold",
  airfry: "Airfry",
  auto_roast: "Autostek",
  booster: "Booster",
  bottom_heat: "Undervarme",
};

const PHASES: Record<string, string> = {
  pre_wash: "Forvask",
  main_wash: "Hovedvask",
  soak: "Bløtlegging",
  rinse: "Skyller",
  rinse_hold: "Skyllestopp",
  spin: "Sentrifugerer",
  drain: "Tømmer",
  anti_crease: "Krøllfri",
  cooling_down: "Kjøler ned",
  disinfecting: "Desinfiserer",
  hygiene: "Hygiene",
  drying: "Tørker",
  steam_smoothing: "Dampglatting",
  freshen_up_and_moisten: "Frisker opp",
  starch_stop: "Stivelsesstopp",
  venting: "Lufter",
  cleaning: "Rengjør",
  finished: "Ferdig",
  cancelled: "Avbrutt",
  paused: "Pause",
  automatic_start: "Starter automatisk",
  flex_load_active: "Venter på billig strøm",
  pre_dishwash: "Forvask",
  main_dishwash: "Vasker",
  interim_rinse: "Mellomskyll",
  final_rinse: "Sluttskyll",
  reactivating: "Reaktiverer",
  program_running: "Går",
  normal: "Tørker",
  normal_plus: "Tørker",
  extra_dry: "Ekstra tørr",
  slightly_dry: "Lett tørr",
  hand_iron: "Strykefuktig",
  hand_iron_1: "Strykefuktig",
  hand_iron_2: "Strykefuktig",
  machine_iron: "Rulletørr",
  smoothing: "Glatting",
  timed_drying: "Tidsstyrt tørk",
  warm_air: "Varm luft",
  comfort_cooling: "Kjøler ned",
  safety_cooling: "Sikkerhetskjøling",
  perfect_dry_active: "PerfectDry",
  rinse_out_lint: "Skyller ut lo",
  rinses: "Skyller",
  moisten: "Fukter",
  thermo_spin: "Termosentrifuge",
  heating_up: "Varmer opp",
  heating_up_phase: "Varmer opp",
  pre_heating: "Forvarmer",
  process_running: "I gang",
  process_finished: "Ferdig",
  roasting: "Steker",
  searing: "Bruner",
  steam_reduction: "Damp ut",
  waiting_for_start: "Venter på start",
  energy_save: "Energisparing",
};

/** Norske navn på maskinene (Miele kaller ovnene noe engelsk). */
const NAMES: Record<string, string> = {
  vaskemaskin: "Vaskemaskin",
  torketrommel: "Tørketrommel",
  oppvaskmaskin: "Oppvaskmaskin",
  oven_microwave: "Kombiovn",
  steam_oven_combi: "Dampovn",
};

const LEVELS: [suffix: string, name: string][] = [
  ["saltniva", "Salt"],
  ["skyllemiddelniva", "Skyllemiddel"],
  ["powerdisk_niva", "PowerDisk"],
  ["twindos_1_niva", "TwinDos 1"],
  ["twindos_2_niva", "TwinDos 2"],
];

const human = (v: string) => v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function kindOf(id: string, options: unknown): ApplianceKind {
  if (/oppvask|dish/.test(id)) return "oppvask";
  if (/tork|dryer/.test(id)) return "tork";
  if (/vask|wash/.test(id)) return "vask";
  if (/oven|ovn|steam/.test(id)) return "ovn";
  return Array.isArray(options) && options.includes("spin") ? "vask" : "ovn";
}

export function toAppliances(states: StateLike[], rooms: RoomConfig[] = ROOMS): Appliance[] {
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  const value = (id: string) => {
    const s = byId.get(id);
    return !s || s.state === "unknown" || s.state === "unavailable" ? null : s.state;
  };
  const number = (id: string) => {
    const v = value(id);
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  // En Miele-maskin har sensor.<id>, sensor.<id>_program og sensor.<id>_programfase.
  return states
    .filter((s) => /^sensor\.[a-z0-9_]+_programfase$/.test(s.entity_id))
    .map((phaseState) => phaseState.entity_id.replace(/^sensor\./, "").replace(/_programfase$/, ""))
    .filter((id) => byId.has(`sensor.${id}`) && byId.has(`sensor.${id}_program`))
    .map((id): Appliance => {
      const main = byId.get(`sensor.${id}`)!;
      const status = main.state;
      const program = value(`sensor.${id}_program`);
      const phase = value(`sensor.${id}_programfase`);
      const remaining = number(`sensor.${id}_gjenvaerende_tid`);
      const ended = value(`sensor.${id}_fullfort`);
      const started = value(`sensor.${id}_start`);
      const running = RUNNING.has(status);
      const waiting = status === "programmed" || status === "waiting_to_start";
      const failure = status === "failure" || value(`binary_sensor.${id}_problem`) === "on";
      const levels = LEVELS.flatMap(([suffix, name]) => {
        const p = number(`sensor.${id}_${suffix}`);
        return p === null ? [] : [{ name, percent: p, low: p < 10 }];
      });
      const room = rooms.find((r) => r.appliances?.includes(id));
      const name = NAMES[id] ?? String(main.attributes.friendly_name ?? human(id));
      return {
        id,
        name,
        kind: kindOf(id, byId.get(`sensor.${id}_programfase`)?.attributes.options),
        roomId: room?.id ?? null,
        status,
        statusText: STATUS[status] ?? human(status),
        running,
        done: status === "program_ended",
        waiting,
        failure,
        program: program && program !== "no_program" ? (PROGRAMS[program] ?? human(program)) : null,
        phase: phase && phase !== "not_running" ? (PHASES[phase] ?? human(phase)) : null,
        remainingMin: running || waiting ? remaining : null,
        elapsedMin: running ? number(`sensor.${id}_forlopt_tid`) : null,
        endsAt: running || waiting ? ended : null,
        startsAt: waiting ? started : null,
        temperature: number(`sensor.${id}_temperatur`),
        targetTemperature: number(`sensor.${id}_maltemperatur`),
        doorOpen: value(`binary_sensor.${id}_dor`) === "on",
        levels,
        alerts: [
          ...(failure ? [`${name}: feil – se maskinen eller Miele-appen`] : []),
          ...(value(`binary_sensor.${id}_varsel_aktivt`) === "on" && !failure ? [`${name}: har et varsel – se Miele-appen`] : []),
        ],
      };
    })
    .sort((a, b) => Number(b.running) - Number(a.running) || Number(b.done) - Number(a.done) || a.name.localeCompare(b.name, "nb"));
}

const clock = (iso: string) => new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Kort tekst: «Bomull · Sentrifugerer · ferdig 14:35», «Ferdig – tøm maskinen», «Starter 02:00», «Av». */
export function applianceText(a: Appliance): string {
  if (a.failure) return "Feil";
  if (a.done) return a.kind === "ovn" ? "Ferdig" : "Ferdig – tøm maskinen";
  if (a.waiting) return `${a.program ? `${a.program} · ` : ""}${a.startsAt ? `starter ${clock(a.startsAt)}` : "venter på start"}`;
  if (a.running) {
    const temp = a.kind === "ovn" && a.temperature !== null ? `${Math.round(a.temperature)}°${a.targetTemperature ? ` av ${Math.round(a.targetTemperature)}°` : ""}` : "";
    const when = a.endsAt ? `ferdig ${clock(a.endsAt)}` : a.remainingMin !== null ? `${a.remainingMin} min igjen` : "";
    return [a.program, a.phase, temp, when].filter(Boolean).join(" · ") || a.statusText;
  }
  return a.statusText;
}

/** Kort tekst til «Huset nå»: «Vaskemaskin ferdig 14:35», «Oppvaskmaskin ferdig», «Tørketrommel starter 02:00». */
export function applianceShort(a: Appliance): string {
  if (a.failure) return `${a.name}: feil`;
  if (a.done) return `${a.name} ferdig`;
  if (a.waiting) return `${a.name} ${a.startsAt ? `starter ${clock(a.startsAt)}` : "venter"}`;
  if (a.running) return `${a.name} ${a.endsAt ? `ferdig ${clock(a.endsAt)}` : a.remainingMin !== null ? `${a.remainingMin} min igjen` : "går"}`;
  return `${a.name} ${a.statusText.toLowerCase()}`;
}

/** Hvor langt programmet har kommet (0–1), når tidene er kjent. */
export function progress(a: Appliance): number | null {
  if (!a.running || a.elapsedMin === null || a.remainingMin === null || a.elapsedMin + a.remainingMin <= 0) return null;
  return a.elapsedMin / (a.elapsedMin + a.remainingMin);
}

export const APPLIANCE_ICON: Record<ApplianceKind, string> = { vask: "🧺", tork: "🌀", oppvask: "🍽️", ovn: "♨️" };
