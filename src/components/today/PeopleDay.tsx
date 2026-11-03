"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { eventWhen, peopleForDay, type PersonDay } from "@/lib/calendar/peopleDay";
import type { CalendarCategory, CalendarEvent, CalendarMember } from "@/lib/calendar/types";
import { FitList } from "./FitList";

// Hvem skal hva en dag, gruppert per person med avatar. Brukes i «I dag» i appen og på dashboardet,
// så de ser like ut. På dashboardet er den kompakt og viser bare det som får plass.

/** Klokka nå i millisekunder, oppdatert hvert minutt. `null` på serveren og før første tegning i nettleseren. */
export function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const frame = requestAnimationFrame(tick);
    const timer = setInterval(tick, 60_000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, []);
  return now;
}

type Status = "ferdig" | "nå" | "neste" | null;

/** Ferdig (passert), pågår nå, eller den neste som kommer i dag. Heldagsavtaler får ingen status. */
function statuses(people: PersonDay[], now: number | null): Map<string, Status> {
  const map = new Map<string, Status>();
  if (now === null) return map;
  const timed = people.flatMap((p) => p.events).filter((e) => !e.allDay);
  let next: CalendarEvent | null = null;
  for (const e of timed) {
    const start = Date.parse(e.start);
    const end = Date.parse(e.end);
    if (end <= now) map.set(e.id, "ferdig");
    else if (start <= now) map.set(e.id, "nå");
    else if (!next || start < Date.parse(next.start)) next = e;
  }
  if (next && ![...map.values()].includes("nå")) map.set(next.id, "neste");
  return map;
}

/**
 * Dagen per person. `compact` (dashboardet): mindre avatarer og skrift, og bare så mange personer som får plass,
 * med «+N til». `live` viser hva som er ferdig, hva som pågår nå og hva som er neste (bare for i dag).
 */
export function PeopleDay({
  events,
  day,
  members,
  categories,
  compact = false,
  live = false,
  empty = "Ingenting i kalenderen.",
}: {
  events: CalendarEvent[];
  day: string;
  members: CalendarMember[];
  categories: CalendarCategory[];
  compact?: boolean;
  live?: boolean;
  empty?: string;
}) {
  const now = useNow();
  const all = peopleForDay(events, day, members);
  const status = live ? statuses(all, now) : new Map<string, Status>();
  // På dashboardet (kompakt) tar ikke ferdige avtaler plass fra det som kommer; de telles bare.
  const hideDone = compact && live;
  const done = hideDone ? new Set(all.flatMap((p) => p.events).filter((e) => status.get(e.id) === "ferdig").map((e) => e.id)).size : 0;
  const people = hideDone ? all.map((p) => ({ ...p, events: p.events.filter((e) => status.get(e.id) !== "ferdig") })).filter((p) => p.events.length) : all;
  const doneLine = done > 0 && <p className="text-xs text-ink-light">✓ {done} {done === 1 ? "avtale" : "avtaler"} ferdig i dag</p>;
  if (!all.length) return <p className={compact ? "text-xs text-ink-light" : "text-ink-light"}>{empty}</p>;
  if (!people.length) return doneLine || null;

  const person = ({ member: m, events: list }: PersonDay) => (
    <li key={m.id} className={`flex ${compact ? "gap-2 py-1" : "gap-3"}`}>
      <Avatar name={m.name} color={m.color} icon={m.icon} url={m.avatarUrl} size={compact ? 26 : 34} />
      <div className="min-w-0 flex-1">
        <p className={`${compact ? "text-xs" : "text-sm"} font-bold`} style={{ color: m.color }}>
          {m.name}
        </p>
        <ul className="flex flex-col gap-0.5">
          {list.map((e) => {
            const cat = categories.find((c) => c.id === e.categoryId);
            const s = status.get(e.id) ?? null;
            return (
              <li key={e.id} className={`wrap-break-word ${s === "ferdig" ? "opacity-45" : ""} ${compact ? "text-sm leading-snug" : ""}`}>
                <span className={`mr-1.5 font-bold tabular-nums text-ink-light ${compact ? "text-xs" : "text-sm"}`}>{eventWhen(e, day)}</span>
                {cat && <span aria-hidden>{cat.icon} </span>}
                <span className="font-semibold">{e.title}</span>
                {e.location && <span className={`text-ink-light ${compact ? "text-xs" : "text-sm"}`}> · {e.location}</span>}
                {(s === "nå" || s === "neste") && (
                  <span className={`ml-1.5 inline-block rounded-full px-1.5 align-[0.1em] text-[0.65rem] font-bold uppercase tracking-wide ${s === "nå" ? "bg-primary text-white" : "bg-primary-soft text-primary-dark"}`}>{s}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </li>
  );

  if (!compact) return <ul className="flex flex-col gap-3">{people.map(person)}</ul>;
  return (
    <>
      {doneLine}
      <FitList items={people} keyOf={(p) => `${p.member.id}:${p.events.map((e) => e.id).join(",")}`} weight={(p) => p.events.length} render={person} more={(n) => `+${n} ${n === 1 ? "avtale" : "avtaler"} til`} />
    </>
  );
}
