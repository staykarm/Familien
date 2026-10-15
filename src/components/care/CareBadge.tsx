import { Avatar } from "@/components/ui/Avatar";
import type { Pickup } from "@/lib/care/plan";
import type { CalendarMember } from "@/lib/calendar/types";

interface Props {
  pickup: Pickup;
  members: CalendarMember[];
  /** Smale ruter (kolonner på telefon og ukevisning): bare avatar, ikke navn. */
  compact?: boolean;
}

/** «Hentes 16:00 · Marius» i barnets kolonne/rad. */
export function CareBadge({ pickup, members, compact = false }: Props) {
  const who = members.find((m) => m.id === pickup.by);
  return (
    <div
      className={`flex flex-wrap items-center gap-x-1 rounded-lg border border-dashed border-line bg-card-soft leading-tight wrap-break-word ${
        compact ? "px-0.5 py-0.5 text-[9px] sm:text-[10px]" : "px-1.5 py-1 text-xs"
      }`}
      aria-label={`Hentes${pickup.time ? ` ${pickup.time}` : ""}${who ? ` av ${who.name}` : ""}`}
    >
      <span className="font-bold text-ink-light">🚸 Hentes</span>
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        {pickup.time && <span className="font-bold tabular-nums">{pickup.time}</span>}
        {who && <Avatar name={who.name} color={who.color} icon={who.icon} url={who.avatarUrl} size={compact ? 12 : 16} ring={false} />}
      </span>
      {who && !compact && <span className="font-semibold">{who.name}</span>}
      {!who && <span className="font-semibold text-danger">ingen satt opp</span>}
    </div>
  );
}
