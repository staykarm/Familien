"use client";

import { useRef, useState } from "react";

/**
 * Egne endringer som ennå ikke er bekreftet av Home Assistant (lys på, lysstyrke, ønsket temperatur …).
 * `show` legger dem oppå det som kom fra serveren; `send` viser endringen med en gang, kjører handlingen
 * og slipper endringen når den er ferdig (da har siden hentet ny tilstand).
 */
export function usePending<T extends object>() {
  const [pending, setPending] = useState<Record<string, Partial<T> & { seq: number }>>({});
  const seq = useRef(0);

  function show(id: string, base: T): T {
    const p = pending[id];
    if (!p) return base;
    const { seq: _seq, ...rest } = p;
    void _seq;
    return { ...base, ...rest };
  }

  /** Bare vis (for eksempel mens man drar i en glidebryter). */
  function preview(id: string, change: Partial<T>) {
    setPending((o) => ({ ...o, [id]: { ...o[id], ...change, seq: o[id]?.seq ?? 0 } }));
  }

  /** Samme som `send`, men for flere enheter og én handling (for eksempel «Alt av»). */
  async function sendMany(changes: Record<string, Partial<T>>, action: () => Promise<unknown>) {
    const mine = ++seq.current;
    const ids = Object.keys(changes);
    setPending((o) => ({ ...o, ...Object.fromEntries(ids.map((id) => [id, { ...o[id], ...changes[id], seq: mine }])) }));
    try {
      await action();
    } finally {
      setPending((o) => {
        const rest = { ...o };
        for (const id of ids) if (rest[id]?.seq === mine) delete rest[id];
        return rest;
      });
    }
  }

  function send(id: string, change: Partial<T>, action: () => Promise<unknown>) {
    return sendMany({ [id]: change } as Record<string, Partial<T>>, action);
  }

  return { show, preview, send, sendMany };
}
