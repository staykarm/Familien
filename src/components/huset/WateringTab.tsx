"use client";

import { useState } from "react";
import { BatteryMedium, ChevronDown, Droplets, Play, Square, Thermometer, TriangleAlert } from "lucide-react";
import { DEFAULT_MINUTES, QUICK_MINUTES, wateringAdvice, type Valve, type Watering, type ZoneKind } from "@/lib/huset/watering";
import type { HomeCommand } from "@/lib/validation/huset";
import { usePending } from "./usePending";

interface Props {
  watering: Watering;
  outdoorTemp: number | null;
  run: (cmd: HomeCommand) => Promise<void>;
}

const SECTIONS: { kind: ZoneKind; title: string }[] = [
  { kind: "plen", title: "Plen" },
  { kind: "bedd", title: "Bed" },
  { kind: "tak", title: "Takterrasse" },
];

const time = (iso: string) => new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

const panel = "rounded-2xl bg-card px-3 py-2 shadow-[0_2px_12px_rgba(120,90,60,0.08)]";

/** Én sone: status, batteri og feil; velg minutter og «Vann», eller «Stopp» mens den vanner. */
function ValveRow({ valve, pending, run }: { valve: Valve; pending: ReturnType<typeof usePending<Valve>>; run: Props["run"] }) {
  const v = pending.show(valve.id, valve);
  const off = !v.available;
  // Gardenas egen tid brukes bare hvis den er en av hurtigtidene; ellers forslaget for typen sone.
  const [minutes, setMinutes] = useState(() => (valve.minutes && QUICK_MINUTES.includes(valve.minutes) ? valve.minutes : DEFAULT_MINUTES[valve.kind]));
  const status = off ? "Svarer ikke" : v.open ? (v.endsAt ? `Vanner til ${time(v.endsAt)}` : "Vanner") : "Av";
  return (
    <li className={`flex flex-col gap-1 border-b border-line py-2 ${off ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${v.open ? "bg-[#3b9fd8]" : "bg-line"}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold wrap-break-word">{v.name}</p>
          <p className="flex flex-wrap gap-x-2 text-xs text-ink-light">
            <span className={v.open ? "font-bold text-[#1f78b4]" : ""}>{status}</span>
            {v.battery !== null && (
              <span className="inline-flex items-center gap-0.5">
                <BatteryMedium size={12} aria-hidden />
                {v.battery} %
              </span>
            )}
          </p>
        </div>
        {off ? null : v.open ? (
          <button
            type="button"
            disabled={off}
            onClick={() => void pending.send(v.id, { open: false }, () => run({ action: "valve", id: v.id, command: "close" }))}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border-2 border-line bg-card px-3 text-xs font-bold transition hover:border-primary disabled:opacity-40"
          >
            <Square size={12} aria-hidden />
            Stopp
          </button>
        ) : (
          <button
            type="button"
            disabled={off}
            onClick={() => void pending.send(v.id, { open: true }, () => run({ action: "valve", id: v.id, command: "open", minutes }))}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#3b9fd8] px-3 text-xs font-bold text-white transition hover:bg-[#1f78b4] disabled:opacity-40"
          >
            <Play size={12} aria-hidden />
            Vann {minutes} min
          </button>
        )}
      </div>
      {!v.open && !off && (
        <div className="flex flex-wrap gap-1 pl-4" role="group" aria-label={`Vanningstid for ${v.name}`}>
          {QUICK_MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={minutes === m}
              onClick={() => setMinutes(m)}
              className={`min-h-8 rounded-full px-2.5 text-xs font-semibold transition ${minutes === m ? "bg-[#d6ecf8] text-[#1f78b4]" : "bg-card-soft text-ink-light"}`}
            >
              {m} min
            </button>
          ))}
        </div>
      )}
      {v.problem && (
        <p className="flex items-center gap-1.5 pl-4 text-xs font-semibold text-danger">
          <TriangleAlert size={12} className="shrink-0" aria-hidden />
          {v.problem}
        </p>
      )}
    </li>
  );
}

/** Gode tommelfingerregler for vanning med Gardena i norsk klima. */
function Recommendations() {
  const [open, setOpen] = useState(false);
  return (
    <section className={panel}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-10 w-full items-center gap-2 text-left text-sm font-bold">
        <ChevronDown size={16} className={`transition ${open ? "rotate-180" : ""}`} aria-hidden />
        Anbefalte innstillinger
      </button>
      {open && (
        <ul className="flex list-disc flex-col gap-1 pb-2 pl-8 text-sm">
          <li>
            <strong>Plen:</strong> 20–30 min per sone, 2–3 ganger i uka. Sjelden og grundig gir dypere røtter enn litt hver dag.
          </li>
          <li>
            <strong>Bed:</strong> 15–20 min, 2–4 ganger i uka. Hver dag bare i hetebølger.
          </li>
          <li>
            <strong>Takterrasse og krukker:</strong> 10 min hver dag i juni–august, sjeldnere vår og høst. Krukker tørker fortere enn bed.
          </li>
          <li>
            <strong>Tidspunkt:</strong> tidlig morgen, kl. 04–07. Midt på dagen fordamper vannet, og sent på kvelden blir plen og blader liggende våte (sopp).
          </li>
          <li>
            <strong>Hopp over:</strong> når jordsensoren viser over ca. 50 % fukt, eller det har regnet mye siste døgn.
          </li>
          <li>
            <strong>Vinter:</strong> tøm slanger og ventiler, og ta dem inn før første frost (i Oslo vanligvis i oktober). Start igjen i mai.
          </li>
          <li>
            Faste tider settes i Gardena-appen. Senere kan vi lage dem i Home Assistant, slik at vanningen hoppes over når jorda er fuktig nok.
          </li>
        </ul>
      )}
    </section>
  );
}

/** Vanning: jorda øverst med råd, så sonene (plen, bed, takterrasse), og anbefalte innstillinger nederst. */
export function WateringTab({ watering, outdoorTemp, run }: Props) {
  const pending = usePending<Valve>();
  if (!watering.valves.length) return <p className="text-sm text-ink-light">Fant ikke noe vanningsanlegg i Home Assistant.</p>;
  const advice = wateringAdvice(watering.sensors, outdoorTemp);
  const offline = watering.valves.filter((v) => !v.available).length;

  return (
    <div className="flex flex-col gap-2">
      {watering.sensors.length > 0 && (
        <section className={panel} aria-label="Jorda nå">
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-light">Jorda nå</h3>
          <ul className="flex flex-wrap gap-x-6 gap-y-1 py-1">
            {watering.sensors.map((s) => (
              <li key={s.id} className="flex items-center gap-3 text-sm">
                <span className="font-semibold">{s.name}</span>
                <span className="inline-flex items-center gap-0.5">
                  <Droplets size={14} className="text-[#3b9fd8]" aria-hidden />
                  {s.humidity ?? "–"} %
                </span>
                <span className="inline-flex items-center gap-0.5 text-ink-light">
                  <Thermometer size={14} aria-hidden />
                  {s.temperature ?? "–"} °C
                </span>
              </li>
            ))}
          </ul>
          {advice.map((a) => (
            <p key={a.text} className={`text-xs ${a.level === "warn" ? "font-semibold text-danger" : a.level === "info" ? "text-ink" : "text-ink-light"}`}>
              {a.text}
            </p>
          ))}
        </section>
      )}

      {offline > 0 && (
        <p className="text-xs text-ink-light">
          {offline} av {watering.valves.length} ventiler svarer ikke. Er de tatt inn for vinteren, er det som det skal være.
        </p>
      )}

      <div className="grid items-start gap-2 lg:grid-cols-2">
        {SECTIONS.map(({ kind, title }) => {
          const valves = watering.valves.filter((v) => v.kind === kind);
          if (!valves.length) return null;
          return (
            <section key={kind} className={panel} aria-label={title}>
              <h3 className="text-xs font-bold uppercase tracking-wide text-ink-light">{title}</h3>
              <ul className="flex flex-col">
                {valves.map((v) => (
                  <ValveRow key={v.id} valve={v} pending={pending} run={run} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <Recommendations />
    </div>
  );
}
