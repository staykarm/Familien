"use client";

import Link from "next/link";
import { Music } from "lucide-react";
import type { PlayingNow, StatusArea, StatusRow } from "@/lib/huset/dashboard";
import { kr, watt, type Energy } from "@/lib/huset/energy";
import type { Safety } from "@/lib/huset/safety";
import { LEVEL_COLOR, LEVEL_TEXT } from "./EnergyTab";

// Felles deler for «Huset nå» og toppen, brukt likt i appen (Huset og «I dag») og på dashboardet.
// `base` er starten på lenken til et område: «/huset?fane=» i appen, «/dashboard?vis=» på dashboardet.

/** Én linje per område (alarm, røykvarslere, lys, luft, varme …), og det som spiller. Trykk åpner området. */
export function HouseStatusRows({ rows, playing = [], base }: { rows: StatusRow[]; playing?: PlayingNow[]; base: string }) {
  return (
    <div className="flex flex-col">
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={`${r.area}-${r.label}`}>
            <Link href={`${base}${r.area}`} className="flex min-h-8 w-full items-center gap-2 border-b border-line py-1 text-left last:border-0 hover:bg-card-soft">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.alert ? "bg-danger" : r.active ? "bg-primary" : "bg-line"}`} aria-hidden />
              <span className="w-24 shrink-0 text-xs text-ink-light">{r.label}</span>
              <span className={`min-w-0 flex-1 text-xs wrap-break-word ${r.alert ? "font-semibold text-danger" : "text-ink"}`}>{r.value}</span>
            </Link>
          </li>
        ))}
      </ul>
      {playing.map((p) => (
        <Link key={p.leader} href={`${base}musikk`} className="flex min-h-8 items-center gap-2 py-1 hover:bg-card-soft">
          <Music size={12} className="shrink-0 text-primary" aria-hidden />
          <span className="w-24 shrink-0 text-xs text-ink-light wrap-break-word">{p.rooms}</span>
          <span className="min-w-0 flex-1 text-xs wrap-break-word">{p.title}</span>
        </Link>
      ))}
    </div>
  );
}

/** Strømpris (farget etter nivå) med effekt, og alarmstatus. Lenker (`base`) eller knapper (`onOpen`). */
export function HouseChips({ energy, safety, base, onOpen }: { energy: Energy; safety: Safety; base?: string; onOpen?: (area: StatusArea) => void }) {
  const item = (area: StatusArea, className: string, children: React.ReactNode) =>
    base ? (
      <Link href={`${base}${area}`} className={className}>
        {children}
      </Link>
    ) : (
      <button type="button" onClick={() => onOpen?.(area)} className={className}>
        {children}
      </button>
    );
  return (
    <>
      {energy.price !== null &&
        item(
          "strom",
          "flex items-baseline gap-1.5 rounded-lg px-1 hover:bg-card",
          <>
            <span className="text-lg font-semibold tabular-nums" style={{ color: energy.level ? LEVEL_COLOR[energy.level] : undefined }}>
              ⚡ {kr(energy.price)}
            </span>
            <span className="text-xs text-ink-light">
              {energy.level ? LEVEL_TEXT[energy.level] : "per kWh"} · {watt(energy.powerW)}
            </span>
          </>
        )}
      {safety.alarm &&
        item("sikkerhet", `rounded-lg px-1 text-xs hover:bg-card ${safety.alarm.triggered ? "font-bold text-danger" : "text-ink-light"}`, <>🛡️ Alarm {safety.alarm.label.toLowerCase()}</>)}
    </>
  );
}
