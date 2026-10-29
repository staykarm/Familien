"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LightbulbOff, Moon, Pause, Play, Undo2 } from "lucide-react";
import { controlHome, controlSpeaker, loadHouse, undoHouse, type HouseData } from "@/actions/huset";
import { goodNight, houseStatus, outdoorOff, playingNow, type LightsOff, type StatusArea } from "@/lib/huset/dashboard";
import { FLOORS } from "@/lib/huset/floorplan";
import type { UndoItem } from "@/lib/huset/agentTargets";
import { FloorMap } from "./MapTab";
import { Cover } from "./parts";

// Huset på dashboardet: levende tilstand, små kart, «God natt», status per område og det som spiller.
// Brukes bare via components/huset/public.tsx.

const POLL_MS = 5_000;
/** Home Assistant trenger et øyeblikk før en endring vises. */
const SETTLE_MS = 700;
/** Så lenge «Angre» står etter «God natt». */
const UNDO_MS = 10_000;

export interface HouseLive {
  data: HouseData;
  refresh: () => void;
  /** Slår av lysene og gir beskjed om hvordan det gikk. */
  lightsOff: (off: LightsOff) => Promise<{ ok: boolean; message?: string }>;
  undo: (items: UndoItem[]) => Promise<void>;
  toggle: (leaderId: string) => Promise<void>;
}

/** Tilstanden i huset, hentet på nytt hvert 5. sekund mens siden er synlig. */
export function useHouseLive(initial: HouseData): HouseLive {
  const [data, setData] = useState(initial);
  const busy = useRef(false);

  const refresh = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    loadHouse()
      .then(setData)
      .catch(() => {})
      .finally(() => (busy.current = false));
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

  const settle = useCallback(async () => {
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    setData(await loadHouse());
  }, []);

  return {
    data,
    refresh,
    lightsOff: async (off) => {
      if (!off.ids.length) return { ok: true };
      const res = await controlHome({ action: "lights_off", ids: off.ids });
      await settle();
      return res;
    },
    undo: async (items) => {
      if (items.length) await undoHouse(items);
      await settle();
    },
    toggle: async (id) => {
      await controlSpeaker({ action: "toggle", id });
      await settle();
    },
  };
}

/** Begge etasjene side om side. Trykk på et rom åpner det i kartet. */
export function HouseMiniMap({ live, onRoom }: { live: HouseLive; onRoom: (roomId: string) => void }) {
  const { home, groups } = live.data;
  const rooms = new Map(home.rooms.map((r) => [r.id, r]));
  const playing = new Set(groups.filter((g) => g.leader.status === "playing").flatMap((g) => g.speakers.map((s) => s.id)));
  return (
    <div className="grid grid-cols-2 gap-3">
      {FLOORS.map((f) => (
        <FloorMap key={f.id} floor={f} rooms={rooms} selected={null} playing={playing} onOpen={onRoom} svgClassName="max-h-[46dvh]" />
      ))}
    </div>
  );
}

const button =
  "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-ink transition hover:border-ink-faint disabled:opacity-40";

/** «God natt» (alt lys av, inne og ute) og «Utelys av», med «Angre» en liten stund etterpå. */
export function HouseQuickLights({ live }: { live: HouseLive }) {
  const [undo, setUndo] = useState<{ text: string; items: UndoItem[] } | null>(null);
  const [working, setWorking] = useState(false);
  const night = goodNight(live.data.home);
  const outside = outdoorOff(live.data.home);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo]);

  async function run(off: LightsOff, text: string) {
    setWorking(true);
    const res = await live.lightsOff(off);
    setWorking(false);
    setUndo(res.ok ? { text, items: off.undo } : { text: res.message ?? "Det virket ikke", items: [] });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={button} disabled={working || !live.data.ok || !night.ids.length} onClick={() => void run(night, "God natt – alt lys er av")}>
        <Moon size={14} aria-hidden />
        God natt
      </button>
      <button type="button" className={button} disabled={working || !live.data.ok || !outside.ids.length} onClick={() => void run(outside, "Utelyset er av")}>
        <LightbulbOff size={14} aria-hidden />
        Utelys av
      </button>
      {undo ? (
        <span className="flex items-center gap-2 text-xs text-ink-light" role="status">
          {undo.text}
          {undo.items.length > 0 && (
            <button
              type="button"
              className="inline-flex items-center gap-1 font-semibold text-ink underline underline-offset-2"
              onClick={() => {
                const items = undo.items;
                setUndo(null);
                void live.undo(items);
              }}
            >
              <Undo2 size={12} aria-hidden />
              Angre
            </button>
          )}
        </span>
      ) : (
        <span className="text-xs text-ink-light">{night.ids.length ? `${night.ids.length} lys på` : "Alt lys er av"}</span>
      )}
    </div>
  );
}

/** Én linje per område (lys, varme, persienner, roboter, vanning). Trykk åpner området. */
export function HouseStatusList({ live, onArea }: { live: HouseLive; onArea: (area: StatusArea) => void }) {
  const { data } = live;
  if (!data.ok) return <p className="text-xs text-ink-light">{data.message}</p>;
  const rows = houseStatus(data.home, data.robots, data.watering);
  return (
    <ul className="flex flex-col">
      {rows.map((r) => (
        <li key={r.area}>
          <button type="button" onClick={() => onArea(r.area)} className="flex min-h-9 w-full items-center gap-2 border-b border-line text-left last:border-0 hover:bg-card-soft">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.alert ? "bg-danger" : r.active ? "bg-primary" : "bg-line"}`} aria-hidden />
            <span className="w-20 shrink-0 text-xs text-ink-light">{r.label}</span>
            <span className={`min-w-0 flex-1 text-xs wrap-break-word ${r.alert ? "font-semibold text-danger" : "text-ink"}`}>{r.value}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Det som spiller nå, med spill/pause. */
export function HouseNowPlaying({ live }: { live: HouseLive }) {
  const { groups, ok } = live.data;
  const list = playingNow(groups);
  const [pending, setPending] = useState<string | null>(null);
  if (!ok) return null;
  if (!list.length) return <p className="text-xs text-ink-light">Ingenting spiller.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {list.map((p) => {
        const leader = groups.find((g) => g.leader.id === p.leader)!.leader;
        return (
          <li key={p.leader} className="flex items-center gap-2">
            <Cover speaker={leader} size="h-9 w-9" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold wrap-break-word">{p.rooms}</p>
              <p className="text-xs text-ink-light wrap-break-word">{p.title}</p>
            </div>
            <button
              type="button"
              disabled={pending === p.leader}
              aria-label={`Pause ${p.rooms}`}
              onClick={async () => {
                setPending(p.leader);
                await live.toggle(p.leader);
                setPending(null);
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line transition hover:border-ink-faint disabled:opacity-40"
            >
              {leader.status === "playing" ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
