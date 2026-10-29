"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Pencil, Plus, X } from "lucide-react";
import {
  controlHome,
  controlSpeaker,
  deleteHouseGroup,
  loadHouse,
  loadHouseSetup,
  restoreHouseGroup,
  saveHouseGroup,
  startHouseGroup,
  type HouseData,
  type HouseResult,
  type HouseSetup,
} from "@/actions/huset";
import { card } from "@/components/ui/styles";
import { useUndo } from "@/components/ui/UndoToast";
import { kr } from "@/lib/huset/energy";
import { groupName, isMoved, moveSpeaker, type Speaker, type SpeakerGroup } from "@/lib/huset/sonos";
import type { HomeCommand, SpeakerCommand } from "@/lib/validation/huset";
import { CoversTab } from "./CoversTab";
import { EnergyTab, LEVEL_COLOR } from "./EnergyTab";
import { HeatTab } from "./HeatTab";
import { HouseAgent } from "./HouseAgent";
import { LightsTab } from "./LightsTab";
import { MapTab } from "./MapTab";
import { RobotsTab } from "./RobotsTab";
import { WateringTab } from "./WateringTab";
import { MusicSheet } from "./MusicSheet";
import { PresetSheet, type PresetDraft } from "./PresetSheet";
import { RoomList } from "./RoomList";
import { SafetyBanner, SafetyTab } from "./SafetyTab";

const POLL_MS = 4_000;
/** Sonos trenger et øyeblikk før Home Assistant viser en endring. */
const SETTLE_MS = 700;
/** Så mange ganger venter vi på at Sonos bekrefter en gruppering (Sonos kan bruke flere sekunder). */
const CONFIRM_TRIES = 8;

const SPOTIFY_NOTICE: Record<string, string> = {
  koblet: "Spotify er koblet til 🎉",
  avbrutt: "Spotify-innloggingen ble avbrutt",
  ugyldig: "Spotify-innloggingen var ugyldig eller utløpt. Prøv igjen.",
  "mangler-oppsett": "Spotify er ikke satt opp ennå (SPOTIFY_CLIENT_ID mangler i Vercel)",
  "feil-nokkel": "SPOTIFY_CLIENT_ID eller SPOTIFY_CLIENT_SECRET er feil",
  feil: "Kunne ikke koble til Spotify",
};

/** Egne endringer som ennå ikke er bekreftet av Home Assistant. `seq` skiller en ny endring fra en eldre. */
type Overrides = Record<string, { volume?: number; playing?: boolean; seq: number }>;

/** Legger egne, ubekreftede endringer oppå det som kom fra Home Assistant, så glidebrytere ikke hopper tilbake. */
function applyOverrides(groups: SpeakerGroup[], overrides: Overrides): SpeakerGroup[] {
  const fix = (s: Speaker): Speaker => {
    const o = overrides[s.id];
    if (!o) return s;
    return {
      ...s,
      volume: o.volume ?? s.volume,
      status: o.playing === undefined ? s.status : o.playing ? "playing" : "paused",
    };
  };
  return groups.map((g) => ({ leader: fix(g.leader), speakers: g.speakers.map(fix) }));
}

type Tab = "musikk" | "kart" | "lys" | "varme" | "persienner" | "roboter" | "vanning" | "strom" | "sikkerhet";
export type HouseTab = Tab;
const TABS: { id: Tab; label: string }[] = [
  { id: "musikk", label: "🎵 Musikk" },
  { id: "kart", label: "🗺️ Kart" },
  { id: "lys", label: "💡 Lys" },
  { id: "varme", label: "🌡️ Varme" },
  { id: "persienner", label: "🪟 Persienner" },
  { id: "roboter", label: "🤖 Roboter" },
  { id: "vanning", label: "💧 Vanning" },
  { id: "strom", label: "⚡ Strøm" },
  { id: "sikkerhet", label: "🛡️ Sikkerhet" },
];
const TAB_KEY = "familien.huset.fane";

const NEW_PRESET: PresetDraft = { name: "", speakerIds: [], spotifyUrl: null, spotifyName: null, volume: null };

/** Huset: faner for musikk (Sonos), lys, varme og persienner. Oppdateres hvert 4. sekund mens siden er synlig. */
export function HousePage({
  initial,
  setup: initialSetup,
  notice,
  fixedTab,
  room,
  mapClassName,
  onData,
  refreshKey = 0,
}: {
  initial: HouseData;
  setup: HouseSetup;
  notice: string | null;
  /** Bare én fane, uten tittel, «Spør huset» og faneknapper (brukes på dashboardet). */
  fixedTab?: Tab;
  /** Rommet som åpnes i kartet (fra dashboardet). */
  room?: string | null;
  /** Høyden på kartet (dashboardet har mindre plass). */
  mapClassName?: string;
  /** Får hver nye tilstand, så resten av dashboardet viser det samme som kartet. */
  onData?: (data: HouseData) => void;
  /** Hent ny tilstand med en gang når denne endres (etter en handling et annet sted på siden). */
  refreshKey?: number;
}) {
  const [data, setData] = useState(initial);
  const [chosenTab, setTab] = useState<Tab>("musikk");
  const tab = fixedTab ?? chosenTab;
  const [setup, setSetup] = useState(initialSetup);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [message, setMessage] = useState<string | null>(notice ? (SPOTIFY_NOTICE[notice] ?? null) : null);
  const [open, setOpen] = useState<string | null>(null);
  /** Gruppen man legger til rom i (lederens id). */
  const [adding, setAdding] = useState<string | null>(null);
  /** Rom som er flyttet, men som Sonos ennå ikke har bekreftet. Vises med en gang (`moveSpeaker`). */
  const [moves, setMoves] = useState<{ seq: number; speaker: string; to: string | null }[]>([]);
  const [music, setMusic] = useState<SpeakerGroup | null>(null);
  const [editing, setEditing] = useState(false);
  const [preset, setPreset] = useState<PresetDraft | null>(null);
  const [, start] = useTransition();
  /** En handling (fast gruppe, lagring) pågår. Ikke det samme som at siden henter ny tilstand. */
  const [acting, setActing] = useState(false);
  const busy = useRef(false);
  /** Grupperinger som venter på bekreftelse. Da hoppes den vanlige oppfriskingen over, fordi server actions
   *  kjøres én om gangen og ellers ville stilt seg i kø foran neste trykk. */
  const confirming = useRef(0);
  const seq = useRef(0);

  const reloadSetup = useCallback(async () => {
    setSetup(await loadHouseSetup());
  }, []);

  const undo = useUndo((m) => {
    setMessage(m ?? null);
    void reloadSetup();
  });

  const refresh = useCallback(() => {
    if (busy.current || confirming.current > 0) return;
    busy.current = true;
    start(async () => {
      try {
        setData(await loadHouse());
      } finally {
        busy.current = false;
      }
    });
  }, []);

  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && refresh();
    const poll = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  useEffect(() => {
    onData?.(data);
  }, [data, onData]);

  useEffect(() => {
    if (refreshKey) refresh();
  }, [refreshKey, refresh]);

  // Fjern ?spotify=… fra adressen etter at beskjeden er vist, så den ikke kommer igjen ved oppfrisking.
  useEffect(() => {
    if (notice) window.history.replaceState(null, "", "/huset");
  }, [notice]);

  // Husk fanen på denne enheten.
  useEffect(() => {
    if (fixedTab) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(TAB_KEY);
    } catch {
      // Lagring er av (privat modus).
    }
    if (!saved || !TABS.some((t) => t.id === saved)) return;
    const frame = requestAnimationFrame(() => setTab(saved as Tab));
    return () => cancelAnimationFrame(frame);
  }, [fixedTab]);

  function chooseTab(next: Tab) {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // Ikke viktig om det ikke huskes.
    }
  }

  /** Lys, varme og persienner: kjør handlingen, vent litt og hent ny tilstand før endringen slippes. */
  async function runHome(cmd: HomeCommand) {
    confirming.current++;
    try {
      const result = await controlHome(cmd);
      setMessage(result.ok ? null : (result.message ?? "Det virket ikke"));
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      setData(await loadHouse());
    } finally {
      confirming.current--;
    }
  }

  /** Etter en handling: vis eventuell beskjed, vent litt og hent ny tilstand. */
  async function settle(result: HouseResult) {
    setMessage(result.ok ? (result.message ?? null) : (result.message ?? "Det virket ikke"));
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    setData(await loadHouse());
  }

  /** Viser endringen med en gang, sender den, og slipper den når Home Assistant har svart med ny tilstand. */
  async function run(cmd: SpeakerCommand, change?: { volume?: number; playing?: boolean }) {
    const id = cmd.id;
    const mine = ++seq.current;
    if (change) setOverrides((o) => ({ ...o, [id]: { ...o[id], ...change, seq: mine } }));
    await settle(await controlSpeaker(cmd));
    setOverrides((o) => {
      if (o[id]?.seq !== mine) return o;
      const rest = { ...o };
      delete rest[id];
      return rest;
    });
  }

  /**
   * Flytter rom mellom grupper (`to` = lederen, `null` = alene). Vises med en gang, og holdes til Sonos
   * har bekreftet det (eller vi har ventet lenge nok), så lista ikke hopper fram og tilbake.
   */
  async function regroup(changes: { speaker: string; to: string | null }[], cmd: SpeakerCommand) {
    if (!changes.length) return;
    const mine = ++seq.current;
    confirming.current++;
    setMoves((m) => [...m, ...changes.map((c) => ({ ...c, seq: mine }))]);
    const result = await controlSpeaker(cmd);
    setMessage(result.ok ? (result.message ?? null) : (result.message ?? "Det virket ikke"));
    for (let i = 0; i < CONFIRM_TRIES; i++) {
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      const fresh = await loadHouse();
      setData(fresh);
      // En nyere gruppering tar over kontrollen, så denne slutter å spørre.
      if (!result.ok || mine !== seq.current || changes.every((c) => isMoved(fresh.groups, c.speaker, c.to))) break;
    }
    confirming.current--;
    setMoves((m) => m.filter((x) => x.seq !== mine));
  }

  function move(speaker: string, to: string | null) {
    const before = groups.find((g) => g.speakers.some((s) => s.id === speaker));
    if (!before || (to === null ? before.speakers.length === 1 : before.leader.id === to)) return;
    void regroup([{ speaker, to }], to === null ? { action: "unjoin", id: speaker } : { action: "join", id: to, member: speaker });
  }

  function ungroup(leader: Speaker) {
    const group = groups.find((g) => g.leader.id === leader.id);
    const others = (group?.speakers ?? []).filter((s) => s.id !== leader.id);
    // Rommene som skal ut, sendes med navn, så det virker selv om Home Assistant ikke har vist grupperingen ennå.
    const [first, ...rest] = others.map((s) => s.id);
    if (!first) return;
    void regroup(
      others.map((s) => ({ speaker: s.id, to: null })),
      { action: "unjoin", id: first, also: rest }
    );
  }

  /** Under dra: vis volumet uten å sende (sendes med jevne mellomrom og når man slipper). */
  function preview(id: string, volume: number) {
    setOverrides((o) => ({ ...o, [id]: { ...o[id], volume, seq: o[id]?.seq ?? 0 } }));
  }

  const groups = moves.reduce((g, m) => moveSpeaker(g, m.speaker, m.to), applyOverrides(data.groups, overrides));
  const active = groups.filter((g) => g.leader.status !== "unavailable");
  const missing = groups.filter((g) => g.leader.status === "unavailable");
  const allSpeakers = groups.flatMap((g) => g.speakers).sort((a, b) => a.name.localeCompare(b.name, "nb"));
  const nameOf = (id: string) => allSpeakers.find((s) => s.id === id)?.name ?? id.replace(/^media_player\./, "");

  async function savePreset(draft: PresetDraft) {
    setActing(true);
    const res = await saveHouseGroup(draft);
    setActing(false);
    if (!res.ok) return setMessage(res.message ?? "Kunne ikke lagre");
    setPreset(null);
    setMessage(null);
    await reloadSetup();
  }

  async function removePreset(id: string) {
    const res = await deleteHouseGroup(id);
    setPreset(null);
    if (!res.ok || !res.deleted) return setMessage(res.message ?? "Kunne ikke slette");
    const deleted = res.deleted;
    await reloadSetup();
    undo.offer({ text: `${deleted.name} er slettet`, run: () => restoreHouseGroup(deleted) });
  }

  return (
    <div className={`flex flex-col gap-4 ${fixedTab ? "" : "pb-16 md:pb-0"}`}>
      {!fixedTab && (
        <>
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-display text-xl font-bold sm:text-2xl lg:text-3xl">🏠 Huset</h1>
            <span className="flex flex-wrap items-center justify-end gap-x-3 text-sm text-ink-light">
              {data.energy.price !== null && (
                <button type="button" onClick={() => chooseTab("strom")} className="hover:text-ink">
                  ⚡ <span className="font-bold" style={{ color: data.energy.level ? LEVEL_COLOR[data.energy.level] : undefined }}>{kr(data.energy.price)}</span>/kWh
                </button>
              )}
              {data.home.outdoorTemp !== null && (
                <span>
                  Ute <span className="font-bold text-ink">{data.home.outdoorTemp.toLocaleString("nb-NO", { maximumFractionDigits: 1 })}°</span>
                </span>
              )}
            </span>
          </div>

          {data.ok && <HouseAgent onChanged={() => setTimeout(refresh, SETTLE_MS)} />}

          <div className="-mx-3 overflow-x-clip px-3 md:mx-0 md:px-0">
            <div className="chip-row" role="tablist" aria-label="Velg hva du vil styre">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => chooseTab(t.id)}
                  className={`min-h-12 rounded-full border-2 px-5 text-sm font-bold transition ${
                    tab === t.id ? "border-primary bg-primary-soft text-primary-dark" : "border-line bg-card"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {!data.ok && (
        <div className={`${card} border-2 border-danger/30`} role="alert">
          <p className="font-bold">{data.message}</p>
          <p className="text-sm text-ink-light">Prøver igjen av seg selv. Ligger feilen fast, sjekk HA_URL og HA_TOKEN i Vercel.</p>
        </div>
      )}
      {data.ok && !fixedTab && tab !== "sikkerhet" && <SafetyBanner safety={data.safety} />}
      {message && (
        <p className="rounded-2xl bg-sun px-4 py-2 font-semibold" role="status">
          {message}
        </p>
      )}

      {data.ok && tab === "kart" && (
        <MapTab
          home={data.home}
          groups={groups}
          run={runHome}
          onToggle={(s) => void run({ action: "toggle", id: s.id }, { playing: s.status !== "playing" })}
          onVolume={(id, volume, send) => (send ? void run({ action: "volume", id, volume }, { volume }) : preview(id, volume))}
          onMusic={(s) => setMusic(groups.find((g) => g.leader.id === s.id) ?? { leader: s, speakers: [s] })}
          initialRoom={room}
          svgClassName={mapClassName}
        />
      )}
      {data.ok && tab === "lys" && <LightsTab home={data.home} run={runHome} />}
      {data.ok && tab === "varme" && <HeatTab home={data.home} run={runHome} />}
      {data.ok && tab === "persienner" && <CoversTab home={data.home} run={runHome} />}
      {data.ok && tab === "roboter" && <RobotsTab robots={data.robots} run={runHome} />}
      {data.ok && tab === "strom" && <EnergyTab energy={data.energy} />}
      {data.ok && tab === "sikkerhet" && <SafetyTab safety={data.safety} />}
      {data.ok && tab === "vanning" && <WateringTab watering={data.watering} outdoorTemp={data.home.outdoorTemp} run={runHome} />}

      {data.ok && tab === "musikk" && (
        <>
          {/* chip-row går helt ut til skjermkanten på telefon; rammen her hindrer sidelengs rulling av hele siden. */}
          <div className="-mx-3 overflow-x-clip px-3 md:mx-0 md:px-0">
            <section aria-label="Faste grupper" className="chip-row">
              {setup.presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={acting}
                  onClick={async () => {
                    if (editing) return setPreset(p);
                    setActing(true);
                    setMessage(`Starter ${p.name} …`);
                    await settle(await startHouseGroup(p.id));
                    setActing(false);
                  }}
                  title={p.speakerIds.map(nameOf).join(", ")}
                  className={`flex min-h-12 items-center gap-2 rounded-full border-2 px-4 text-sm font-bold transition ${
                    editing ? "border-dashed border-primary bg-card" : "border-primary bg-primary-soft text-primary-dark"
                  }`}
                >
                  {editing && <Pencil size={16} aria-hidden />}
                  {p.name}
                </button>
              ))}
              {(editing || !setup.presets.length) && (
                <button
                  type="button"
                  onClick={() => setPreset({ ...NEW_PRESET })}
                  className="flex min-h-12 items-center gap-2 rounded-full border-2 border-dashed border-line bg-card px-4 text-sm font-bold"
                >
                  <Plus size={18} aria-hidden />
                  Ny fast gruppe
                </button>
              )}
              {setup.presets.length > 0 && (
                <button
                  type="button"
                  onClick={() => setEditing((e) => !e)}
                  className="flex min-h-12 items-center gap-2 rounded-full px-3 text-sm font-bold text-ink-light"
                  aria-label={editing ? "Ferdig med å endre grupper" : "Endre faste grupper"}
                >
                  {editing ? <X size={18} aria-hidden /> : <Pencil size={18} aria-hidden />}
                  <span className="hidden sm:inline">{editing ? "Ferdig" : "Endre"}</span>
                </button>
              )}
            </section>
          </div>

          <section className="flex flex-col gap-2" aria-labelledby="rom">
            <h2 id="rom" className="font-display text-lg font-bold sm:text-xl">
              🎵 Rom
            </h2>
            {active.length === 0 && <p className="text-ink-light">Fant ingen høyttalere i Home Assistant.</p>}
            <p className="text-sm text-ink-light">
              Trykk på lenken ved et rom for å spille det samme i flere rom.
              <span className="hidden md:inline"> Du kan også dra et rom i håndtaket og slippe det på et annet.</span>
            </p>
            <RoomList
              groups={active}
              open={open}
              onOpen={setOpen}
              adding={adding}
              onAdding={setAdding}
              onJoin={(leader, speaker) => move(speaker, leader)}
              onUnjoin={(speaker) => move(speaker, null)}
              onToggle={(s) => void run({ action: "toggle", id: s.id }, { playing: s.status !== "playing" })}
              onSkip={(s, action) => void run({ action, id: s.id })}
              onVolume={(id, volume, send) => (send ? void run({ action: "volume", id, volume }, { volume }) : preview(id, volume))}
              onSource={(s, source) => void run({ action: "source", id: s.id, source }, { playing: true })}
              onMusic={(s) => setMusic(groups.find((g) => g.leader.id === s.id) ?? { leader: s, speakers: [s] })}
              onUngroup={ungroup}
            />
            {missing.length > 0 && <p className="text-sm text-ink-light">Svarer ikke nå: {missing.map((g) => g.leader.name).join(", ")}</p>}
          </section>
        </>
      )}

      {music && (
        <MusicSheet
          target={groupName(music)}
          spotify={setup.spotify}
          onClose={() => setMusic(null)}
          onPlay={(item, queue) => {
            if (!queue) setMusic(null);
            void run({ action: "play", id: music.leader.id, url: item.url, queue }, queue ? undefined : { playing: true });
          }}
          onAccountsChanged={() => void reloadSetup()}
        />
      )}

      {preset && (
        <PresetSheet
          preset={preset}
          speakers={allSpeakers}
          spotify={setup.spotify}
          pending={acting}
          onClose={() => setPreset(null)}
          onSave={(d) => void savePreset(d)}
          onDelete={preset.id ? () => void removePreset(preset.id!) : undefined}
          onAccountsChanged={() => void reloadSetup()}
        />
      )}
      {undo.node}
    </div>
  );
}
