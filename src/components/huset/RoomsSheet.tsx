"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";
import type { Speaker, SpeakerGroup } from "@/lib/huset/sonos";

interface Props {
  group: SpeakerGroup;
  /** Alle høyttalere som svarer. */
  all: Speaker[];
  onClose: () => void;
  /** Hvem som skal spille sammen med lederen (uten lederen selv). */
  onSave: (members: string[]) => void;
}

/** Velg hvilke rom som skal spille det samme som dette rommet. */
export function RoomsSheet({ group, all, onClose, onSave }: Props) {
  const leader = group.leader;
  const [chosen, setChosen] = useState(() => new Set(group.speakers.map((s) => s.id).filter((id) => id !== leader.id)));
  const others = all.filter((s) => s.id !== leader.id);

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Sheet
      title={`Spill sammen med ${leader.name}`}
      onClose={onClose}
      onSubmit={() => onSave([...chosen])}
      footer={
        <>
          <button type="submit" className={buttonPrimary}>
            Bruk
          </button>
          <button type="button" className={buttonSecondary} onClick={onClose}>
            Avbryt
          </button>
        </>
      }
    >
      <p className="text-sm text-ink-light">Rommene du velger, spiller det samme som {leader.name}. Fjern haken for å la et rom spille for seg selv.</p>
      <ul className="flex flex-col gap-1">
        {others.map((s) => {
          // Et rom som leder en annen gruppe, blir med her og forlater den gamle.
          const busyElsewhere = !chosen.has(s.id) && s.groupMembers.length > 1;
          return (
            <li key={s.id}>
              <label className="flex min-h-12 items-center gap-3 rounded-2xl px-2 hover:bg-card-soft">
                <input type="checkbox" checked={chosen.has(s.id)} onChange={() => toggle(s.id)} className="h-6 w-6 accent-primary" />
                <span className="font-bold">{s.name}</span>
                {s.status === "playing" && !chosen.has(s.id) && <span className="text-sm text-ink-light">spiller nå</span>}
                {busyElsewhere && s.status !== "playing" && <span className="text-sm text-ink-light">i en annen gruppe</span>}
              </label>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
