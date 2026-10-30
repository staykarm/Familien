"use client";

import { useCallback, useEffect, useState } from "react";
import { LightbulbOff, Moon, Undo2 } from "lucide-react";
import { controlHome, controlSpeaker, undoHouse, type HouseData } from "@/actions/huset";
import { goodNight, houseStatus, outdoorOff, playingNow, type LightsOff } from "@/lib/huset/dashboard";
import type { UndoItem } from "@/lib/huset/agentTargets";
import { HouseStatusRows } from "./HouseStatus";

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

/** «Huset nå» på dashboardet: samme linjer som på «I dag» (`HouseStatusRows`), med lenker til undersidene. */
export function HouseStatusList({ live, base }: { live: HouseLive; base: string }) {
  const { data } = live;
  if (!data.ok) return <p className="text-xs text-ink-light">{data.message}</p>;
  return <HouseStatusRows rows={houseStatus(data.home, data.robots, data.watering, data.energy, data.safety)} playing={playingNow(data.groups)} base={base} />;
}
