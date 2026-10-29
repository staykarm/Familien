"use client";

import { useCallback, useEffect, useState } from "react";
import { LightbulbOff, Moon, Pause, Play, Undo2 } from "lucide-react";
import { controlHome, controlSpeaker, undoHouse, type HouseData } from "@/actions/huset";
import { goodNight, houseStatus, outdoorOff, playingNow, type LightsOff, type StatusArea } from "@/lib/huset/dashboard";
import type { UndoItem } from "@/lib/huset/agentTargets";
import { Cover } from "./parts";

// Huset på dashboardet: felles tilstand, «God natt», status per område og det som spiller. Kartet er
// Kart-fanen fra Huset (`HousePage fixedTab="kart"`), så det virker likt begge steder.
// Brukes bare via components/huset/public.tsx.

/** Home Assistant trenger et øyeblikk før en endring vises. */
const SETTLE_MS = 700;
/** Så lenge «Angre» står etter «God natt». */
const UNDO_MS = 10_000;

export interface HouseLive {
  data: HouseData;
  /** Ny tilstand fra kartet (`HousePage onData`), som henter den selv hvert 4. sekund. */
  push: (data: HouseData) => void;
  /** Øker når noe er endret her, så kartet henter ny tilstand med en gang (`HousePage refreshKey`). */
  version: number;
  refresh: () => void;
  /** Slår av lysene og gir beskjed om hvordan det gikk. */
  lightsOff: (off: LightsOff) => Promise<{ ok: boolean; message?: string }>;
  undo: (items: UndoItem[]) => Promise<void>;
  toggle: (leaderId: string) => Promise<void>;
}

/**
 * Tilstanden i huset på dashboardet. Kartet (samme `HousePage` som i Huset) henter den og sender den hit,
 * så det bare er én som spør Home Assistant, og alt på siden viser det samme.
 */
export function useHouseLive(initial: HouseData): HouseLive {
  const [data, setData] = useState(initial);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const settle = useCallback(async () => {
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    setVersion((v) => v + 1);
  }, []);

  return {
    data,
    push: setData,
    version,
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

const button =
  "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-ink transition hover:border-ink-faint disabled:opacity-40";

/** «God natt» (alt lys inne av, utelyset røres ikke) og «Utelys av», med «Angre» en liten stund etterpå. */
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
      <button type="button" className={button} disabled={working || !live.data.ok || !night.ids.length} onClick={() => void run(night, "God natt – lyset inne er av")}>
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
        <span className="text-xs text-ink-light">{night.ids.length ? `${night.ids.length} lys på inne` : "Alt lys inne er av"}</span>
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
