"use client";

import { useRef } from "react";
import { Music, Pause, Play, SkipBack, SkipForward, Speaker as SpeakerIcon } from "lucide-react";
import { buttonPrimary, buttonSecondary, card } from "@/components/ui/styles";
import { groupName, type Speaker, type SpeakerGroup } from "@/lib/huset/sonos";

interface Props {
  group: SpeakerGroup;
  onToggle: () => void;
  onSkip: (action: "next" | "previous") => void;
  /** `send` er true når volumet skal sendes (jevnlig under dra og når man slipper). */
  onVolume: (id: string, volume: number, send: boolean) => void;
  onSource: (source: string) => void;
  onRooms: () => void;
}

const SEND_EVERY_MS = 300;

function nowPlaying(s: Speaker): string {
  if (s.title) return [s.title, s.artist].filter(Boolean).join(" – ");
  if (s.source) return s.source;
  return s.status === "off" ? "Av" : "Ingenting spilles";
}

function Cover({ speaker }: { speaker: Speaker }) {
  if (!speaker.coverKey || !speaker.title) {
    return (
      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-card-soft text-ink-faint sm:h-20 sm:w-20" aria-hidden>
        <Music size={28} />
      </span>
    );
  }
  return (
    // Bildet kommer via vår egen server (tokenet til Home Assistant blir der), så next/image trengs ikke.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/huset/cover/${speaker.id}?v=${speaker.coverKey}`}
      alt=""
      className="h-16 w-16 shrink-0 rounded-2xl bg-card-soft object-cover sm:h-20 sm:w-20"
    />
  );
}

/** Ett rom, eller flere rom som spiller sammen. */
export function SpeakerCard({ group, onToggle, onSkip, onVolume, onSource, onRooms }: Props) {
  const leader = group.leader;
  const playing = leader.status === "playing";
  const several = group.speakers.length > 1;
  const lastSent = useRef<Record<string, number>>({});

  /** `at` er tidspunktet for hendelsen (event.timeStamp). */
  function slide(id: string, volume: number, at: number, final: boolean) {
    // Send underveis også (ikke bare når man slipper), men ikke oftere enn hvert 300. ms.
    const send = final || at - (lastSent.current[id] ?? 0) > SEND_EVERY_MS;
    if (send) lastSent.current[id] = at;
    onVolume(id, volume, send);
  }

  return (
    <article className={`${card} flex flex-col gap-3 ${playing ? "ring-2 ring-primary/40" : ""}`}>
      <div className="flex gap-3">
        <Cover speaker={leader} />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-bold wrap-break-word">{groupName(group)}</h3>
          <p className="text-sm text-ink-light wrap-break-word">{nowPlaying(leader)}</p>
          {leader.playlist && <p className="text-xs text-ink-faint wrap-break-word">{leader.playlist}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" className={`${buttonSecondary} w-12 px-0`} onClick={() => onSkip("previous")} aria-label="Forrige">
          <SkipBack size={20} aria-hidden />
        </button>
        <button
          type="button"
          className={`${buttonPrimary} w-14 rounded-full px-0`}
          onClick={onToggle}
          aria-label={playing ? "Pause" : "Spill"}
        >
          {playing ? <Pause size={24} aria-hidden /> : <Play size={24} aria-hidden />}
        </button>
        <button type="button" className={`${buttonSecondary} w-12 px-0`} onClick={() => onSkip("next")} aria-label="Neste">
          <SkipForward size={20} aria-hidden />
        </button>
        <button type="button" className={`${buttonSecondary} ml-auto`} onClick={onRooms} aria-label="Velg rom">
          <SpeakerIcon size={20} aria-hidden />
          <span className="hidden sm:inline">Rom</span>
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {group.speakers.map((s) => (
          <label key={s.id} className="flex items-center gap-3">
            <span className={`text-sm font-bold text-ink-light ${several ? "w-24 shrink-0 wrap-break-word" : "sr-only"}`}>
              {several ? s.name : `Volum ${s.name}`}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={s.volume ?? 0}
              disabled={s.volume === null}
              onChange={(e) => slide(s.id, Number(e.target.value), e.timeStamp, false)}
              onPointerUp={(e) => slide(s.id, Number(e.currentTarget.value), e.timeStamp, true)}
              onKeyUp={(e) => slide(s.id, Number(e.currentTarget.value), e.timeStamp, true)}
              className="h-10 min-w-0 flex-1 accent-primary"
            />
            <span className="w-8 text-right text-sm tabular-nums text-ink-light">{s.volume ?? "–"}</span>
          </label>
        ))}
      </div>

      {leader.sources.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Favoritter">
          {leader.sources.map((source) => (
            <button
              key={source}
              type="button"
              onClick={() => onSource(source)}
              className={`min-h-10 rounded-full border-2 px-4 text-sm font-bold transition ${
                leader.source === source ? "border-primary bg-primary-soft text-primary-dark" : "border-line bg-card"
              }`}
            >
              {source}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
