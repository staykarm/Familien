import { Avatar } from "@/components/ui/Avatar";
import type { CalendarMember } from "@/lib/calendar/types";
import { careSummary, careText, dutyVerb, type CareData } from "@/lib/care/plan";

interface Props {
  care: CareData;
  date: string;
  members: CalendarMember[];
  /** Smale datohoder (uke på telefon): bare avatarene, teksten ligger i title/aria-label. */
  compact?: boolean;
  className?: string;
}

/** «🚸 Ingvild leverer og henter» / «🚸 Marius leverer, Ingvild henter» ved datoen. Ingenting når dagen er tom. */
export function CareLine({ care, date, members, compact = false, className = "" }: Props) {
  const summary = careSummary(care, date);
  if (!summary.length) return null;
  const member = (id: string | null) => (id ? members.find((m) => m.id === id) : undefined);
  const text = careText(summary, (id) => member(id)?.name ?? "");
  const multi = summary.length > 1;

  if (compact) {
    return (
      <span className={`inline-flex flex-wrap items-center justify-center gap-0.5 ${className}`} title={text} aria-label={`Levering og henting: ${text}`}>
        <span aria-hidden className="text-[10px]">
          🚸
        </span>
        {summary.flatMap((c) =>
          c.duties.map((d) => {
            const m = member(d.by);
            const key = `${c.childId}-${d.by ?? d.other}`;
            if (m) return <Avatar key={key} name={m.name} color={m.color} icon={m.icon} url={m.avatarUrl} size={16} ring={false} />;
            // Fritekst («Farmor»): forbokstaven i en nøytral sirkel.
            return (
              <span key={key} className="flex h-4 w-4 items-center justify-center rounded-full bg-line text-[9px] font-bold text-ink">
                {d.other?.[0]?.toUpperCase()}
              </span>
            );
          })
        )}
      </span>
    );
  }

  return (
    <p className={`text-sm leading-snug text-ink-light wrap-break-word ${className}`} aria-label={`Levering og henting: ${text}`}>
      <span aria-hidden>🚸 </span>
      {summary.map((c, i) => (
        <span key={c.childId}>
          {i > 0 && " · "}
          {multi && <span className="font-semibold">{member(c.childId)?.name}: </span>}
          {c.duties.map((d, j) => {
            const m = member(d.by);
            return (
              <span key={d.by ?? d.other}>
                {j > 0 && ", "}
                <strong className={`font-bold ${m ? "" : "text-ink"}`} style={m ? { color: m.color } : undefined}>
                  {m?.name ?? d.other}
                </strong>{" "}
                {dutyVerb(d.parts)}
              </span>
            );
          })}
        </span>
      ))}
    </p>
  );
}
