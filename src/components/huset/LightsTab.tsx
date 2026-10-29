"use client";

import { useState } from "react";
import { Lightbulb, LightbulbOff, Moon, Sparkles } from "lucide-react";
import { buttonSecondary, card } from "@/components/ui/styles";
import { lightsOn, type HomeState, type Light, type Room } from "@/lib/huset/home";
import type { HomeCommand } from "@/lib/validation/huset";
import { Range, Toggle } from "./parts";
import { usePending } from "./usePending";

interface Props {
  home: HomeState;
  /** Kjører handlingen og venter til siden har hentet ny tilstand. */
  run: (cmd: HomeCommand) => Promise<void>;
}

function LightRow({ light, pending }: { light: Light; pending: ReturnType<typeof usePending<Light>> & { run: Props["run"] } }) {
  const l = pending.show(light.id, light);
  const [open, setOpen] = useState(false);
  const off = !l.available;
  const toggle = (on: boolean) =>
    void pending.send(l.id, { on, brightness: l.dimmable ? (on ? Math.max(l.brightness ?? 0, 1) : 0) : null }, () => pending.run({ action: "light", id: l.id, on }));
  const setBrightness = (v: number, send: boolean) => {
    const change = { brightness: v, on: v > 0 };
    if (!send) return pending.preview(l.id, change);
    void pending.send(l.id, change, () => pending.run(v > 0 ? { action: "light", id: l.id, brightness: v } : { action: "light", id: l.id, on: false }));
  };
  const setKelvin = (v: number, send: boolean) => {
    const kelvin = l.kelvin ? { ...l.kelvin, value: v } : null;
    if (!send) return pending.preview(l.id, { kelvin });
    void pending.send(l.id, { kelvin, on: true }, () => pending.run({ action: "light", id: l.id, kelvin: v }));
  };

  return (
    <li className={`flex flex-col gap-1 py-2 ${off ? "opacity-50" : ""}`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${l.on ? "bg-sun text-ink" : "bg-card-soft text-ink-faint"}`} aria-hidden>
            {l.on ? <Lightbulb size={18} /> : <LightbulbOff size={18} />}
          </span>
          <button
            type="button"
            className="min-h-11 min-w-0 flex-1 text-left font-bold wrap-break-word"
            onClick={() => l.kelvin && setOpen((o) => !o)}
            aria-expanded={l.kelvin ? open : undefined}
          >
            {l.name}
            {off && <span className="block text-sm font-normal text-ink-light">Svarer ikke</span>}
          </button>
          <Toggle on={l.on} onChange={toggle} label={`${l.name} av/på`} disabled={off} />
        </div>
        {l.dimmable && (
          <div className="flex items-center gap-3 sm:w-60 lg:w-72">
            <Range value={l.brightness ?? 0} min={0} max={100} label={`Lysstyrke ${l.name}`} disabled={off} onChange={setBrightness} />
            <span className="w-9 shrink-0 text-right text-sm tabular-nums text-ink-light">{l.on ? `${l.brightness ?? 0}%` : "Av"}</span>
          </div>
        )}
      </div>
      {open && l.kelvin && (
        <div className="flex items-center gap-3 pl-12 text-sm text-ink-light">
          <span>Varm</span>
          <Range
            value={l.kelvin.value ?? Math.round((l.kelvin.min + l.kelvin.max) / 2)}
            min={l.kelvin.min}
            max={l.kelvin.max}
            step={50}
            label={`Fargetemperatur ${l.name}`}
            disabled={off}
            onChange={setKelvin}
            className="[accent-color:#f5b041]"
          />
          <span>Kald</span>
        </div>
      )}
    </li>
  );
}

function RoomCard({ room, pending }: { room: Room; pending: ReturnType<typeof usePending<Light>> & { run: Props["run"] } }) {
  const lights = room.lights.map((x) => pending.show(x.id, x));
  const on = lights.filter((x) => x.on && x.available);
  const allOff = () =>
    void pending.sendMany(Object.fromEntries(on.map((x) => [x.id, { on: false, brightness: x.dimmable ? 0 : null }])), () =>
      pending.run({ action: "lights_off", ids: on.map((x) => x.id) })
    );
  return (
    <section className={`${card} flex flex-col gap-1`} aria-label={room.name}>
      <header className="flex items-center gap-3">
        <h3 className="min-w-0 flex-1 font-display text-lg font-bold wrap-break-word">
          {room.name}
          <span className="ml-2 text-sm font-normal text-ink-light">{on.length ? `${on.length} på` : "Alt av"}</span>
        </h3>
        {on.length > 0 && (
          <button type="button" className={`${buttonSecondary} shrink-0`} onClick={allOff} aria-label={`Slå av alt i ${room.name}`}>
            <LightbulbOff size={18} aria-hidden />
            <span className="hidden sm:inline">Alt av</span>
          </button>
        )}
      </header>
      {room.scenes.length > 0 && (
        <div className="flex flex-wrap gap-2 py-1" aria-label={`Scener i ${room.name}`}>
          {room.scenes.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => void pending.run({ action: "scene", id: s.id })}
              className="flex min-h-10 items-center gap-1.5 rounded-full border-2 border-line bg-card px-3 text-sm font-bold transition active:scale-95 hover:border-primary"
            >
              <Sparkles size={14} aria-hidden />
              {s.name}
            </button>
          ))}
        </div>
      )}
      <ul className="flex flex-col divide-y-2 divide-line">
        {room.lights.map((x) => (
          <LightRow key={x.id} light={x} pending={pending} />
        ))}
      </ul>
    </section>
  );
}

/** Lys per rom: av/på, lysstyrke, fargetemperatur (trykk på navnet), Hue-scener og «Alt av». */
export function LightsTab({ home, run }: Props) {
  const pending = { ...usePending<Light>(), run };
  const rooms = home.rooms.filter((r) => r.lights.length);
  const shown = rooms.map((r) => ({ ...r, lights: r.lights.map((x) => pending.show(x.id, x)) }));
  const onIndoor = lightsOn(shown.filter((r) => !r.outdoor));
  const onOutdoor = lightsOn(shown.filter((r) => r.outdoor));

  function off(lights: Light[]) {
    void pending.sendMany(Object.fromEntries(lights.map((x) => [x.id, { on: false, brightness: x.dimmable ? 0 : null }])), () =>
      run({ action: "lights_off", ids: lights.map((x) => x.id) })
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonSecondary} disabled={!onIndoor.length && !onOutdoor.length} onClick={() => off([...onIndoor, ...onOutdoor])}>
          <Moon size={18} aria-hidden />
          Alt av i huset
        </button>
        <button type="button" className={buttonSecondary} disabled={!onOutdoor.length} onClick={() => off(onOutdoor)}>
          <LightbulbOff size={18} aria-hidden />
          Utelys av
        </button>
        <span className="self-center text-sm text-ink-light">
          {onIndoor.length} lys på inne, {onOutdoor.length} ute
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {rooms.map((r) => (
          <RoomCard key={r.id} room={r} pending={pending} />
        ))}
      </div>
    </div>
  );
}
