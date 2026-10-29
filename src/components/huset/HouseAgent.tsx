"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, SendHorizontal, Undo2 } from "lucide-react";
import { askHouse, undoHouse } from "@/actions/huset";
import { useSpeech } from "@/components/voice/useSpeech";
import type { UndoItem } from "@/lib/huset/agentTargets";

interface Exchange {
  id: number;
  text: string;
  reply: string | null;
  actions: string[];
  undo: UndoItem[];
  undone: boolean;
  error: boolean;
}

/** Hvor mange tidligere beskjeder og svar Claude får med, så man kan følge opp («og på kjøkkenet også»). */
const HISTORY = 4;

/** Mikrofonen. Lastes bare i nettleseren (talegjenkjenningen finnes ikke på serveren). Sender når man stopper. */
function MicButton({ onText, disabled }: { onText: (text: string) => void; disabled: boolean }) {
  const speech = useSpeech();
  const wasListening = useRef(false);

  useEffect(() => {
    if (wasListening.current && !speech.listening && speech.text.trim()) {
      onText(speech.text.trim());
      speech.setText("");
    }
    wasListening.current = speech.listening;
  }, [speech.listening, speech.text, speech, onText]);

  if (!speech.supported) return null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => (speech.listening ? speech.stop() : speech.start())}
      aria-label={speech.listening ? "Stopp og send" : "Si det"}
      aria-pressed={speech.listening}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40 ${
        speech.listening ? "animate-pulse bg-danger text-white" : "bg-primary-soft text-primary-dark hover:bg-primary hover:text-white"
      }`}
    >
      {speech.listening ? <MicOff size={18} aria-hidden /> : <Mic size={18} aria-hidden />}
    </button>
  );
}

/**
 * «Spør huset»: skriv eller si hva du vil («skru av alt lyset i stua», «dim 1. etasje til 30 %»).
 * Claude gjør det med de samme sjekkene som knappene, og hvert svar har «Angre».
 */
export function HouseAgent({
  onChanged,
  ask = askHouse,
  placeholder = "Spør huset, f.eks. «skru av lyset i stua»",
}: {
  onChanged: () => void;
  /** Dashboardet sender med det familien har i dag og i morgen (`askDashboard`). */
  ask?: typeof askHouse;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Exchange[]>([]);
  const [mounted, setMounted] = useState(false);
  const nextId = useRef(1);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  async function send(message: string) {
    const clean = message.trim();
    if (clean.length < 2 || busy) return;
    const id = nextId.current++;
    const history = log
      .filter((x) => x.reply && !x.error)
      .slice(-HISTORY)
      .flatMap((x) => [
        { role: "user" as const, text: x.text },
        { role: "assistant" as const, text: x.reply! },
      ]);
    setText("");
    setBusy(true);
    setLog((l) => [...l.slice(-2), { id, text: clean, reply: null, actions: [], undo: [], undone: false, error: false }]);
    const res = await ask(clean, history).catch(() => ({ ok: false as const, message: "Fikk ikke kontakt med Huset." }));
    setBusy(false);
    setLog((l) =>
      l.map((x) =>
        x.id === id
          ? {
              ...x,
              reply: res.ok ? (res.reply ?? "Ferdig.") : (res.message ?? "Det virket ikke."),
              actions: (res.ok && res.actions) || [],
              undo: (res.ok && res.undo) || [],
              error: !res.ok,
            }
          : x
      )
    );
    if (res.ok && res.actions?.length) onChanged();
  }

  async function undo(x: Exchange) {
    setLog((l) => l.map((y) => (y.id === x.id ? { ...y, undone: true } : y)));
    const res = await undoHouse(x.undo);
    setLog((l) => l.map((y) => (y.id === x.id ? { ...y, reply: `${y.reply} ${res.ok ? "(angret)" : `(${res.message ?? "kunne ikke angre"})`}` } : y)));
    onChanged();
  }

  return (
    <section aria-label="Spør huset" className="flex flex-col gap-2 rounded-2xl bg-card p-2 shadow-[0_2px_12px_rgba(120,90,60,0.08)]">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label="Hva vil du at huset skal gjøre?"
          enterKeyHint="send"
          maxLength={500}
          className="min-h-10 min-w-0 flex-1 rounded-full border-2 border-line bg-card-soft px-4 text-sm text-ink outline-none transition focus:border-primary"
        />
        {mounted && <MicButton onText={(t) => void send(t)} disabled={busy} />}
        <button
          type="submit"
          disabled={busy || text.trim().length < 2}
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-dark disabled:opacity-40"
        >
          {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <SendHorizontal size={18} aria-hidden />}
        </button>
      </form>

      {log.length > 0 && (
        <ul className="flex flex-col gap-1.5 px-1" aria-live="polite">
          {log.map((x) => (
            <li key={x.id} className="flex flex-col gap-0.5 text-sm">
              <p className="self-end rounded-2xl rounded-br-md bg-primary-soft px-3 py-1 text-primary-dark wrap-break-word">{x.text}</p>
              {x.reply === null ? (
                <p className="flex items-center gap-1.5 text-xs text-ink-light">
                  <Loader2 size={12} className="animate-spin" aria-hidden /> Huset tenker …
                </p>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={`wrap-break-word ${x.error ? "text-danger" : ""}`}>{x.reply}</p>
                    {x.actions.length > 0 && <p className="text-xs text-ink-light wrap-break-word">{x.actions.join(" · ")}</p>}
                  </div>
                  {x.undo.length > 0 && !x.undone && (
                    <button
                      type="button"
                      onClick={() => void undo(x)}
                      className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border-2 border-line px-2.5 text-xs font-bold transition hover:border-primary"
                    >
                      <Undo2 size={12} aria-hidden />
                      Angre
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
