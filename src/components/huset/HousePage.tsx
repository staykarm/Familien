"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { controlSpeaker, loadHouse, type HouseData } from "@/actions/huset";
import { card } from "@/components/ui/styles";
import type { Speaker, SpeakerGroup } from "@/lib/huset/sonos";
import type { SpeakerCommand } from "@/lib/validation/huset";
import { RoomsSheet } from "./RoomsSheet";
import { SpeakerCard } from "./SpeakerCard";

const POLL_MS = 4_000;
/** Sonos trenger et øyeblikk før Home Assistant viser en endring. */
const SETTLE_MS = 700;

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

/** Huset: Sonos per rom. Oppdateres hvert 4. sekund mens siden er synlig. */
export function HousePage({ initial }: { initial: HouseData }) {
  const [data, setData] = useState(initial);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [message, setMessage] = useState<string | null>(null);
  const [rooms, setRooms] = useState<SpeakerGroup | null>(null);
  const [, start] = useTransition();
  const busy = useRef(false);
  const seq = useRef(0);

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

  /** Viser endringen med en gang, sender den, og slipper den når Home Assistant har svart med ny tilstand. */
  async function run(cmd: SpeakerCommand, change?: { volume?: number; playing?: boolean }) {
    const id = cmd.id;
    const mine = ++seq.current;
    if (change) setOverrides((o) => ({ ...o, [id]: { ...o[id], ...change, seq: mine } }));
    const result = await controlSpeaker(cmd);
    setMessage(result.ok ? null : (result.message ?? "Det virket ikke"));
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    const fresh = await loadHouse();
    setData(fresh);
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

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-bold sm:text-2xl lg:text-3xl">🏠 Huset</h1>

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
        <section className="flex flex-col gap-3" aria-labelledby="musikk">
          <h2 id="musikk" className="font-display text-lg font-bold sm:text-xl">
            🎵 Musikk
          </h2>
          {active.length === 0 && <p className="text-ink-light">Fant ingen høyttalere i Home Assistant.</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((g) => (
              <SpeakerCard
                key={g.leader.id}
                group={g}
                onToggle={() => void run({ action: "toggle", id: g.leader.id }, { playing: g.leader.status !== "playing" })}
                onSkip={(action) => void run({ action, id: g.leader.id })}
                onVolume={(id, volume, send) => (send ? void run({ action: "volume", id, volume }, { volume }) : preview(id, volume))}
                onSource={(source) => void run({ action: "source", id: g.leader.id, source }, { playing: true })}
                onRooms={() => setRooms(g)}
              />
            ))}
          </div>
          {missing.length > 0 && (
            <p className="text-sm text-ink-light">Svarer ikke nå: {missing.map((g) => g.leader.name).join(", ")}</p>
          )}
        </section>
      )}

      {rooms && (
        <RoomsSheet
          group={rooms}
          all={active.flatMap((g) => g.speakers)}
          onClose={() => setRooms(null)}
          onSave={(members) => {
            setRooms(null);
            void run({ action: "group", id: rooms.leader.id, members });
          }}
        />
      )}
    </div>
  );
}
