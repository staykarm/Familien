"use client";

import { useEffect, useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { askHouse, undoHouse } from "@/actions/huset";
import type { UndoItem } from "@/lib/huset/agentTargets";

interface Reply {
  text: string;
  actions: string[];
  undo: UndoItem[];
  error: boolean;
}

/** Svaret fra «Spør huset» i «Si det»-arket: hva som ble gjort, og «Angre». Sender beskjeden når den vises. */
export function HouseVoiceReply({ text }: { text: string }) {
  const [reply, setReply] = useState<Reply | null>(null);
  const [undone, setUndone] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    void askHouse(text)
      .catch(() => ({ ok: false as const, message: "Fikk ikke kontakt med Huset." }))
      .then((res) => {
        if (stale) return;
        setReply(
          res.ok
            ? { text: res.reply ?? "Ferdig.", actions: res.actions ?? [], undo: res.undo ?? [], error: false }
            : { text: res.message ?? "Det virket ikke.", actions: [], undo: [], error: true }
        );
      });
    return () => {
      stale = true;
    };
  }, [text]);

  return (
    <div className="flex w-full flex-col gap-2 text-left" aria-live="polite">
      <p className="self-end rounded-2xl rounded-br-md bg-primary-soft px-3 py-1.5 text-primary-dark wrap-break-word">{text}</p>
      {!reply ? (
        <p className="flex items-center gap-2 text-ink-light">
          <Loader2 size={16} className="animate-spin" aria-hidden /> Huset gjør det …
        </p>
      ) : (
        <>
          <p className={`font-semibold wrap-break-word ${reply.error ? "text-danger" : ""}`}>🏠 {reply.text}</p>
          {reply.actions.length > 0 && <p className="text-sm text-ink-light wrap-break-word">{reply.actions.join(" · ")}</p>}
          {reply.undo.length > 0 &&
            (undone ? (
              <p className="text-sm text-ink-light">{undone}</p>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  setUndone("Angrer …");
                  const res = await undoHouse(reply.undo);
                  setUndone(res.ok ? "Satt tilbake." : (res.message ?? "Kunne ikke angre."));
                }}
                className="inline-flex min-h-10 items-center gap-1.5 self-start rounded-full border-2 border-line px-4 text-sm font-bold transition hover:border-primary"
              >
                <Undo2 size={14} aria-hidden />
                Angre
              </button>
            ))}
        </>
      )}
    </div>
  );
}
