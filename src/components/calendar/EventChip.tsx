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
  timeLabel?: string;
  /** Vis deltakerprikker (unødvendig i en kolonne som allerede er per person). */
  showParticipants?: boolean;
  compact?: boolean;
}

/** Innholdet i en aktivitetsboks: kategori-ikon, tittel, klokkeslett og deltakere. */
export function EventChipContent({ event, members, category, timeLabel, showParticipants = true, compact }: ChipProps) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 leading-tight">
      <span className="flex min-w-0 items-center gap-1">
        {category && <span aria-hidden>{category.icon}</span>}
        <span className={`truncate font-bold ${compact ? "text-xs" : "text-sm"}`}>{event.title}</span>
      </span>
      {(timeLabel || showParticipants) && (
        <span className="flex items-center gap-1.5 text-xs text-ink-light">
          {timeLabel && <span className="tabular-nums">{timeLabel}</span>}
          {showParticipants && <ParticipantDots ids={event.participantIds} members={members} />}
        </span>
      )}
    </span>
  );
}
