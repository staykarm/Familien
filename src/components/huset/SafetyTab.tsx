"use client";

import { BatteryLow, Flame, ShieldCheck, ShieldAlert, Activity, WifiOff } from "lucide-react";
import type { Safety } from "@/lib/huset/safety";

// Sikkerhet (Homely): alarmen, røykvarslerne og bevegelsessensoren. Bare visning – alarmen styres i Homely-appen.

const panel = "rounded-2xl bg-card px-3 py-2 shadow-[0_2px_12px_rgba(120,90,60,0.08)]";

/** Rødt banner når en røykvarsler har gått eller alarmen er utløst. */
export function SafetyBanner({ safety }: { safety: Safety }) {
  if (!safety.urgent) return null;
  return (
    <div className="flex items-start gap-2 rounded-2xl bg-danger px-4 py-3 text-white" role="alert">
      <Flame size={20} className="mt-0.5 shrink-0" aria-hidden />
      <div className="flex flex-col">
        {safety.problems
          .filter((p) => p.startsWith("Brann") || p.startsWith("Innbrudd"))
          .map((p) => (
            <p key={p} className="font-bold">
              {p}
            </p>
          ))}
        <p className="text-sm opacity-90">Sjekk huset, og se Homely-appen.</p>
      </div>
    </div>
  );
}

export function SafetyTab({ safety }: { safety: Safety }) {
  if (!safety.alarm && !safety.smoke.length) return <p className="text-sm text-ink-light">Fant ikke Homely i Home Assistant.</p>;
  const { alarm } = safety;
  return (
    <div className="flex flex-col gap-2">
      <SafetyBanner safety={safety} />
      {alarm && (
        <section className={`${panel} flex items-center gap-3 py-3`} aria-label="Alarm">
          {alarm.armed || alarm.triggered ? <ShieldAlert size={28} className={alarm.triggered ? "text-danger" : "text-ink"} aria-hidden /> : <ShieldCheck size={28} className="text-ink-light" aria-hidden />}
          <div className="flex-1">
            <p className="text-xs text-ink-light">Innbruddsalarm</p>
            <p className={`text-lg font-bold ${alarm.triggered ? "text-danger" : ""}`}>{alarm.label}</p>
          </div>
          <p className="max-w-48 text-right text-xs text-ink-light">Slås av og på i Homely-appen.</p>
        </section>
      )}
      {safety.smoke.length > 0 && (
        <section className={panel} aria-label="Røykvarslere">
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-light">Røykvarslere</h3>
          <ul className="flex flex-col">
            {safety.smoke.map((s) => (
              <li key={s.id} className="flex items-center gap-2 border-b border-line py-1.5 last:border-0">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.fire ? "bg-danger" : !s.online || s.lowBattery ? "bg-[#d89b00]" : "bg-[#2e9d57]"}`} aria-hidden />
                <span className="min-w-0 flex-1 text-sm font-semibold wrap-break-word">{s.name}</span>
                {s.temperature !== null && <span className="text-xs tabular-nums text-ink-light">{s.temperature.toLocaleString("nb-NO", { maximumFractionDigits: 1 })}°</span>}
                <span className={`inline-flex items-center gap-1 text-xs ${s.fire ? "font-bold text-danger" : "text-ink-light"}`}>
                  {s.fire ? (
                    <>
                      <Flame size={12} aria-hidden /> Brann!
                    </>
                  ) : !s.online ? (
                    <>
                      <WifiOff size={12} aria-hidden /> Svarer ikke
                    </>
                  ) : s.lowBattery ? (
                    <>
                      <BatteryLow size={12} aria-hidden /> Lavt batteri
                    </>
                  ) : (
                    "OK"
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {safety.motion.length > 0 && (
        <section className={panel} aria-label="Bevegelse">
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-light">Bevegelse</h3>
          <ul className="flex flex-col">
            {safety.motion.map((m) => (
              <li key={m.id} className="flex items-center gap-2 py-1.5">
                <Activity size={14} className={m.motion ? "text-primary" : "text-ink-faint"} aria-hidden />
                <span className="flex-1 text-sm font-semibold">{m.name}</span>
                <span className="text-xs text-ink-light">{!m.online ? "Svarer ikke" : m.motion ? "Bevegelse nå" : "Rolig"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
