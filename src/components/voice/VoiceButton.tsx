"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Sparkles } from "lucide-react";
import { analyzeUpload, uploadForAnalysis } from "@/components/files/upload";
import { Sheet } from "@/components/ui/Sheet";
import { buttonGhost, buttonPrimary, input } from "@/components/ui/styles";
import { SPOKEN_PREFIX } from "@/lib/ai/types";
import { useSpeech } from "./useSpeech";

/** Mikrofon-knappen i toppen av appen. `variant` styrer utseendet i topplinjen (telefon) og sidemenyen. */
export function VoiceButton({ variant }: { variant: "top" | "side" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "top" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Si det: legg inn med tale"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white shadow-sm"
        >
          <Mic size={21} aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Si det"
          className="flex w-full flex-col items-center gap-0.5 rounded-2xl bg-primary py-2 text-[11px] font-bold text-white shadow-sm transition hover:bg-primary-dark lg:min-h-12 lg:flex-row lg:gap-3 lg:px-4 lg:py-0 lg:text-base"
        >
          <Mic size={22} aria-hidden />
          Si det
        </button>
      )}
      {/* Portal: topplinjen har backdrop-blur, som ellers ville gjort den til ramme for det faste arket. */}
      {open && createPortal(<VoiceSheet onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

/** Tidsstempel i filnavnet, f.eks. «Sagt inn 16.10.2026 08.15». */
function spokenFilename(): string {
  const stamp = new Date().toLocaleString("nb-NO", { timeZone: "Europe/Oslo", dateStyle: "short", timeStyle: "short" }).replace(/[/:]/g, ".");
  return `${SPOKEN_PREFIX} ${stamp}.txt`;
}

/**
 * «Si det»: snakk (eller diktér med tastaturet), og Claude gjør det om til aktiviteter, oppgaver og handlevarer.
 * Forslagene havner i «Les inn fil» for godkjenning, som andre innleste filer.
 */
function VoiceSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const speech = useSpeech();
  const [step, setStep] = useState<"idle" | "upload" | "analyze">("idle");
  const [error, setError] = useState<string | null>(null);
  const busy = step !== "idle";
  const shown = `${speech.text}${speech.interim ? `${speech.text ? " " : ""}${speech.interim}` : ""}`;

  async function interpret() {
    speech.stop();
    const text = speech.text.trim() || speech.interim.trim();
    if (!text) return setError("Si eller skriv noe først.");
    setError(null);
    setStep("upload");
    const filename = spokenFilename();
    const uploaded = await uploadForAnalysis(new File([text], filename, { type: "text/plain" }), { filename });
    if (!uploaded.ok || !uploaded.uploadId) {
      setStep("idle");
      return setError(uploaded.message ?? "Kunne ikke sende teksten");
    }
    setStep("analyze");
    const res = await analyzeUpload(uploaded.uploadId);
    setStep("idle");
    if (!res.ok) return setError(res.message);
    onClose();
    router.push(`/filer?vis=${uploaded.uploadId}`);
  }

  return (
    <Sheet
      title="🎤 Si det"
      onClose={busy ? () => {} : onClose}
      onSubmit={() => void interpret()}
      footer={
        <>
          <button type="button" className={buttonGhost} onClick={onClose} disabled={busy}>
            Avbryt
          </button>
          <button type="submit" className={buttonPrimary} disabled={busy || !shown.trim()}>
            <Sparkles size={20} aria-hidden />
            {step === "upload" ? "Sender …" : step === "analyze" ? "Tolker …" : "Legg inn"}
          </button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <p className="text-center text-ink-light">
          Si hva som skal inn i kalenderen, på oppgavelisten eller handlelisten. For eksempel: «Olav har tannlege tirsdag klokka to, og vi må
          kjøpe melk og brød».
        </p>

        {speech.supported && (
          <button
            type="button"
            onClick={speech.listening ? speech.stop : speech.start}
            disabled={busy}
            aria-pressed={speech.listening}
            className={`relative flex h-24 w-24 items-center justify-center rounded-full text-white shadow-lg transition active:scale-95 ${
              speech.listening ? "bg-danger" : "bg-primary hover:bg-primary-dark"
            }`}
          >
            {speech.listening && <span className="absolute inset-0 animate-ping rounded-full bg-danger/40" aria-hidden />}
            {speech.listening ? <MicOff size={40} aria-hidden /> : <Mic size={40} aria-hidden />}
            <span className="sr-only">{speech.listening ? "Stopp" : "Start opptak"}</span>
          </button>
        )}
        {speech.supported && (
          <p className="text-sm font-bold text-ink-light" aria-live="polite">
            {speech.listening ? "Jeg hører … trykk igjen når du er ferdig" : "Trykk på mikrofonen og snakk"}
          </p>
        )}

        <label className="w-full">
          <span className="sr-only">Det du har sagt</span>
          <textarea
            rows={5}
            value={shown}
            onChange={(e) => speech.setText(e.target.value)}
            readOnly={speech.listening}
            placeholder={speech.supported ? "Det du sier, kommer her. Du kan rette før du legger inn." : "Trykk på 🎤 på tastaturet og snakk, eller skriv."}
            className={`${input} py-3`}
          />
        </label>
        {!speech.supported && (
          <p className="text-sm text-ink-light">Bruk mikrofonknappen på tastaturet for å diktere. På iPhone står den nederst til høyre.</p>
        )}
        {(error ?? speech.error) && <p className="text-center font-semibold text-danger">{error ?? speech.error}</p>}
        {step === "analyze" && <p className="text-center font-semibold text-ink-light">Claude tolker det du sa …</p>}
      </div>
    </Sheet>
  );
}
