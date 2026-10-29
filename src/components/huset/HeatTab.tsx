"use client";

import { Droplets, Flame, Minus, Plus } from "lucide-react";
import { stepTarget, type Climate, type HomeState } from "@/lib/huset/home";
import type { HomeCommand } from "@/lib/validation/huset";
import { IconButton } from "./parts";
import { usePending } from "./usePending";

interface Props {
  home: HomeState;
  run: (cmd: HomeCommand) => Promise<void>;
}

const temp = (v: number | null) =>
  v === null ? "–" : `${v.toLocaleString("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°`;

/** Varme per rom på én linje: navn, målt temperatur, fukt og gulv, og ønsket temperatur med −/+ i halve grader. */
export function HeatTab({ home, run }: Props) {
  const pending = usePending<Climate>();
  const climates = home.rooms.flatMap((r) => (r.climate ? [r.climate] : []));

  function change(c: Climate, delta: number) {
    const next = stepTarget(c, delta);
    if (next === null || next === c.target) return;
    void pending.send(c.id, { target: next }, () => run({ action: "climate", id: c.id, temperature: next }));
  }

  return (
    <ul className="grid gap-x-4 rounded-2xl bg-card px-3 py-1 shadow-[0_2px_12px_rgba(120,90,60,0.08)] md:grid-cols-2 xl:grid-cols-3">
      {climates.map((raw) => {
        const c = pending.show(raw.id, raw);
        const off = !c.available;
        return (
          <li key={c.id} className={`flex items-center gap-2 border-b border-line py-1 ${off ? "opacity-50" : ""}`}>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 text-sm font-semibold wrap-break-word">
                {c.name}
                {c.heating && <Flame size={13} className="shrink-0 text-primary-dark" aria-label="Varmer" />}
              </p>
              <p className="flex flex-wrap gap-x-2 text-xs text-ink-light">
                <span>
                  Nå <span className="font-bold text-ink">{temp(c.current)}</span>
                </span>
                {c.humidity !== null && (
                  <span className="inline-flex items-center gap-0.5">
                    <Droplets size={11} aria-hidden />
                    {Math.round(c.humidity)} %
                  </span>
                )}
                {c.floor !== null && <span>Gulv {temp(c.floor)}</span>}
              </p>
            </div>
            <IconButton onClick={() => change(c, -0.5)} label={`Lavere i ${c.name}`} disabled={off || c.target === null || c.target <= c.min}>
              <Minus size={16} aria-hidden />
            </IconButton>
            <span className="w-12 text-center text-base font-bold tabular-nums" aria-label={`Ønsket temperatur i ${c.name}`}>
              {temp(c.target)}
            </span>
            <IconButton onClick={() => change(c, 0.5)} label={`Høyere i ${c.name}`} disabled={off || c.target === null || c.target >= c.max}>
              <Plus size={16} aria-hidden />
            </IconButton>
          </li>
        );
      })}
    </ul>
  );
}
