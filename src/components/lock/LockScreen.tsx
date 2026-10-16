"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Delete, ScanFace } from "lucide-react";
import { unlockWithPin } from "@/actions/lock";
import { readFaceIdFlag, supportsFaceId, unlockWithFaceId } from "@/components/lock/passkey";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const keyClass =
  "flex aspect-square w-full items-center justify-center rounded-full bg-card font-display text-3xl font-bold text-ink shadow-[0_2px_12px_rgba(120,90,60,0.10)] transition active:scale-95 active:bg-primary-soft disabled:opacity-50";

/** Talltastatur for den felles koden. Koden sjekkes straks alle sifrene er tastet. */
export function LockScreen({ pinLength, next }: { pinLength: number; next: string }) {
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [pending, startTransition] = useTransition();
  // Face ID vises bare der det er slått på (husket på enheten). Leses etter første tegning (ellers ulik HTML fra serveren).
  const [faceId, setFaceId] = useState(false);
  const pinRef = useRef("");

  const done = useCallback(() => {
    // Full innlasting, slik at alt hentes på nytt med opplåsingen.
    window.location.replace(next);
  }, [next]);

  const tryFaceId = useCallback(async () => {
    setMessage(null);
    const result = await unlockWithFaceId();
    if (result.ok) done();
    else if (result.message) setMessage(result.message);
  }, [done]);

  // Prøv Face ID med en gang appen åpnes. Krever nettleseren et trykk først, vises bare knappen.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (!supportsFaceId() || !readFaceIdFlag()) return;
      setFaceId(true);
      void tryFaceId();
    });
    return () => cancelAnimationFrame(id);
  }, [tryFaceId]);

  const update = useCallback((value: string) => {
    pinRef.current = value;
    setPin(value);
  }, []);

  const submit = useCallback(
    (code: string) => {
      startTransition(async () => {
        const result = await unlockWithPin(code);
        if (result.ok) return done();
        update("");
        setMessage(result.message ?? "Feil kode");
        setShake(true);
        setTimeout(() => setShake(false), 400);
      });
    },
    [done, update],
  );

  const press = useCallback(
    (digit: string) => {
      if (pending || pinRef.current.length >= pinLength) return;
      setMessage(null);
      const nextPin = pinRef.current + digit;
      update(nextPin);
      if (nextPin.length === pinLength) submit(nextPin);
    },
    [pending, pinLength, submit, update],
  );

  const back = useCallback(() => update(pinRef.current.slice(0, -1)), [update]);

  // Tastatur på PC og nettbrett.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") back();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, back]);

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <p className="text-center text-ink-light">Skriv familiekoden</p>
      <div className={`flex gap-3 ${shake ? "animate-[shake_0.4s]" : ""}`} aria-label={`${pin.length} av ${pinLength} sifre`}>
        {Array.from({ length: pinLength }, (_, i) => (
          <span key={i} className={`h-4 w-4 rounded-full border-2 border-primary transition ${i < pin.length ? "bg-primary" : ""}`} />
        ))}
      </div>
      <p className="min-h-6 text-center font-semibold text-primary-dark" role="status">
        {message}
      </p>
      <div className="grid w-full max-w-72 grid-cols-3 gap-4">
        {KEYS.map((k) => (
          <button key={k} type="button" className={keyClass} onClick={() => press(k)} disabled={pending}>
            {k}
          </button>
        ))}
        {faceId ? (
          <button type="button" className={`${keyClass} text-primary`} onClick={() => void tryFaceId()} aria-label="Lås opp med Face ID">
            <ScanFace size={32} />
          </button>
        ) : (
          <span />
        )}
        <button type="button" className={keyClass} onClick={() => press("0")} disabled={pending}>
          0
        </button>
        <button type="button" className={`${keyClass} bg-transparent shadow-none`} onClick={back} aria-label="Slett siste siffer">
          <Delete size={28} />
        </button>
      </div>
    </div>
  );
}
