"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { formatTemp, WeatherIcon } from "@/components/weather/WeatherBadge";
import type { CalendarCategory, CalendarMember } from "@/lib/calendar/types";
import type { AgendaItem } from "@/lib/dashboard/day";
import { TIME_ZONE } from "@/lib/time";
import type { DailyWeather, HourlyWeather } from "@/lib/weather/yr";

// Byggeklosser for dashboardet: kort, klokke, avtaler og været.

/** Lenke til en underside av dashboardet (`?vis=…`). */
export const viewHref = (view: string, extra?: Record<string, string>) => `/dashboard?${new URLSearchParams({ vis: view, ...extra })}`;

export const label = "text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-ink-light";

/** Kort med tittel. Med `href` blir tittelen en lenke til undersiden («Vis alt ›»). */
export function Card({ title, href, aside, className = "", children }: { title: string; href?: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`flex min-h-0 flex-col gap-2 rounded-xl border border-line bg-card p-3 ${className}`} aria-label={title}>
      <header className="flex items-center gap-2">
        {href ? (
          <Link href={href} className={`${label} -m-1 flex flex-1 items-center gap-1 rounded-md p-1 hover:text-ink`}>
            {title}
            <ChevronRight size={12} className="ml-auto" aria-hidden />
          </Link>
        ) : (
          <h2 className={`${label} flex-1`}>{title}</h2>
        )}
        {aside}
      </header>
      {children}
    </section>
  );
}

const clockFormat = new Intl.DateTimeFormat("nb-NO", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat("nb-NO", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" });

/** Klokke og dato i Oslo-tid. Vises først i nettleseren, så server og nettleser ikke er uenige om tiden. */
export function Clock({ withDate = true }: { withDate?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const frame = requestAnimationFrame(tick);
    const timer = setInterval(tick, 10_000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, []);
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-2xl font-semibold tabular-nums tracking-tight">{now ? clockFormat.format(now) : "--:--"}</span>
      {withDate && <span className="text-sm text-ink-light first-letter:uppercase">{now ? dateFormat.format(now) : ""}</span>}
    </div>
  );
}

function Who({ ids, members }: { ids: string[]; members: CalendarMember[] }) {
  const people = ids.map((id) => members.find((m) => m.id === id)).filter((m): m is CalendarMember => !!m && !m.isShared);
  if (!people.length) return null;
  return (
    <span className="flex shrink-0 -space-x-1">
      {people.map((m) => (
        <Avatar key={m.id} name={m.name} color={m.color} icon={m.icon} url={m.avatarUrl} size={18} ring={false} />
      ))}
    </span>
  );
}

/** Avtalene for en dag: tid, fargeprikk for kategorien, tittel, sted og hvem. */
export function AgendaList({ items, members, categories, max, empty = "Ingen avtaler" }: { items: AgendaItem[]; members: CalendarMember[]; categories: CalendarCategory[]; max?: number; empty?: string }) {
  if (!items.length) return <p className="text-xs text-ink-light">{empty}</p>;
  const shown = max ? items.slice(0, max) : items;
  return (
    <ul className="flex flex-col">
      {shown.map((a) => {
        const cat = categories.find((c) => c.id === a.categoryId);
        return (
          <li key={a.id} className="flex items-start gap-2 border-b border-line py-1.5 last:border-0">
            <span className="w-[4.6rem] shrink-0 text-xs tabular-nums text-ink-light">{a.when}</span>
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: cat?.color ?? "var(--color-ink-faint)" }} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm leading-snug font-medium wrap-break-word">{a.title}</span>
              {a.location && <span className="block text-xs text-ink-light wrap-break-word">{a.location}</span>}
            </span>
            <Who ids={a.memberIds} members={members} />
          </li>
        );
      })}
      {max && items.length > max && <li className="pt-1 text-xs text-ink-light">+{items.length - max} til</li>}
    </ul>
  );
}

const warm = (t: number | null) => ((t ?? 0) > 0 ? "text-[#c60000]" : "text-[#0062ba]");
const mm = (n: number | null) => (n && n >= 0.1 ? n.toLocaleString("nb-NO", { maximumFractionDigits: 1 }) : "");
const hourLabel = (h: HourlyWeather) => String(h.hour).padStart(2, "0");

/** Time for time: klokkeslett, symbol, temperatur og nedbør. */
export function HoursStrip({ hours }: { hours: HourlyWeather[] }) {
  if (!hours.length) return <p className="text-xs text-ink-light">Fant ikke værvarselet.</p>;
  return (
    <ol className="grid" style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}>
      {hours.map((h) => (
        <li key={h.time} className="flex flex-col items-center gap-0.5 border-l border-line first:border-0">
          <span className="text-[0.65rem] tabular-nums text-ink-light">{hourLabel(h)}</span>
          <WeatherIcon code={h.symbolCode} size={22} />
          <span className={`text-xs font-semibold tabular-nums ${warm(h.temp)}`}>{formatTemp(h.temp)}</span>
          <span className="h-3 text-[0.6rem] tabular-nums text-[#0062ba]">{mm(h.precipitationMm)}</span>
        </li>
      ))}
    </ol>
  );
}

const weekday = (date: string) => new Intl.DateTimeFormat("nb-NO", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)).replace(".", "");

/** De neste dagene: ukedag, symbol, maks/min og nedbør. */
export function DaysRow({ days, columns = 5 }: { days: DailyWeather[]; columns?: number }) {
  if (!days.length) return null;
  return (
    <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(columns, days.length)}, minmax(0, 1fr))` }}>
      {days.map((d) => (
        <li key={d.date} className="flex items-center justify-center gap-1.5 rounded-lg bg-card-soft px-1 py-1.5">
          <span className="text-xs font-medium capitalize">{weekday(d.date)}</span>
          <WeatherIcon code={d.symbolCode} size={24} />
          <span className="flex flex-col text-xs leading-tight tabular-nums">
            <span className={`font-semibold ${warm(d.tempMax)}`}>{formatTemp(d.tempMax)}</span>
            <span className="text-ink-light">{formatTemp(d.tempMin)}</span>
          </span>
          {mm(d.precipitationMm) && <span className="text-[0.65rem] tabular-nums text-[#0062ba]">{mm(d.precipitationMm)}</span>}
        </li>
      ))}
    </ol>
  );
}
