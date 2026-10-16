"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { card } from "@/components/ui/styles";
import type { CalendarMember } from "@/lib/calendar/types";
import type { CareData } from "@/lib/care/plan";
import { CarePlanEditor } from "./CarePlanEditor";

const CHILD_KEY = "familien.henting.barn";

interface Props {
  members: CalendarMember[];
  care: CareData;
  initialChild: string | null;
}

/** Barnet med flest registreringer (i praksis Olav). */
function mostUsedChild(care: CareData): string | null {
  const counts = new Map<string, number>();
  for (const e of care.entries) counts.set(e.memberId, (counts.get(e.memberId) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * «Henting» i hovedmenyen: hvem som leverer og henter dag for dag. Velg barnet øverst
 * (huskes på enheten); er det registrert noe fra før, velges barnet med flest registreringer.
 */
export function CarePage({ members, care, initialChild }: Props) {
  const people = members.filter((m) => !m.isShared);
  const known = (id: string | null) => (id && people.some((p) => p.id === id) ? id : null);
  const [child, setChild] = useState<string | null>(() => known(initialChild) ?? known(mostUsedChild(care)));

  // Uten valg i adressen eller data: bruk det som sist ble valgt på denne enheten.
  useEffect(() => {
    if (child) return;
    let saved: string | null = null;
    try {
      saved = known(localStorage.getItem(CHILD_KEY));
    } catch {
      // Lagring er av (privat modus): man velger bare på nytt.
    }
    if (!saved) return;
    const frame = requestAnimationFrame(() => setChild(saved));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bare ved oppstart
  }, []);

  function choose(id: string) {
    setChild(id);
    try {
      localStorage.setItem(CHILD_KEY, id);
    } catch {
      // Ikke viktig om det ikke huskes.
    }
  }

  const current = people.find((p) => p.id === child) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-bold sm:text-2xl lg:text-3xl">🚸 Levering og henting</h1>

      <section className={`${card} flex flex-col gap-2`}>
        <span className="text-sm font-bold text-ink-light">Hvem skal leveres og hentes?</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Barn">
          {people.map((p) => {
            const on = p.id === child;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => choose(p.id)}
                className={`flex min-h-12 items-center gap-1.5 rounded-2xl border-2 px-2 font-semibold transition ${
                  on ? "bg-card" : "border-transparent text-ink-light opacity-60"
                }`}
                style={on ? { borderColor: p.color } : undefined}
              >
                <Avatar name={p.name} color={p.color} icon={p.icon} url={p.avatarUrl} size={28} ring={on} />
                <span className="text-sm">{p.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      {current ? (
        <CarePlanEditor
          key={current.id}
          memberId={current.id}
          memberName={current.name}
          people={people.filter((p) => p.id !== current.id)}
          initial={care}
          alwaysOpen
          heading={current.name}
        />
      ) : (
        <p className="text-ink-light">Velg barnet over for å legge inn hvem som leverer og henter.</p>
      )}
    </div>
  );
}
