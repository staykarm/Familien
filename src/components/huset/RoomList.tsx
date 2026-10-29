"use client";

import { Link2Off, ListMusic, SkipBack, SkipForward } from "lucide-react";
import { buttonSecondary } from "@/components/ui/styles";
import { groupName, type Speaker, type SpeakerGroup } from "@/lib/huset/sonos";
import { Cover, nowPlaying, PlayButton, VolumeSlider } from "./parts";

export interface RoomActions {
  onToggle: (leader: Speaker) => void;
  onSkip: (leader: Speaker, action: "next" | "previous") => void;
  onVolume: (id: string, volume: number, send: boolean) => void;
  onSource: (leader: Speaker, source: string) => void;
  onMusic: (leader: Speaker) => void;
  onUngroup: (leader: Speaker) => void;
}

interface Props extends RoomActions {
  groups: SpeakerGroup[];
  /** Rommet/gruppen som er åpnet (lederens id). */
  open: string | null;
  onOpen: (id: string | null) => void;
  /** I «Grupper»-modus: hvilke rom som er valgt. Null = ikke i modus. */
  selected: Set<string> | null;
  onSelect: (id: string) => void;
}

function Check({ id, name, selected, onSelect }: { id: string; name: string; selected: Set<string>; onSelect: (id: string) => void }) {
  return (
    <input
      type="checkbox"
      checked={selected.has(id)}
      onChange={() => onSelect(id)}
      aria-label={`Velg ${name}`}
      className="h-6 w-6 shrink-0 accent-primary"
    />
  );
}

/** Det man får når man trykker på et rom: forrige/neste, «Velg musikk» og favorittene. */
function Details({ leader, actions }: { leader: Speaker; actions: RoomActions }) {
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <button type="button" className={`${buttonSecondary} w-12 px-0`} onClick={() => actions.onSkip(leader, "previous")} aria-label="Forrige">
        <SkipBack size={20} aria-hidden />
      </button>
      <button type="button" className={`${buttonSecondary} w-12 px-0`} onClick={() => actions.onSkip(leader, "next")} aria-label="Neste">
        <SkipForward size={20} aria-hidden />
      </button>
      <button type="button" className={buttonSecondary} onClick={() => actions.onMusic(leader)}>
        <ListMusic size={20} aria-hidden />
        Velg musikk
      </button>
      {leader.sources.map((source) => (
        <button
          key={source}
          type="button"
          onClick={() => actions.onSource(leader, source)}
          className={`min-h-12 rounded-full border-2 px-4 text-sm font-bold transition ${
            leader.source === source ? "border-primary bg-primary-soft text-primary-dark" : "border-line bg-card"
          }`}
        >
          {source}
        </button>
      ))}
    </div>
  );
}

/** Rom som spiller alene: én rad med cover, navn, det som spilles, spill/pause og volum. */
function SingleRoom({ group, ...p }: Props & { group: SpeakerGroup }) {
  const s = group.leader;
  const open = p.open === s.id;
  return (
    <li className="flex flex-col gap-1 px-3 py-2.5 sm:px-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {p.selected && <Check id={s.id} name={s.name} selected={p.selected} onSelect={p.onSelect} />}
          <button type="button" className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left" onClick={() => p.onOpen(open ? null : s.id)} aria-expanded={open}>
            <Cover speaker={s} />
            <span className="min-w-0">
              <span className="block font-bold wrap-break-word">{s.name}</span>
              <span className="block text-sm text-ink-light wrap-break-word">{nowPlaying(s)}</span>
            </span>
          </button>
          <PlayButton playing={s.status === "playing"} onClick={() => p.onToggle(s)} label={s.name} />
        </div>
        <div className="flex sm:w-60 lg:w-72">
          <VolumeSlider speaker={s} onVolume={p.onVolume} />
        </div>
      </div>
      {open && <Details leader={s} actions={p} />}
    </li>
  );
}

/** Rom som spiller sammen: felles linje for musikken, og volum per rom under. */
function GroupedRooms({ group, ...p }: Props & { group: SpeakerGroup }) {
  const leader = group.leader;
  const open = p.open === leader.id;
  return (
    <li className="flex flex-col gap-1 border-l-4 border-primary bg-primary-soft/40 px-3 py-2.5 sm:px-4">
      <div className="flex items-center gap-3">
        <button type="button" className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left" onClick={() => p.onOpen(open ? null : leader.id)} aria-expanded={open}>
          <Cover speaker={leader} />
          <span className="min-w-0">
            <span className="block font-bold wrap-break-word">{groupName(group)}</span>
            <span className="block text-sm text-ink-light wrap-break-word">{nowPlaying(leader)}</span>
          </span>
        </button>
        <button type="button" className={`${buttonSecondary} shrink-0 px-3`} onClick={() => p.onUngroup(leader)} aria-label="Løs opp gruppen">
          <Link2Off size={20} aria-hidden />
          <span className="hidden sm:inline">Løs opp</span>
        </button>
        <PlayButton playing={leader.status === "playing"} onClick={() => p.onToggle(leader)} label={groupName(group)} />
      </div>
      <div className="grid gap-x-6 sm:grid-cols-2">
        {group.speakers.map((s) => (
          <div key={s.id} className="flex items-center gap-3">
            {p.selected && <Check id={s.id} name={s.name} selected={p.selected} onSelect={p.onSelect} />}
            <VolumeSlider speaker={s} onVolume={p.onVolume} showName />
          </div>
        ))}
      </div>
      {open && <Details leader={leader} actions={p} />}
    </li>
  );
}

/** Alle rommene som en liste nedover. Grupper står samlet med en farget strek. */
export function RoomList(props: Props) {
  return (
    <ul className="flex flex-col divide-y-2 divide-line overflow-hidden rounded-3xl bg-card shadow-[0_2px_12px_rgba(120,90,60,0.08)]">
      {props.groups.map((g) =>
        g.speakers.length > 1 ? <GroupedRooms key={g.leader.id} {...props} group={g} /> : <SingleRoom key={g.leader.id} {...props} group={g} />
      )}
    </ul>
  );
}
