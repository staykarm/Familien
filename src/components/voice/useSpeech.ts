"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Web Speech API finnes bare med prefiks i Safari/Chrome og har ingen typer i TypeScript sitt DOM-bibliotek.
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Norske feilmeldinger for talegjenkjenningen. */
function errorText(code: string): string {
  if (code === "not-allowed" || code === "service-not-allowed") {
    return "Appen får ikke bruke mikrofonen. Tillat mikrofon for appen, eller bruk mikrofonen på tastaturet.";
  }
  if (code === "no-speech") return "Hørte ingenting. Prøv igjen.";
  if (code === "network") return "Talegjenkjenningen trenger nett. Prøv igjen.";
  if (code === "audio-capture") return "Fant ingen mikrofon.";
  return "Talegjenkjenningen stoppet. Prøv igjen, eller bruk mikrofonen på tastaturet.";
}

/**
 * Tale til tekst i nettleseren (norsk). `text` er det som er sagt så langt; `interim` er det som høres akkurat nå.
 * Støttes ikke nettleseren (`supported = false`), kan man diktere med mikrofonen på tastaturet i stedet.
 */
export function useSpeech(initial = "") {
  // Hooken brukes bare i arket som åpnes etter et trykk, så window finnes alltid her.
  const [supported] = useState(() => recognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const [text, setText] = useState(initial);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);

  useEffect(() => () => recRef.current?.abort(), []);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setError(null);
    const rec = new Ctor();
    rec.lang = "nb-NO";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let finalText = "";
      let now = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else now += r[0].transcript;
      }
      if (finalText) setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${finalText.trim()}`);
      setInterim(now);
    };
    rec.onerror = (e) => {
      if (e.error !== "aborted") setError(errorText(e.error));
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      recRef.current = null;
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError(errorText("start"));
    }
  }, []);

  return { supported, listening, text, setText, interim, error, start, stop };
}
