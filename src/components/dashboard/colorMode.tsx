"use client";

import { useSyncExternalStore } from "react";
import { Palette } from "lucide-react";

// Fargerik versjon av dashboardet («Farger»), som kan slås av og på øverst. Valget huskes på enheten
// (localStorage) og er bare utseende: `.dash-farge` i globals.css gir kortene hver sin lyse farge
// (`data-tone`) og ikonene i «Huset nå» farge. Uten valget er dashboardet nøytralt som før.

const KEY = "familien-dash-farge";
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Om dashboardet vises i farger, og en funksjon som endrer det. Nøytralt på serveren og før første tegning. */
export function useDashColor(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  const set = (next: boolean) => {
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // Uten lagring (privat modus) gjelder valget bare til siden lastes på nytt.
    }
    listeners.forEach((l) => l());
  };
  return [on, set];
}

/** Knappen øverst som slår fargene av og på. */
export function ColorToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition ${on ? "border-transparent bg-white/80 text-ink shadow-sm" : "border-line text-ink-light hover:text-ink"}`}
    >
      <Palette size={14} aria-hidden />
      {on ? "Nøytral" : "Farger"}
    </button>
  );
}
