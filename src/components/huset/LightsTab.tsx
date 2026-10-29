"use client";

import { useState } from "react";
import { ChevronRight, LightbulbOff, Moon, Sparkles } from "lucide-react";
import { lightsOn, roomBrightness, type HomeState, type Light, type Room } from "@/lib/huset/home";
import type { HomeCommand } from "@/lib/validation/huset";
import { Range, Toggle } from "./parts";
import { usePending } from "./usePending";

interface Props {
  home: HomeState;
  /** Kjører handlingen og venter til siden har hentet ny tilstand. */
  run: (cmd: HomeCommand) => Promise<void>;
}

type Pending = ReturnType<typeof usePending<Light>> & { run: Props["run"] };

const smallButton =
  "inline-flex min-h-10 items-center gap-1.5 rounded-full border-2 border-line bg-card px-3 text-xs font-bold transition active:scale-95 hover:border-primary disabled:opacity-40";

/** Én linje per lys: navn, lysstyrke og av/på. Trykk på navnet gir fargetemperatur der lyset har det. */
function LightRow({ light, pending }: { light: Light; pending: Pending }) {
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
    <li className={`flex flex-col ${off ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${l.on ? "bg-[#f5b041]" : "bg-line"}`} aria-hidden />
        <button
          type="button"
          className="min-h-10 w-28 shrink-0 text-left text-sm font-semibold wrap-break-word sm:w-32"
          onClick={() => l.kelvin && setOpen((o) => !o)}
          aria-expanded={l.kelvin ? open : undefined}
        >
          {l.name}
          {off && <span className="block text-xs font-normal text-ink-light">Svarer ikke</span>}
        </button>
        {l.dimmable ? (
          <>
            <Range value={l.brightness ?? 0} label={`Lysstyrke ${l.name}`} disabled={off} onChange={setBrightness} className="h-7" />
            <span className="w-8 shrink-0 text-right text-xs tabular-nums text-ink-light">{l.on ? `${l.brightness ?? 0}%` : "Av"}</span>
          </>
        ) : (
          <span className="flex-1" />
        )}
        <Toggle on={l.on} onChange={toggle} label={`${l.name} av/på`} disabled={off} />
      </div>
      {open && l.kelvin && (
        <div className="flex items-center gap-2 pb-1 pl-4 text-xs text-ink-light">
          <span>Varm</span>
          <Range
            value={l.kelvin.value ?? Math.round((l.kelvin.min + l.kelvin.max) / 2)}
            min={l.kelvin.min}
            max={l.kelvin.max}
            step={50}
            label={`Fargetemperatur ${l.name}`}
            disabled={off}
            onChange={setKelvin}
            className="h-7 [accent-color:#f5b041]"
          />
          <span>Kald</span>
        </div>
      )}
    </li>
  );
}

/**
 * Ett rom: hovedlinjen styrer alle lysene i rommet (lysstyrke og av/på).
 * Pila åpner scenene og hvert enkelt lys.
 */
function RoomCard({ room, pending, open, onOpen }: { room: Room; pending: Pending; open: boolean; onOpen: () => void }) {
  const lights = room.lights.map((x) => pending.show(x.id, x));
  const usable = lights.filter((x) => x.available);
  const on = usable.filter((x) => x.on);
  const anyDimmable = usable.some((x) => x.dimmable);
  const level = roomBrightness(usable);
  const ids = usable.map((x) => x.id);

  const setAll = (turnOn: boolean, brightness?: number) => {
    const change = (x: Light) => ({ on: turnOn, brightness: x.dimmable ? (turnOn ? (brightness ?? Math.max(x.brightness ?? 0, 1)) : 0) : null });
    void pending.sendMany(Object.fromEntries(usable.map((x) => [x.id, change(x)])), () =>
      pending.run(turnOn ? { action: "lights_on", ids, ...(brightness !== undefined ? { brightness } : {}) } : { action: "lights_off", ids })
    );
  };
  const slide = (v: number, send: boolean) => {
    if (!send) {
      for (const x of usable) pending.preview(x.id, { on: v > 0, brightness: x.dimmable ? v : null });
      return;
    }
    setAll(v > 0, v > 0 ? v : undefined);
  };

  return (
    <li className="flex flex-col">
      <div className="flex items-center gap-2 py-1">
        <button type="button" onClick={onOpen} aria-expanded={open} className="flex min-h-10 w-32 shrink-0 items-center gap-1 text-left sm:w-40">
          <ChevronRight size={16} className={`shrink-0 text-ink-light transition ${open ? "rotate-90" : ""}`} aria-hidden />
          <span className="min-w-0">
            <span className="block text-sm font-bold wrap-break-word">{room.name}</span>
            <span className="block text-xs text-ink-light">
              {usable.length ? `${on.length} av ${usable.length} på` : "Svarer ikke"}
            </span>
          </span>
        </button>
        {anyDimmable ? (
          <>
            <Range value={level} label={`Lysstyrke i ${room.name}`} disabled={!usable.length} onChange={slide} className="h-7" />
            <span className="w-8 shrink-0 text-right text-xs tabular-nums text-ink-light">{on.length ? `${level}%` : "Av"}</span>
          </>
        ) : (
          <span className="flex-1" />
        )}
        <Toggle on={on.length > 0} onChange={(v) => setAll(v)} label={`Alle lys i ${room.name} av/på`} disabled={!usable.length} />
      </div>
      {open && (
        <div className="mb-2 ml-5 flex flex-col border-l-2 border-line pl-3">
          {room.scenes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 py-1" aria-label={`Scener i ${room.name}`}>
              {room.scenes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => void pending.run({ action: "scene", id: s.id })}
                  className="inline-flex min-h-8 items-center gap-1 rounded-full bg-card-soft px-2.5 text-xs font-semibold transition active:scale-95 hover:bg-primary-soft"
                >
                  <Sparkles size={12} aria-hidden />
                  {s.name}
                </button>
              ))}
            </div>
          )}
          <ul className="flex flex-col">
            {room.lights.map((x) => (
              <LightRow key={x.id} light={x} pending={pending} />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

/** Lys per rom: hovedlinjen styrer hele rommet; pila åpner scener og hvert enkelt lys. */
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

  const [openRooms, setOpenRooms] = useState<Set<string>>(new Set());
  const toggleRoom = (id: string) =>
    setOpenRooms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const inside = rooms.filter((r) => !r.outdoor);
  const outside = rooms.filter((r) => r.outdoor);
  const list = (items: Room[], title: string) => (
    <section aria-label={title} className="rounded-2xl bg-card px-3 py-1 shadow-[0_2px_12px_rgba(120,90,60,0.08)]">
      <h3 className="pt-1 text-xs font-bold uppercase tracking-wide text-ink-light">{title}</h3>
      <ul className="flex flex-col divide-y divide-line">
        {items.map((r) => (
          <RoomCard key={r.id} room={r} pending={pending} open={openRooms.has(r.id)} onOpen={() => toggleRoom(r.id)} />
        ))}
      </ul>
    </section>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={smallButton} disabled={!onIndoor.length && !onOutdoor.length} onClick={() => off([...onIndoor, ...onOutdoor])}>
          <Moon size={14} aria-hidden />
          Alt av i huset
        </button>
        <button type="button" className={smallButton} disabled={!onOutdoor.length} onClick={() => off(onOutdoor)}>
          <LightbulbOff size={14} aria-hidden />
          Utelys av
        </button>
        <span className="text-xs text-ink-light">
          {onIndoor.length} lys på inne, {onOutdoor.length} ute
        </span>
      </div>
      <div className="grid items-start gap-2 lg:grid-cols-2">
        {list(inside, "Inne")}
        {outside.length > 0 && list(outside, "Ute")}
      </div>
    </div>
  );
}
