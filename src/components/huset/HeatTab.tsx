"use client";

import { Droplets, Flame, Minus, Plus } from "lucide-react";
import { airText, CO2_HIGH, WEAK_SIGNAL, type AirSensor } from "@/lib/huset/air";
import { stepTarget, type Climate, type HomeState, type Switch } from "@/lib/huset/home";
import type { HomeCommand } from "@/lib/validation/huset";
import { IconButton } from "./parts";
import { usePending } from "./usePending";
import { DeviceArt } from "./DeviceArt";

interface Props {
  home: HomeState;
  run: (cmd: HomeCommand) => Promise<void>;
}

const temp = (v: number | null) =>
  v === null ? "–" : `${v.toLocaleString("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°`;

/** Ett rom på én linje: navn, målt temperatur, fukt og gulv, og ønsket temperatur med −/+ i halve grader. */
function ClimateRow({ climate, pending, run }: { climate: Climate; pending: ReturnType<typeof usePending<Climate>>; run: Props["run"] }) {
  const c = pending.show(climate.id, climate);
  const off = !c.available;
  function change(delta: number) {
    const next = stepTarget(c, delta);
    if (next === null || next === c.target) return;
    void pending.send(c.id, { target: next }, () => run({ action: "climate", id: c.id, temperature: next }));
  }
  return (
    <li className={`flex items-center gap-2 border-b border-line py-1 ${off ? "opacity-50" : ""}`}>
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
      <IconButton onClick={() => change(-0.5)} label={`Lavere i ${c.name}`} disabled={off || c.target === null || c.target <= c.min}>
        <Minus size={16} aria-hidden />
      </IconButton>
      <span className="w-12 text-center text-base font-bold tabular-nums" aria-label={`Ønsket temperatur i ${c.name}`}>
        {temp(c.target)}
      </span>
      <IconButton onClick={() => change(0.5)} label={`Høyere i ${c.name}`} disabled={off || c.target === null || c.target >= c.max}>
        <Plus size={16} aria-hidden />
      </IconButton>
    </li>
  );
}

/** Én luftsensor: navn, målinger og varsel om dårlig luft eller svakt signal. */
export function AirLine({ air, showName = false }: { air: AirSensor; showName?: boolean }) {
  const high = air.online && air.co2 !== null && air.co2 > CO2_HIGH;
  return (
    <div className={`flex items-center gap-2 border-b border-line py-1 last:border-0 ${air.online ? "" : "opacity-50"}`}>
      <DeviceArt kind="air" size={26} active={high} off={!air.online} />
      <div className="min-w-0 flex-1">
        {showName && <p className="text-sm font-semibold wrap-break-word">{air.name}</p>}
        <p className={`text-xs ${high ? "font-semibold text-danger" : "text-ink-light"}`}>
          {airText(air)}
          {high && " – luft ut"}
        </p>
      </div>
      {air.online && air.signal !== null && air.signal < WEAK_SIGNAL && <span className="shrink-0 text-xs text-ink-light">svakt signal ({Math.round(air.signal)} %)</span>}
    </div>
  );
}

/** En bryter (varmekabler o.l.) på én linje: navn, status og Slå på / Slå av. */
export function SwitchLine({ item, run }: { item: Switch; run: Props["run"] }) {
  const pending = usePending<Switch>();
  const s = pending.show(item.id, item);
  return (
    <div className={`flex items-center gap-2 border-b border-line py-1 last:border-0 ${s.available ? "" : "opacity-50"}`}>
      <Flame size={14} className={s.on ? "shrink-0 text-primary-dark" : "shrink-0 text-ink-light"} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold wrap-break-word">{s.name}</p>
        <p className="text-xs text-ink-light">{!s.available ? "Svarer ikke" : s.on ? "På" : "Av"}</p>
      </div>
      <button
        type="button"
        disabled={!s.available}
        aria-pressed={s.on}
        onClick={() => void pending.send(s.id, { on: !s.on }, () => run({ action: "switch", id: s.id, on: !s.on }))}
        className={`min-h-10 shrink-0 rounded-full border-2 px-3 text-sm font-semibold transition disabled:opacity-50 ${s.on ? "border-primary bg-primary-soft text-primary-dark" : "border-line bg-card"}`}
      >
        {s.on ? "Slå av" : "Slå på"}
      </button>
    </div>
  );
}

/** Varmen i ett rom (brukes i arket fra kartet). */
export function ClimateLine({ climate, run }: { climate: Climate; run: Props["run"] }) {
  const pending = usePending<Climate>();
  return (
    <ul>
      <ClimateRow climate={climate} pending={pending} run={run} />
    </ul>
  );
}

/** Varme per rom på én linje: navn, målt temperatur, fukt og gulv, og ønsket temperatur med −/+ i halve grader. */
export function HeatTab({ home, run }: Props) {
  const pending = usePending<Climate>();
  const climates = home.rooms.flatMap((r) => (r.climate ? [r.climate] : []));
  const air = home.air ?? [];
  const switches = home.rooms.flatMap((r) => r.switches ?? []);
  return (
    <div className="flex flex-col gap-2">
      <ul className="grid gap-x-4 rounded-2xl bg-card px-3 py-1 shadow-[0_2px_12px_rgba(120,90,60,0.08)] md:grid-cols-2 xl:grid-cols-3">
        {climates.map((c) => (
          <ClimateRow key={c.id} climate={c} pending={pending} run={run} />
        ))}
      </ul>
      {switches.length > 0 && (
        <section className="rounded-2xl bg-card px-3 py-2 shadow-[0_2px_12px_rgba(120,90,60,0.08)]" aria-label="Ute">
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-light">Ute</h3>
          <div className="grid gap-x-4 md:grid-cols-2 xl:grid-cols-3">
            {switches.map((s) => (
              <SwitchLine key={s.id} item={s} run={run} />
            ))}
          </div>
        </section>
      )}
      {air.length > 0 && (
        <section className="rounded-2xl bg-card px-3 py-2 shadow-[0_2px_12px_rgba(120,90,60,0.08)]" aria-label="Luftsensorer">
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-light">Luftsensorer (Homely)</h3>
          <div className="grid gap-x-4 md:grid-cols-2 xl:grid-cols-3">
            {air.map((a) => (
              <AirLine key={a.id} air={a} showName />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
