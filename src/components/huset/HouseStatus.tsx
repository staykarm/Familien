"use client";

import Link from "next/link";
import { AlarmSmoke, Blinds, Bot, Car, Droplet, Droplets, Lightbulb, Music, PanelTop, ShieldCheck, Thermometer, WashingMachine, Wind, type LucideIcon } from "lucide-react";
import type { PlayingNow, StatusArea, StatusRow } from "@/lib/huset/dashboard";
import { kr, watt, type Energy } from "@/lib/huset/energy";
import type { Safety } from "@/lib/huset/safety";
import { LEVEL_COLOR, LEVEL_TEXT } from "./EnergyTab";

// Felles deler for «Huset nå» og toppen, brukt likt i appen (Huset og «I dag») og på dashboardet.
// `base` er starten på lenken til et område: «/huset?fane=» i appen, «/dashboard?vis=» på dashboardet.

/** Ikonet for hver linje. Bare to farger: blått når noe er i gang, rødt når noe er galt. */
const ICONS: Record<string, LucideIcon> = {
  Alarm: ShieldCheck,
  Røykvarslere: AlarmSmoke,
  Lys: Lightbulb,
  Varme: Thermometer,
  Luft: Wind,
  Takluke: PanelTop,
  Luftfukter: Droplet,
  Maskiner: WashingMachine,
  Persienner: Blinds,
  Roboter: Bot,
  Vanning: Droplets,
  Biler: Car,
};

/** Fargen ikonet får på det fargerike dashboardet (`.dash-farge` i globals.css); ellers grått/blått/rødt som over. */
const HUES: Record<string, string> = {
  Alarm: "himmel",
  Røykvarslere: "rosa",
  Lys: "sol",
  Varme: "fersken",
  Luft: "mint",
  Takluke: "lavendel",
  Luftfukter: "himmel",
  Maskiner: "himmel",
  Persienner: "lavendel",
  Roboter: "himmel",
  Vanning: "mint",
  Biler: "mint",
  Musikk: "rosa",
};

function RowIcon({ icon: Icon, hue, alert = false, active = false }: { icon: LucideIcon; hue?: string; alert?: boolean; active?: boolean }) {
  const tone = alert ? "bg-danger/10 text-danger" : active ? "bg-primary-soft text-primary" : "bg-card-soft text-ink-light";
  return (
    <span data-hue={alert ? undefined : hue} data-active={active || undefined} className={`row-icon flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${tone}`} aria-hidden>
      <Icon size={14} strokeWidth={2} />
    </span>
  );
}

/** Én linje per område (alarm, røykvarslere, lys, luft, varme …), og det som spiller. Trykk åpner området. */
export function HouseStatusRows({ rows, playing = [], base }: { rows: StatusRow[]; playing?: PlayingNow[]; base: string }) {
  return (
    <div className="flex flex-col">
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={`${r.area}-${r.label}`}>
            <Link href={`${base}${r.area}`} className="flex min-h-8 w-full items-center gap-2 border-b border-line py-1 text-left last:border-0 hover:bg-card-soft">
              <RowIcon icon={ICONS[r.label] ?? Lightbulb} hue={HUES[r.label]} alert={r.alert} active={r.active} />
              <span className="w-20 shrink-0 text-xs text-ink-light">{r.label}</span>
              <span className={`min-w-0 flex-1 text-xs wrap-break-word ${r.alert ? "font-semibold text-danger" : "text-ink"}`}>{r.value}</span>
            </Link>
          </li>
        ))}
      </ul>
      {playing.map((p) => (
        <Link key={p.leader} href={`${base}musikk`} className="flex min-h-8 items-center gap-2 py-1 hover:bg-card-soft">
          <RowIcon icon={Music} hue={HUES.Musikk} active />
          <span className="w-20 shrink-0 text-xs text-ink-light wrap-break-word">{p.rooms}</span>
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
