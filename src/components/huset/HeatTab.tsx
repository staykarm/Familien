"use client";

import { Droplets, Flame, Minus, Plus } from "lucide-react";
import { card } from "@/components/ui/styles";
import { stepTarget, type Climate, type HomeState } from "@/lib/huset/home";
import type { HomeCommand } from "@/lib/validation/huset";
import { usePending } from "./usePending";

interface Props {
  home: HomeState;
  run: (cmd: HomeCommand) => Promise<void>;
}

const temp = (v: number | null, digits = 1) =>
  v === null ? "–" : `${v.toLocaleString("nb-NO", { minimumFractionDigits: digits, maximumFractionDigits: digits })}°`;

function StepButton({ onClick, label, children, disabled }: { onClick: () => void; label: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-line bg-card transition active:scale-95 hover:border-primary disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Varme per rom: målt temperatur, fukt og gulv, og ønsket temperatur med −/+ i halve grader. */
export function HeatTab({ home, run }: Props) {
  const pending = usePending<Climate>();
  const climates = home.rooms.flatMap((r) => (r.climate ? [r.climate] : []));

  function change(c: Climate, delta: number) {
    const next = stepTarget(c, delta);
    if (next === null || next === c.target) return;
    void pending.send(c.id, { target: next }, () => run({ action: "climate", id: c.id, temperature: next }));
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className={`${card} flex flex-col divide-y-2 divide-line py-1`}>
        {climates.map((raw) => {
          const c = pending.show(raw.id, raw);
          const off = !c.available;
          return (
            <li key={c.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 ${off ? "opacity-50" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-bold wrap-break-word">
                  {c.name}
                  {c.heating && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary-dark">
                      <Flame size={12} aria-hidden />
                      Varmer
                    </span>
                  )}
                </p>
                <p className="flex flex-wrap gap-x-3 text-sm text-ink-light">
                  <span>
                    Nå <span className="font-bold text-ink">{temp(c.current)}</span>
                  </span>
                  {c.humidity !== null && (
                    <span className="inline-flex items-center gap-0.5">
                      <Droplets size={12} aria-hidden />
                      {Math.round(c.humidity)} %
                    </span>
                  )}
                  {c.floor !== null && <span>Gulv {temp(c.floor)}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StepButton onClick={() => change(c, -0.5)} label={`Lavere i ${c.name}`} disabled={off || c.target === null || c.target <= c.min}>
                  <Minus size={20} aria-hidden />
                </StepButton>
                <span className="w-16 text-center font-display text-xl font-bold tabular-nums" aria-label={`Ønsket temperatur i ${c.name}`}>
                  {temp(c.target)}
                </span>
                <StepButton onClick={() => change(c, 0.5)} label={`Høyere i ${c.name}`} disabled={off || c.target === null || c.target >= c.max}>
                  <Plus size={20} aria-hidden />
                </StepButton>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
