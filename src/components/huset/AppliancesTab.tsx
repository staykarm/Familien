"use client";

import { DoorOpen, TriangleAlert } from "lucide-react";
import { APPLIANCE_ICON, applianceText, progress, type Appliance } from "@/lib/huset/appliances";
import { AppLink } from "./parts";

// Miele-maskinene: status, program, fase, tid igjen, nivåer og varsler. Bare visning – maskinene startes
// og stoppes på maskinen eller i Miele-appen.

const panel = "rounded-2xl bg-card px-3 py-2 shadow-[0_2px_12px_rgba(120,90,60,0.08)]";

/** Én maskin. Brukes i fanen «Maskiner» og i arket for rommet på kartet. */
export function ApplianceLine({ appliance: a }: { appliance: Appliance }) {
  const share = progress(a);
  const tone = a.failure ? "text-danger" : a.done ? "text-[#2e9d57]" : a.running ? "text-primary-dark" : "text-ink-light";
  return (
    <div className={`flex flex-col gap-1 border-b border-line py-2 last:border-0 ${a.status === "not_connected" ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="text-lg leading-none" aria-hidden>
          {APPLIANCE_ICON[a.kind]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold wrap-break-word">{a.name}</p>
          <p className={`text-xs wrap-break-word ${tone} ${a.done || a.failure ? "font-semibold" : ""}`}>{applianceText(a)}</p>
        </div>
        {a.doorOpen && (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-light">
            <DoorOpen size={12} aria-hidden /> Dør åpen
          </span>
        )}
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${a.failure ? "bg-danger text-white" : a.done ? "bg-mint" : a.running ? "bg-primary-soft text-primary-dark" : "bg-card-soft text-ink-light"}`}>
          {a.statusText}
        </span>
      </div>
      {share !== null && (
        <div className="ml-7 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(share * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${a.name}: ${Math.round(share * 100)} % ferdig`}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${share * 100}%` }} />
        </div>
      )}
      {a.levels.length > 0 && (
        <p className="ml-7 flex flex-wrap gap-x-3 text-xs text-ink-light">
          {a.levels.map((l) => (
            <span key={l.name} className={l.low ? "font-semibold text-[#b07d00]" : ""}>
              {l.name} {l.percent} %{l.low ? " – fyll på" : ""}
            </span>
          ))}
        </p>
      )}
      {a.alerts.map((alert) => (
        <p key={alert} className="ml-7 flex items-center gap-1 text-xs font-semibold text-danger">
          <TriangleAlert size={12} className="shrink-0" aria-hidden /> {alert}
        </p>
      ))}
    </div>
  );
}

/** Fanen «Maskiner» i Huset: maskinene etter rom. */
export function AppliancesTab({ appliances }: { appliances: Appliance[] }) {
  if (!appliances.length) return <p className="text-sm text-ink-light">Fant ingen Miele-maskiner i Home Assistant.</p>;
  const groups = [
    { title: "Vaskerom", list: appliances.filter((a) => a.kind === "vask" || a.kind === "tork") },
    { title: "Kjøkken", list: appliances.filter((a) => a.kind === "oppvask" || a.kind === "ovn") },
  ].filter((g) => g.list.length);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid items-start gap-2 lg:grid-cols-2">
        {groups.map((g) => (
          <section key={g.title} className={panel} aria-label={g.title}>
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-light">{g.title}</h3>
            {g.list.map((a) => (
              <ApplianceLine key={a.id} appliance={a} />
            ))}
          </section>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-light">Maskinene startes og stoppes på maskinen eller i Miele-appen.</p>
        <AppLink app="miele" />
      </div>
    </div>
  );
}
