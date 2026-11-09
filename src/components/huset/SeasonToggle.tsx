"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Snowflake, Sun } from "lucide-react";

// Sesongvalget for det som står ute (klippere og vanning). Av for sesongen: en boks med «Skru på for sesongen»,
// og enhetene sammenslått under «Vis likevel». I sesong: en liten knapp nederst for å sette dem av om vinteren.

export function SeasonBox({
  resting,
  restingText,
  onChange,
  children,
}: {
  resting: boolean;
  /** «Gressklipperne er av for sesongen.» */
  restingText: string;
  onChange: (inUse: boolean) => Promise<unknown>;
  /** Enhetene, som vises vanlig i sesong og sammenslått ellers. */
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const change = async (inUse: boolean) => {
    setBusy(true);
    try {
      await onChange(inUse);
    } finally {
      setBusy(false);
    }
  };

  if (!resting) {
    return (
      <>
        {children}
        <div className="flex justify-end">
          <button type="button" disabled={busy} onClick={() => void change(false)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-ink-light hover:text-ink disabled:opacity-50">
            <Snowflake size={14} aria-hidden />
            Av for sesongen
          </button>
        </div>
      </>
    );
  }
  return (
    <section className="rounded-2xl bg-card px-3 py-2 shadow-[0_2px_12px_rgba(120,90,60,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm">
          <Snowflake size={16} className="text-[#3b9fd8]" aria-hidden />
          <span>
            <span className="font-semibold">{restingText}</span>
            <span className="block text-xs text-ink-light">Feil og «svarer ikke» vises ikke i «Huset nå» før de skrus på igjen.</span>
          </span>
        </p>
        <button type="button" disabled={busy} onClick={() => void change(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">
          <Sun size={16} aria-hidden />
          {busy ? "Skrur på …" : "Skru på for sesongen"}
        </button>
      </div>
      <details className="group mt-1">
        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 text-xs font-semibold text-ink-light">
          <ChevronDown size={14} className="transition group-open:rotate-180" aria-hidden />
          Vis likevel
        </summary>
        <div className="flex flex-col gap-2 pb-1">{children}</div>
      </details>
    </section>
  );
}
