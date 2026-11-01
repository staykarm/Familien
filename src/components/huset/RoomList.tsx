"use client";

import { useState, type DragEvent, type ReactNode } from "react";
import { Check, GripVertical, Link2, Link2Off, ListMusic, Plus, SkipBack, SkipForward, X } from "lucide-react";
import { buttonSecondary } from "@/components/ui/styles";
import { groupName, type Speaker, type SpeakerGroup } from "@/lib/huset/sonos";
import { Cover, nowPlaying, PlayButton, VolumeSlider } from "./parts";

export interface RoomActions {
  onToggle: (leader: Speaker) => void;
  onSkip: (leader: Speaker, action: "next" | "previous") => void;
  onVolume: (id: string, volume: number, send: boolean) => void;
  onSource: (leader: Speaker, source: string) => void;
  onMusic: (leader: Speaker) => void;
  /** Koble rommet `speakerId` til gruppen `leaderId` leder. */
  onJoin: (leaderId: string, speakerId: string) => void;
  /** Ta rommet ut av gruppen sin. */
  onUnjoin: (speakerId: string) => void;
  /** Løs opp hele gruppen. */
  onUngroup: (leader: Speaker) => void;
}

interface Props extends RoomActions {
  groups: SpeakerGroup[];
  /** Rommet/gruppen som er åpnet (lederens id). */
  open: string | null;
  onOpen: (id: string | null) => void;
  /** Gruppen man legger til rom i akkurat nå (lederens id). */
  adding: string | null;
  onAdding: (id: string | null) => void;
}

const DRAG_TYPE = "application/x-huset-rom";

/** Det man får når man trykker på et rom: forrige/neste, «Velg musikk» og favorittene. Brukes også på musikk-kartet. */
export function Details({ leader, actions }: { leader: Speaker; actions: Pick<RoomActions, "onSkip" | "onMusic" | "onSource"> }) {
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

/** Brikker for alle andre rom: ett trykk kobler rommet til gruppen. Står åpen til man trykker «Ferdig». */
function AddRooms({ group, all, onJoin, onDone }: { group: SpeakerGroup; all: Speaker[]; onJoin: (id: string) => void; onDone: () => void }) {
  const inGroup = new Set(group.speakers.map((s) => s.id));
  const others = all.filter((s) => !inGroup.has(s.id));
  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <span className="text-sm font-bold text-ink-light">Spill også i:</span>
      <div className="flex flex-wrap gap-2">
        {others.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onJoin(s.id)}
            className="flex min-h-11 items-center gap-1.5 rounded-full border-2 border-line bg-card px-3 text-sm font-bold transition active:scale-95 hover:border-primary"
          >
            <Plus size={16} aria-hidden />
            {s.name}
            {s.status === "playing" && <span className="font-normal text-ink-light">spiller</span>}
          </button>
        ))}
        {!others.length && <span className="text-sm text-ink-light">Alle rommene er med.</span>}
        <button type="button" onClick={onDone} className="flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-bold text-white">
          <Check size={16} aria-hidden />
          Ferdig
        </button>
      </div>
    </div>
  );
}

function AddButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Spill ${label} i flere rom`}
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 transition ${
        active ? "border-primary bg-primary-soft text-primary-dark" : "border-line bg-card text-ink-light hover:text-ink"
      }`}
    >
      <Link2 size={20} aria-hidden />
    </button>
  );
}

/** Håndtak for dra og slipp (bare på større skjermer; på telefon brukes brikkene). */
function Grip({ id, name, onDrag }: { id: string; name: string; onDrag: (id: string | null) => void }) {
  return (
    <span
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, id);
        e.dataTransfer.effectAllowed = "move";
        const row = e.currentTarget.closest("[data-room]");
        if (row) e.dataTransfer.setDragImage(row, 24, 24);
        onDrag(id);
      }}
      onDragEnd={() => onDrag(null)}
      title={`Dra ${name} til et annet rom for å spille sammen`}
      aria-hidden
      className="hidden h-12 w-6 shrink-0 cursor-grab items-center justify-center text-ink-faint hover:text-ink-light active:cursor-grabbing md:flex"
    >
      <GripVertical size={20} />
    </span>
  );
}

/** Rad eller gruppe man kan slippe et rom på. */
function DropTarget({
  leaderId,
  dragging,
  onDrop,
  className,
  children,
}: {
  leaderId: string;
  dragging: string | null;
  onDrop: (leaderId: string, speakerId: string) => void;
  className: string;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE);
  return (
    <li
      data-room
      onDragOver={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        setOver(false);
        const id = e.dataTransfer.getData(DRAG_TYPE);
        if (id) {
          e.preventDefault();
          onDrop(leaderId, id);
        }
      }}
      className={`${className} transition ${over && dragging ? "relative z-10 ring-4 ring-inset ring-primary" : ""}`}
    >
      {children}
    </li>
  );
}

type RowProps = Props & { group: SpeakerGroup; all: Speaker[]; dragging: string | null; onDrag: (id: string | null) => void };

/** Rom som spiller alene: én rad med cover, navn, det som spilles, spill/pause og volum. */
function SingleRoom({ group, all, dragging, onDrag, ...p }: RowProps) {
  const s = group.leader;
  const open = p.open === s.id;
  const adding = p.adding === s.id;
  return (
    <DropTarget leaderId={s.id} dragging={dragging} onDrop={p.onJoin} className="flex flex-col gap-1 px-3 py-2.5 sm:px-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <Grip id={s.id} name={s.name} onDrag={onDrag} />
          <button type="button" className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left" onClick={() => p.onOpen(open ? null : s.id)} aria-expanded={open}>
            <Cover speaker={s} />
            <span className="min-w-0">
              <span className="block font-bold wrap-break-word">{s.name}</span>
              <span className="block text-sm text-ink-light wrap-break-word">{nowPlaying(s)}</span>
            </span>
          </button>
          <AddButton active={adding} onClick={() => p.onAdding(adding ? null : s.id)} label={s.name} />
          <PlayButton playing={s.status === "playing"} onClick={() => p.onToggle(s)} label={s.name} />
        </div>
        <div className="flex sm:w-60 lg:w-72">
          <VolumeSlider speaker={s} onVolume={p.onVolume} />
        </div>
      </div>
      {adding && <AddRooms group={group} all={all} onJoin={(id) => p.onJoin(s.id, id)} onDone={() => p.onAdding(null)} />}
      {open && <Details leader={s} actions={p} />}
    </DropTarget>
  );
}

/** Rom som spiller sammen: felles linje for musikken, og volum per rom under (med × for å ta rommet ut). */
function GroupedRooms({ group, all, dragging, onDrag, ...p }: RowProps) {
  const leader = group.leader;
  const open = p.open === leader.id;
  const adding = p.adding === leader.id;
  const name = groupName(group);
  return (
    <DropTarget leaderId={leader.id} dragging={dragging} onDrop={p.onJoin} className="flex flex-col gap-1 border-l-4 border-primary bg-primary-soft/40 px-3 py-2.5 sm:px-4">
      <div className="flex items-center gap-2 sm:gap-3">
        <button type="button" className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left md:pl-8" onClick={() => p.onOpen(open ? null : leader.id)} aria-expanded={open}>
          <Cover speaker={leader} />
          <span className="min-w-0">
            <span className="block font-bold wrap-break-word">{name}</span>
            <span className="block text-sm text-ink-light wrap-break-word">{nowPlaying(leader)}</span>
          </span>
        </button>
        <button type="button" className={`${buttonSecondary} shrink-0 px-3`} onClick={() => p.onUngroup(leader)} aria-label="Løs opp gruppen">
          <Link2Off size={20} aria-hidden />
          <span className="hidden sm:inline">Løs opp</span>
        </button>
        <AddButton active={adding} onClick={() => p.onAdding(adding ? null : leader.id)} label={name} />
        <PlayButton playing={leader.status === "playing"} onClick={() => p.onToggle(leader)} label={name} />
      </div>
      <div className="grid gap-x-6 sm:grid-cols-2">
        {group.speakers.map((s) => (
          <div key={s.id} className="flex items-center gap-1">
            <Grip id={s.id} name={s.name} onDrag={onDrag} />
            <VolumeSlider speaker={s} onVolume={p.onVolume} showName />
            <button
              type="button"
              onClick={() => p.onUnjoin(s.id)}
              aria-label={`Ta ${s.name} ut av gruppen`}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-light transition hover:bg-card hover:text-ink"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      {adding && <AddRooms group={group} all={all} onJoin={(id) => p.onJoin(leader.id, id)} onDone={() => p.onAdding(null)} />}
      {open && <Details leader={leader} actions={p} />}
    </DropTarget>
  );
}

/**
 * Alle rommene som en liste nedover. Grupper står samlet med en farget strek.
 * Gruppere: trykk på lenkeknappen og velg rom, eller (på større skjermer) dra et rom til et annet.
 * Dra et rom til «Spill alene» for å ta det ut av gruppen.
 */
export function RoomList(props: Props) {
  const [dragging, setDragging] = useState<string | null>(null);
  const all = props.groups.flatMap((g) => g.speakers).sort((a, b) => a.name.localeCompare(b.name, "nb"));
  const draggedInGroup = !!dragging && props.groups.some((g) => g.speakers.length > 1 && g.speakers.some((s) => s.id === dragging));

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y-2 divide-line overflow-hidden rounded-3xl bg-card shadow-[0_2px_12px_rgba(120,90,60,0.08)]">
        {props.groups.map((g) => {
          const row = { ...props, group: g, all, dragging, onDrag: setDragging };
          return g.speakers.length > 1 ? <GroupedRooms key={g.leader.id} {...row} /> : <SingleRoom key={g.leader.id} {...row} />;
        })}
      </ul>
      {draggedInGroup && (
        <div
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault();
          }}
          onDrop={(e) => {
            const id = e.dataTransfer.getData(DRAG_TYPE);
            if (id) props.onUnjoin(id);
            setDragging(null);
          }}
          className="sticky bottom-4 z-20 flex min-h-16 items-center justify-center rounded-3xl border-2 border-dashed border-primary bg-primary-soft font-bold text-primary-dark shadow-lg"
        >
          Slipp her for å spille alene
        </div>
      )}
    </div>
  );
}
