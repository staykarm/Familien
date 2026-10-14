import { Avatar } from "@/components/ui/Avatar";
import type { CarePlanDay } from "@/lib/care/plan";
import type { CalendarMember } from "@/lib/calendar/types";

interface Props {
  plan: CarePlanDay;
  members: CalendarMember[];
  /** Smale ruter (kolonner på telefon og ukevisning): bare avatar, ikke navn. */
  compact?: boolean;
}

/** «Lever 08:00 Marius · Henter 16:00 Ingvild» for et barn én hverdag. */
export function CareBadge({ plan, members, compact = false }: Props) {
  const rows = [
    { label: "Lever", short: "Lev.", by: plan.dropBy, time: plan.dropTime },
    { label: "Henter", short: "Hent", by: plan.pickBy, time: plan.pickTime },
  ].filter((r) => r.by || r.time);
  return (
    <div
      className={`flex flex-col rounded-lg border border-dashed border-line bg-card-soft ${compact ? "gap-0 px-0.5 py-0.5" : "gap-0.5 px-1.5 py-1"}`}
    >
      {rows.map((r) => {
        const who = members.find((m) => m.id === r.by);
        return (
          <span
            key={r.label}
            className={`flex flex-wrap items-center gap-x-1 leading-tight wrap-break-word ${compact ? "text-[9px] sm:text-[10px]" : "text-xs"}`}
            aria-label={`${r.label}${r.time ? ` ${r.time}` : ""}${who ? `: ${who.name}` : ""}`}
          >
            <span className="font-bold text-ink-light">
              {compact ? r.short : r.label}
            </span>
            {compact ? (
              // Klokkeslett og avatar holdes sammen, så smale ruter får to linjer per rad i stedet for tre.
              <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
                {r.time && (
                  <span className="font-bold tabular-nums">{r.time}</span>
                )}
                {who && (
                  <Avatar
                    name={who.name}
                    color={who.color}
                    icon={who.icon}
                    url={who.avatarUrl}
                    size={12}
                    ring={false}
                  />
                )}
              </span>
            ) : (
              r.time && <span className="font-bold tabular-nums">{r.time}</span>
            )}
            {who && !compact && (
              <span className="inline-flex items-center gap-1 font-semibold">
                <Avatar
                  name={who.name}
                  color={who.color}
                  icon={who.icon}
                  url={who.avatarUrl}
                  size={16}
                  ring={false}
                />
                {who.name}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
