import { titleVariants } from "@/lib/calendar/shorten";
import type { CalendarCategory, CalendarEvent, CalendarMember } from "@/lib/calendar/types";

/** Små fargeprikker for deltakerne, slik at man ser hvem som er med uten å åpne aktiviteten. */
export function ParticipantDots({ ids, members, size = 10 }: { ids: string[]; members: CalendarMember[]; size?: number }) {
  return (
    <span className="inline-flex shrink-0 -space-x-0.5">
      {ids.map((id) => {
        const m = members.find((x) => x.id === id);
        if (!m) return null;
        return (
          <span
            key={id}
            title={m.name}
            className="inline-block rounded-full ring-2 ring-white"
            style={{ width: size, height: size, background: m.color }}
          />
        );
      })}
    </span>
  );
}

interface ChipProps {
  event: CalendarEvent;
  members: CalendarMember[];
  category?: CalendarCategory;
  /** Klokkeslett. `end` vises bare når det er god plass. */
  time?: { start: string; end?: string } | string;
  /** Vis deltakerprikker (unødvendig i en kolonne som allerede er per person). */
  showParticipants?: boolean;
  /** Én linje (måned og ukelister). */
  compact?: boolean;
  /** Boks med fast høyde og bredde (tidslinjen): teksten tilpasses både bredde og høyde. */
  box?: boolean;
}

/**
 * Innholdet i en aktivitetsboks: kategori-ikon, tittel, klokkeslett og deltakere.
 * Når det er trangt (f.eks. tre aktiviteter side om side) krymper skriften, teksten brytes over flere linjer,
 * og tittelen byttes til en forkortet variant. Alt styres av container queries i globals.css (`.ev-*`).
 */
export function EventChipContent({ event, members, category, time, showParticipants = true, compact, box }: ChipProps) {
  const v = titleVariants(event.title);
  const warn = event.syncStatus === "conflict" ? "⚠️ " : "";
  const t = typeof time === "string" ? { start: time } : time;
  return (
    <span className={`ev ${box ? "ev-box" : "ev-inline"} ${compact ? "ev-compact" : ""}`}>
      <span className="sr-only">
        {event.title}
        {t ? `, ${t.start}${t.end ? `–${t.end}` : ""}` : ""}
      </span>
      <span className="ev-title" lang="nb" aria-hidden>
        {category && <span className="ev-icon">{category.icon} </span>}
        {warn}
        <span className="ev-t-full">{v.full}</span>
        <span className="ev-t-mid">{v.medium}</span>
        <span className="ev-t-short">{v.short}</span>
        <span className="ev-t-tiny">{v.tiny}</span>
      </span>
      {(t || showParticipants) && (
        <span className="ev-meta" aria-hidden>
          {t && (
            <span className="tabular-nums">
              <span className="ev-time-full">{t.end ? `${t.start}–${t.end}` : t.start}</span>
              <span className="ev-time-short">{t.start}</span>
            </span>
          )}
          {showParticipants && <ParticipantDots ids={event.participantIds} members={members} size={8} />}
        </span>
      )}
    </span>
  );
}
