import { Avatar } from "@/components/ui/Avatar";
import { PART_LABEL, type CareDayPlan, type CareSlot } from "@/lib/care/plan";
import type { CalendarMember } from "@/lib/calendar/types";

interface Props {
  day: CareDayPlan;
  members: CalendarMember[];
  /** Smale ruter (kolonner på telefon og ukevisning): bare avatar, ikke navn. */
  compact?: boolean;
}

/** «Lev. 08:00 · Marius / Hent 16:00 · Ingvild» i barnets kolonne/rad. */
export function CareBadge({ day, members, compact = false }: Props) {
  const slots = [day.drop, day.pick].filter((s): s is CareSlot => s !== null);
  return (
    <div className={`flex flex-col rounded-lg border border-dashed border-line bg-card-soft ${compact ? "px-0.5 py-0.5" : "gap-0.5 px-1.5 py-1"}`}>
      {slots.map((s) => {
        const who = members.find((m) => m.id === s.by);
        const label = PART_LABEL[s.part];
        return (
          <span
            key={s.part}
            className={`flex flex-wrap items-center gap-x-1 leading-tight wrap-break-word ${compact ? "text-[9px] sm:text-[10px]" : "text-xs"}`}
            aria-label={`${label.noun}${s.time ? ` ${s.time}` : ""}${who ? `: ${who.name}` : ": ingen satt opp"}`}
          >
            <span className="font-bold text-ink-light">{compact ? label.short : `🚸 ${label.noun}`}</span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              {s.time && <span className="font-bold tabular-nums">{s.time}</span>}
              {who && <Avatar name={who.name} color={who.color} icon={who.icon} url={who.avatarUrl} size={compact ? 12 : 16} ring={false} />}
            </span>
            {who && !compact && <span className="font-semibold">{who.name}</span>}
            {!who && <span className="font-semibold text-danger">{compact ? "?" : "ingen satt opp"}</span>}
          </span>
        );
      })}
    </div>
  );
}
