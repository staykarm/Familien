"use client";

import { useEffect, useState } from "react";

/** Hvor lenge «Angre» vises. Serveren venter litt lenger før en sletting gjøres endelig (se actions/events.ts). */
export const UNDO_MS = 8000;

export interface UndoOffer {
  text: string;
  run: () => Promise<{ ok: boolean; message?: string }>;
}

/**
 * «Slettet – Angre»: i stedet for «Er du sikker?». Slettingen skjer med en gang, og man kan ombestemme seg
 * i noen sekunder. Bruk `offer` etter en sletting, og legg `node` nederst i komponenten.
 */
export function useUndo(onUndone: (message?: string) => void) {
  const [undo, setUndo] = useState<UndoOffer | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo]);

  const node = undo ? (
    <div
      role="status"
      className="fixed inset-x-0 bottom-24 z-50 mx-auto flex w-fit max-w-[92vw] items-center gap-3 rounded-full bg-ink py-2 pl-5 pr-2 font-bold text-white shadow-lg md:bottom-8"
    >
      <span>{undo.text}</span>
      <button
        type="button"
        disabled={busy}
        className="min-h-10 rounded-full bg-white/15 px-4 text-sun transition hover:bg-white/25 disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          const res = await undo.run().catch(() => ({ ok: false, message: "Kunne ikke angre" }));
          setBusy(false);
          setUndo(null);
          onUndone(res.ok ? (res.message ?? "Angret") : (res.message ?? "Kunne ikke angre"));
        }}
      >
        Angre
      </button>
    </div>
  ) : null;

  return { offer: setUndo, clear: () => setUndo(null), node };
}
