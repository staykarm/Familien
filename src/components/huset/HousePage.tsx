"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Link2, Pencil, Plus, X } from "lucide-react";
import {
  controlSpeaker,
  deleteHouseGroup,
  joinRooms,
  loadHouse,
  loadHouseSetup,
  restoreHouseGroup,
  saveHouseGroup,
  startHouseGroup,
  type HouseData,
  type HouseResult,
  type HouseSetup,
} from "@/actions/huset";
import { buttonPrimary, buttonSecondary, card } from "@/components/ui/styles";
import { useUndo } from "@/components/ui/UndoToast";
import { groupName, type Speaker, type SpeakerGroup } from "@/lib/huset/sonos";
import type { SpeakerCommand } from "@/lib/validation/huset";
import { MusicSheet } from "./MusicSheet";
import { PresetSheet, type PresetDraft } from "./PresetSheet";
import { RoomList } from "./RoomList";

const POLL_MS = 4_000;
/** Sonos trenger et øyeblikk før Home Assistant viser en endring. */
const SETTLE_MS = 700;

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

const NEW_PRESET: PresetDraft = { name: "", speakerIds: [], spotifyUrl: null, spotifyName: null, volume: null };

/** Huset: Sonos per rom som en liste, faste grupper øverst. Oppdateres hvert 4. sekund mens siden er synlig. */
export function HousePage({ initial, setup: initialSetup, notice }: { initial: HouseData; setup: HouseSetup; notice: string | null }) {
  const [data, setData] = useState(initial);
  const [setup, setSetup] = useState(initialSetup);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [message, setMessage] = useState<string | null>(notice ? (SPOTIFY_NOTICE[notice] ?? null) : null);
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [music, setMusic] = useState<SpeakerGroup | null>(null);
  const [editing, setEditing] = useState(false);
  const [preset, setPreset] = useState<PresetDraft | null>(null);
  const [, start] = useTransition();
  /** En handling (fast gruppe, «Spill sammen», lagring) pågår. Ikke det samme som at siden henter ny tilstand. */
  const [acting, setActing] = useState(false);
  const busy = useRef(false);
  const seq = useRef(0);

  const reloadSetup = useCallback(async () => {
    setSetup(await loadHouseSetup());
  }, []);

  const undo = useUndo((m) => {
    setMessage(m ?? null);
    void reloadSetup();
  });

  const refresh = useCallback(() => {
    if (busy.current) return;
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

  // Fjern ?spotify=… fra adressen etter at beskjeden er vist, så den ikke kommer igjen ved oppfrisking.
  useEffect(() => {
    if (notice) window.history.replaceState(null, "", "/huset");
  }, [notice]);

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

  /** Under dra: vis volumet uten å sende (sendes med jevne mellomrom og når man slipper). */
  function preview(id: string, volume: number) {
    setOverrides((o) => ({ ...o, [id]: { ...o[id], volume, seq: o[id]?.seq ?? 0 } }));
  }

  const groups = applyOverrides(data.groups, overrides);
  const active = groups.filter((g) => g.leader.status !== "unavailable");
  const missing = groups.filter((g) => g.leader.status === "unavailable");
  const allSpeakers = groups.flatMap((g) => g.speakers).sort((a, b) => a.name.localeCompare(b.name, "nb"));
  const nameOf = (id: string) => allSpeakers.find((s) => s.id === id)?.name ?? id.replace(/^media_player\./, "");

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
    <div className="flex flex-col gap-4 pb-16 md:pb-0">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold sm:text-2xl lg:text-3xl">🏠 Huset</h1>
        {data.ok && !selected && (
          <button type="button" className={buttonSecondary} onClick={() => setSelected(new Set())} aria-label="Grupper rom">
            <Link2 size={20} aria-hidden />
            <span className="hidden sm:inline">Grupper rom</span>
          </button>
        )}
      </div>

      {!data.ok && (
        <div className={`${card} border-2 border-danger/30`} role="alert">
          <p className="font-bold">{data.message}</p>
          <p className="text-sm text-ink-light">Prøver igjen av seg selv. Ligger feilen fast, sjekk HA_URL og HA_TOKEN i Vercel.</p>
        </div>
      )}
      {message && (
        <p className="rounded-2xl bg-sun px-4 py-2 font-semibold" role="status">
          {message}
        </p>
      )}

      {data.ok && (
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
            {selected && <p className="text-sm text-ink-light">Kryss av rommene som skal spille det samme. Rommet som spiller nå, bestemmer musikken.</p>}
            <RoomList
              groups={active}
              open={open}
              onOpen={setOpen}
              selected={selected}
              onSelect={toggleSelect}
              onToggle={(s) => void run({ action: "toggle", id: s.id }, { playing: s.status !== "playing" })}
              onSkip={(s, action) => void run({ action, id: s.id })}
              onVolume={(id, volume, send) => (send ? void run({ action: "volume", id, volume }, { volume }) : preview(id, volume))}
              onSource={(s, source) => void run({ action: "source", id: s.id, source }, { playing: true })}
              onMusic={(s) => setMusic(groups.find((g) => g.leader.id === s.id) ?? { leader: s, speakers: [s] })}
              onUngroup={(s) => void run({ action: "group", id: s.id, members: [] })}
            />
            {missing.length > 0 && <p className="text-sm text-ink-light">Svarer ikke nå: {missing.map((g) => g.leader.name).join(", ")}</p>}
          </section>
        </>
      )}

      {selected && (
        <div className="pb-safe fixed inset-x-0 bottom-16 z-40 flex justify-center px-3 md:bottom-6">
          <div className="flex items-center gap-2 rounded-full bg-ink p-2 pl-5 text-white shadow-lg">
            <span className="font-bold">{selected.size} valgt</span>
            <button
              type="button"
              className={`${buttonPrimary} rounded-full`}
              disabled={selected.size < 2 || acting}
              onClick={async () => {
                const ids = [...selected];
                setSelected(null);
                setActing(true);
                await settle(await joinRooms(ids));
                setActing(false);
              }}
            >
              Spill sammen
            </button>
            <button type="button" className="min-h-12 rounded-full px-4 font-bold text-sun" onClick={() => setSelected(null)}>
              Avbryt
            </button>
          </div>
        </div>
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
