"use client";

import { useState } from "react";
import { Droplets, Flame, Lock, Minus, Plus } from "lucide-react";
import { airText, CO2_HIGH, VOC_HELP, WEAK_SIGNAL, type AirSensor } from "@/lib/huset/air";
import { stepTarget, type Climate, type HomeState, type Switch } from "@/lib/huset/home";
import type { HomeCommand } from "@/lib/validation/huset";
import { IconButton } from "./parts";
import { usePending } from "./usePending";
import { DeviceArt } from "./DeviceArt";

interface Props {
  home: HomeState;
  run: (cmd: HomeCommand) => Promise<unknown>;
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

/** Forklaringen på VOC og luftkvaliteten, når sensorene måler det. */
export function AirHelp({ air }: { air: AirSensor[] }) {
  if (!air.some((a) => a.voc !== null || a.quality !== null)) return null;
  return <p className="pt-1 text-xs text-ink-light wrap-break-word">{VOC_HELP}</p>;
}

/** Svaret fra en handling, hvis det finnes (`run` gir `{ ok, message }` fra serveren). */
function resultOf(res: unknown): { ok: boolean; message?: string } | null {
  return res && typeof res === "object" && "ok" in res ? (res as { ok: boolean; message?: string }) : null;
}

/**
 * En bryter (varmekabler o.l.) på én linje: navn, status og Slå på / Slå av. Å slå på krever koden
 * (HOUSE_SWITCH_PIN, sjekkes på serveren): «Slå på» åpner et felt for koden på linjen. Å slå av går med en gang.
 */
export function SwitchLine({ item, run }: { item: Switch; run: Props["run"] }) {
  const pending = usePending<Switch>();
  const s = pending.show(item.id, item);
  const [asking, setAsking] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function turnOn() {
    if (!/^\d{4,8}$/.test(pin) || busy) return;
    setBusy(true);
    setError(null);
    const res = resultOf(await run({ action: "switch", id: s.id, on: true, pin }));
    setBusy(false);
    setPin("");
    if (res && !res.ok) {
      setError(res.message ?? "Det virket ikke");
      return;
    }
    setAsking(false);
  }

  return (
    <div className={`border-b border-line py-1 last:border-0 ${s.available ? "" : "opacity-50"}`}>
      <div className="flex items-center gap-2">
        <Flame size={14} className={s.on ? "shrink-0 text-primary-dark" : "shrink-0 text-ink-light"} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold wrap-break-word">{s.name}</p>
          <p className="text-xs text-ink-light">{!s.available ? "Svarer ikke" : s.on ? "På" : "Av"}</p>
        </div>
        {s.on ? (
          <button
            type="button"
            disabled={!s.available}
            aria-pressed
            onClick={() => void pending.send(s.id, { on: false }, () => run({ action: "switch", id: s.id, on: false }))}
            className="min-h-10 shrink-0 rounded-full border-2 border-primary bg-primary-soft px-3 text-sm font-semibold text-primary-dark transition disabled:opacity-50"
          >
            Slå av
          </button>
        ) : (
          !asking && (
            <button
              type="button"
              disabled={!s.available}
              aria-pressed={false}
              onClick={() => {
                setAsking(true);
                setError(null);
              }}
              className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full border-2 border-line bg-card px-3 text-sm font-semibold transition disabled:opacity-50"
            >
              <Lock size={12} aria-hidden />
              Slå på
            </button>
          )
        )}
      </div>
      {asking && !s.on && (
        <form
          className="mt-1 flex flex-wrap items-center gap-2 pl-6"
          onSubmit={(e) => {
            e.preventDefault();
            void turnOn();
          }}
        >
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            placeholder="Kode"
            aria-label={`Kode for å slå på ${s.name.toLowerCase()}`}
            className="min-h-10 w-28 rounded-xl border border-line bg-card-soft px-3 text-center tracking-[0.3em] outline-none focus:border-ink-faint"
          />
          <button type="submit" disabled={busy || pin.length < 4} className="min-h-10 rounded-full bg-primary px-4 text-sm font-semibold text-white transition disabled:opacity-50">
            {busy ? "Sjekker …" : "Slå på"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAsking(false);
              setPin("");
              setError(null);
            }}
            className="min-h-10 rounded-full px-3 text-sm font-semibold text-ink-light"
          >
            Avbryt
          </button>
          {error && (
            <p role="alert" className="basis-full text-xs font-semibold text-danger">
              {error}
            </p>
          )}
        </form>
      )}
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
          <AirHelp air={air} />
        </section>
      )}
    </div>
  );
}
