"use client";

import { useRef, type ReactNode } from "react";
import { Music, Pause, Play } from "lucide-react";
import type { Speaker } from "@/lib/huset/sonos";

/** Det som spilles, kort: «Sang – Artist», kilden, eller at ingenting spilles. */
export function nowPlaying(s: Speaker): string {
  if (s.title) return [s.title, s.artist].filter(Boolean).join(" – ");
  if (s.source) return s.source;
  return s.status === "off" ? "Av" : "Ingenting spilles";
}

export function Cover({ speaker, size = "h-11 w-11" }: { speaker: Speaker; size?: string }) {
  if (!speaker.coverKey || !speaker.title) {
    return (
      <span className={`flex ${size} shrink-0 items-center justify-center rounded-xl bg-card-soft text-ink-faint`} aria-hidden>
        <Music size={20} />
      </span>
    );
  }
  return (
    // Bildet kommer via vår egen server (tokenet til Home Assistant blir der), så next/image trengs ikke.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/huset/cover/${speaker.id}?v=${speaker.coverKey}`} alt="" className={`${size} shrink-0 rounded-xl bg-card-soft object-cover`} />
  );
}

/** Bilde fra Spotify (søk og spillelister). */
export function Artwork({ src }: { src: string | null }) {
  if (!src) {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-card-soft text-ink-faint" aria-hidden>
        <Music size={20} />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="h-11 w-11 shrink-0 rounded-xl bg-card-soft object-cover" loading="lazy" />;
}

export function PlayButton({ playing, onClick, label }: { playing: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${playing ? "Pause" : "Spill"} ${label}`}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-sm transition active:scale-95 hover:bg-primary-dark"
    >
      {playing ? <Pause size={22} aria-hidden /> : <Play size={22} aria-hidden />}
    </button>
  );
}

const SEND_EVERY_MS = 300;

/** Volum for ett rom. `send` er true når verdien skal sendes (jevnlig under dra og når man slipper). */
export function VolumeSlider({
  speaker,
  onVolume,
  showName = false,
}: {
  speaker: Speaker;
  onVolume: (id: string, volume: number, send: boolean) => void;
  showName?: boolean;
}) {
  const lastSent = useRef({ at: 0, value: NaN });
  // `at` er tidspunktet for hendelsen (event.timeStamp). Samme verdi sendes ikke to ganger.
  function slide(volume: number, at: number, final: boolean) {
    const send = volume !== lastSent.current.value && (final || at - lastSent.current.at > SEND_EVERY_MS);
    if (send) lastSent.current = { at, value: volume };
    onVolume(speaker.id, volume, send);
  }
  return (
    <label className="flex min-w-0 flex-1 items-center gap-3">
      <span className={showName ? "w-24 shrink-0 text-sm font-bold text-ink-light wrap-break-word" : "sr-only"}>
        {showName ? speaker.name : `Volum ${speaker.name}`}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={speaker.volume ?? 0}
        disabled={speaker.volume === null}
        onPointerDown={() => (lastSent.current = { at: 0, value: NaN })}
        onKeyDown={() => (lastSent.current = { at: 0, value: NaN })}
        onChange={(e) => slide(Number(e.target.value), e.timeStamp, false)}
        onPointerUp={(e) => slide(Number(e.currentTarget.value), e.timeStamp, true)}
        onKeyUp={(e) => slide(Number(e.currentTarget.value), e.timeStamp, true)}
        className="h-9 min-w-0 flex-1 accent-primary"
      />
      <span className="w-7 shrink-0 text-right text-sm tabular-nums text-ink-light">{speaker.volume ?? "–"}</span>
    </label>
  );
}

/**
 * Glidebryter som sender verdien jevnlig mens man drar (hvert 300. ms) og når man slipper.
 * `send` er true når verdien skal sendes; ellers skal den bare vises.
 */
export function Range({
  value,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  label,
  onChange,
  className = "",
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  label: string;
  onChange: (value: number, send: boolean) => void;
  className?: string;
}) {
  const lastSent = useRef({ at: 0, value: NaN });
  function slide(v: number, at: number, final: boolean) {
    const send = v !== lastSent.current.value && (final || at - lastSent.current.at > SEND_EVERY_MS);
    if (send) lastSent.current = { at, value: v };
    onChange(v, send);
  }
  return (
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onPointerDown={() => (lastSent.current = { at: 0, value: NaN })}
      onKeyDown={() => (lastSent.current = { at: 0, value: NaN })}
      onChange={(e) => slide(Number(e.target.value), e.timeStamp, false)}
      onPointerUp={(e) => slide(Number(e.currentTarget.value), e.timeStamp, true)}
      onKeyUp={(e) => slide(Number(e.currentTarget.value), e.timeStamp, true)}
      className={`h-9 min-w-0 flex-1 accent-primary disabled:opacity-40 ${className}`}
    />
  );
}

/** Av/på-bryter. Trykkflaten er større enn selve bryteren, så den er lett å treffe. */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex h-10 shrink-0 items-center px-1 disabled:opacity-40"
    >
      <span className={`relative h-6 w-11 rounded-full transition ${on ? "bg-primary" : "bg-line"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

/** Rund ikonknapp i kompakt størrelse (Lys, Varme og Persienner). */
export function IconButton({ onClick, label, children, disabled }: { onClick: () => void; label: string; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-line bg-card transition active:scale-95 hover:border-primary disabled:opacity-40"
    >
      {children}
    </button>
  );
}
