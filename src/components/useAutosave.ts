"use client";

import { useEffect, useRef, useState } from "react";
import { Autosaver, type AutosaveState } from "@/lib/autosave";

/**
 * Automatisk lagring for skjemaer (se lib/autosave.ts). Gi den skjemaets verdi og en lagre-funksjon
 * som returnerer true/false. `flush()` lagrer med en gang – kall den før dialogen lukkes.
 */
export function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<boolean>,
  opts: { key?: (value: T) => string; delay?: number; enabled?: boolean } = {}
): { state: AutosaveState; flush: () => Promise<boolean> } {
  const [state, setState] = useState<AutosaveState>("idle");
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  // Utgangspunktet (det som allerede er lagret) huskes fra første render.
  const [initial] = useState(value);
  const [{ key, delay }] = useState({ key: opts.key, delay: opts.delay });
  const saverRef = useRef<Autosaver<T> | null>(null);
  useEffect(() => {
    const saver = new Autosaver<T>(initial, (v) => saveRef.current(v), { key, delay, onState: setState });
    saverRef.current = saver;
    return () => saver.dispose();
  }, [initial, key, delay]);

  const enabled = opts.enabled ?? true;
  useEffect(() => {
    if (enabled) saverRef.current?.update(value);
  }, [value, enabled]);

  return { state, flush: () => saverRef.current?.flush() ?? Promise.resolve(true) };
}

/** Kort statustekst som vises i dialogene. */
export function autosaveLabel(state: AutosaveState): string {
  return state === "saving" ? "Lagrer …" : state === "saved" ? "Lagret ✓" : state === "error" ? "Ikke lagret – prøver igjen" : "";
}
