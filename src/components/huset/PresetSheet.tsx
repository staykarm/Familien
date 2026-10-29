"use client";

import { useState } from "react";
import { Music, Trash2, X } from "lucide-react";
import type { HouseGroup, HouseSetup } from "@/actions/huset";
import { Sheet } from "@/components/ui/Sheet";
import { buttonGhost, buttonPrimary, buttonSecondary, input, label } from "@/components/ui/styles";
import type { Speaker } from "@/lib/huset/sonos";
import { MusicSheet } from "./MusicSheet";

export type PresetDraft = Omit<HouseGroup, "id"> & { id?: string };

interface Props {
  preset: PresetDraft;
  /** Alle høyttalere, også de som ikke svarer nå. */
  speakers: Speaker[];
  spotify: HouseSetup["spotify"];
  pending: boolean;
  onClose: () => void;
  onSave: (draft: PresetDraft) => void;
  onDelete?: () => void;
  onAccountsChanged: () => void;
}

/** Lag eller endre en fast gruppe: navn, rom, og valgfritt musikk og volum. */
export function PresetSheet({ preset, speakers, spotify, pending, onClose, onSave, onDelete, onAccountsChanged }: Props) {
  const [draft, setDraft] = useState(preset);
  const [picking, setPicking] = useState(false);
  const set = (patch: Partial<PresetDraft>) => setDraft((d) => ({ ...d, ...patch }));

  function toggle(id: string) {
    set({ speakerIds: draft.speakerIds.includes(id) ? draft.speakerIds.filter((x) => x !== id) : [...draft.speakerIds, id] });
  }

  if (picking) {
    return (
      <MusicSheet
        target={draft.name || "gruppen"}
        spotify={spotify}
        onClose={() => setPicking(false)}
        onPick={(item) => {
          set({ spotifyUrl: item.url, spotifyName: item.subtitle ? `${item.name} – ${item.subtitle}` : item.name });
          setPicking(false);
        }}
        onAccountsChanged={onAccountsChanged}
      />
    );
  }

  return (
    <Sheet
      title={preset.id ? "Endre gruppe" : "Ny fast gruppe"}
      onClose={onClose}
      onSubmit={() => onSave(draft)}
      footer={
        <>
          <button type="submit" className={buttonPrimary} disabled={pending || !draft.name.trim() || !draft.speakerIds.length}>
            Lagre
          </button>
          <button type="button" className={buttonSecondary} onClick={onClose}>
            Avbryt
          </button>
          {onDelete && (
            <button type="button" className={`${buttonGhost} ml-auto text-danger`} onClick={onDelete}>
              <Trash2 size={20} aria-hidden />
              Slett
            </button>
          )}
        </>
      }
    >
      <div>
        <label className={label} htmlFor="preset-name">
          Navn
        </label>
        <input id="preset-name" className={input} value={draft.name} maxLength={40} placeholder="F.eks. 1. etasje eller Middag" onChange={(e) => set({ name: e.target.value })} />
      </div>

      <fieldset>
        <legend className={label}>Rom</legend>
        <div className="grid grid-cols-2 gap-1">
          {speakers.map((s) => (
            <label key={s.id} className="flex min-h-12 items-center gap-3 rounded-2xl px-2 hover:bg-card-soft">
              <input type="checkbox" checked={draft.speakerIds.includes(s.id)} onChange={() => toggle(s.id)} className="h-6 w-6 shrink-0 accent-primary" />
              <span className="font-bold wrap-break-word">{s.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <span className={label}>Musikk når gruppen startes (valgfritt)</span>
        {draft.spotifyUrl ? (
          <div className="flex items-center gap-2 rounded-2xl bg-card-soft p-2 pl-3">
            <Music size={20} className="shrink-0 text-primary-dark" aria-hidden />
            <span className="min-w-0 flex-1 font-bold wrap-break-word">{draft.spotifyName ?? "Spotify"}</span>
            <button type="button" className={buttonGhost} onClick={() => set({ spotifyUrl: null, spotifyName: null })} aria-label="Fjern musikken">
              <X size={20} aria-hidden />
            </button>
          </div>
        ) : (
          <button type="button" className={buttonSecondary} onClick={() => setPicking(true)}>
            <Music size={20} aria-hidden />
            Velg fra Spotify
          </button>
        )}
        <p className="mt-1 text-sm text-ink-light">Uten musikk fortsetter det som spiller i et av rommene.</p>
      </div>

      <div>
        <label className="flex min-h-12 items-center gap-3">
          <input
            type="checkbox"
            checked={draft.volume !== null}
            onChange={(e) => set({ volume: e.target.checked ? 25 : null })}
            className="h-6 w-6 shrink-0 accent-primary"
          />
          <span className="font-bold">Sett volum i alle rommene</span>
        </label>
        {draft.volume !== null && (
          <label className="flex items-center gap-3">
            <span className="sr-only">Volum</span>
            <input type="range" min={0} max={100} value={draft.volume} onChange={(e) => set({ volume: Number(e.target.value) })} className="h-9 flex-1 accent-primary" />
            <span className="w-8 text-right tabular-nums">{draft.volume}</span>
          </label>
        )}
      </div>
    </Sheet>
  );
}
