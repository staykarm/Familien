"use client";

import Link from "next/link";
import { CareLine } from "@/components/care/CareLine";
import { PeopleDay, useNow } from "@/components/today/PeopleDay";
import { formatTemp, WeatherIcon } from "@/components/weather/WeatherBadge";
import { osloDate } from "@/lib/calendar/dates";
import type { CalendarCategory, CalendarEvent, CalendarMember } from "@/lib/calendar/types";
import type { CareData } from "@/lib/care/plan";
import { TIME_ZONE } from "@/lib/time";
import { symbolLabel } from "@/lib/weather/symbols";
import type { DailyWeather, HourlyWeather } from "@/lib/weather/yr";
import { label, viewHref } from "./parts";

// «I dag» på dashboardet: hilsen, dato og været (nå, timene og dagene fram) øverst, så levering/henting og
// hvem skal hva i dag, per person som i appen. Bakgrunnen får en svak tone etter tiden på døgnet.

const osloHour = (now: number) => Number(new Intl.DateTimeFormat("nb-NO", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(now));

/** Tiden på døgnet: hilsen og en svak bakgrunnstone (morgen varm, dag lys blå, kveld fersken, natt dus blå). */
export function dayPart(now: number | null): { greeting: string; tint: string } {
  if (now === null) return { greeting: "", tint: "#ffffff" };
  const h = osloHour(now);
  if (h >= 5 && h < 10) return { greeting: "God morgen", tint: "#fff5e1" };
  if (h >= 10 && h < 17) return { greeting: "God dag", tint: "#eaf3ff" };
  if (h >= 17 && h < 22) return { greeting: "God kveld", tint: "#fdeee4" };
  return { greeting: "God natt", tint: "#eceef8" };
}

/** Bare kuldegrader får farge (blå), så raden ikke blir for fargerik. */
const warm = (t: number | null) => ((t ?? 0) > 0 ? "text-ink" : "text-[#0062ba]");
const weekday = (date: string) => new Intl.DateTimeFormat("nb-NO", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)).replace(".", "");

/** Timene og dagene fram på én rad: «23 00 01 … | ons tor fre». */
function WeatherStrip({ hours, days }: { hours: HourlyWeather[]; days: DailyWeather[] }) {
  if (!hours.length && !days.length) return null;
  return (
    <Link href={viewHref("vaer")} className="flex items-stretch gap-1 rounded-lg bg-white/70 p-1 hover:bg-white" aria-label="Været time for time og de neste dagene">
      <ol className="grid min-w-0 flex-[3]" style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}>
        {hours.map((h) => (
          <li key={h.time} className="flex flex-col items-center">
            <span className="text-[0.65rem] tabular-nums text-ink-light">{String(h.hour).padStart(2, "0")}</span>
            <WeatherIcon code={h.symbolCode} size={20} />
            <span className={`text-xs font-semibold tabular-nums ${warm(h.temp)}`}>{formatTemp(h.temp)}</span>
          </li>
        ))}
      </ol>
      {days.length > 0 && (
        <ol className="grid min-w-0 flex-[2] border-l border-line pl-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((d) => (
            <li key={d.date} className="flex flex-col items-center">
              <span className="text-[0.65rem] font-semibold capitalize text-ink-light">{weekday(d.date)}</span>
              <WeatherIcon code={d.symbolCode} size={20} />
              <span className="text-xs tabular-nums">
                <span className={`font-semibold ${warm(d.tempMax)}`}>{formatTemp(d.tempMax)}</span>
                <span className="text-ink-light"> {formatTemp(d.tempMin)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Link>
  );
}

export function TodayCard({
  today,
  events,
  members,
  categories,
  care,
  now: nowWeather,
  todayWeather,
  outdoorTemp,
  hours,
  days,
}: {
  today: string;
  events: CalendarEvent[];
  members: CalendarMember[];
  categories: CalendarCategory[];
  care: CareData;
  /** Timen vi er i nå. */
  now: HourlyWeather | undefined;
  todayWeather: DailyWeather | undefined;
  /** Temperaturen målt ved huset (Home Assistant). */
  outdoorTemp: number | null;
  hours: HourlyWeather[];
  days: DailyWeather[];
}) {
  const now = useNow();
  const { greeting, tint } = dayPart(now);
  const date = osloDate(today).setLocale("nb").toFormat("cccc d. LLLL");
  const sky = symbolLabel(nowWeather?.symbolCode ?? todayWeather?.symbolCode);
  return (
    <section className="flex min-h-0 flex-col gap-2 overflow-hidden rounded-xl border border-line p-3 transition-colors duration-700" style={{ background: `linear-gradient(180deg, ${tint} 0%, #ffffff 70%)` }} aria-label="I dag">
      <div className="flex items-start gap-3">
        <Link href={viewHref("dag")} className="min-w-0 flex-1 rounded-md hover:opacity-80">
          <p className={label}>{greeting || "I dag"}</p>
          <p className="text-lg leading-tight font-bold first-letter:uppercase">{date}</p>
        </Link>
        {nowWeather && (
          <Link href={viewHref("vaer")} className="flex shrink-0 items-center gap-2 rounded-md hover:opacity-80" aria-label="Været nå">
            <WeatherIcon code={nowWeather.symbolCode} size={44} />
            <span className="flex flex-col leading-tight">
              <span className="text-3xl font-bold tabular-nums">{formatTemp(nowWeather.temp)}</span>
              <span className="text-xs text-ink-light">
                {[outdoorTemp !== null ? `ved huset ${outdoorTemp.toLocaleString("nb-NO", { maximumFractionDigits: 1 })}°` : null, todayWeather ? `${formatTemp(todayWeather.tempMax)} / ${formatTemp(todayWeather.tempMin)}` : null].filter(Boolean).join(" · ")}
              </span>
              {sky && <span className="text-xs text-ink-light">{sky}</span>}
            </span>
          </Link>
        )}
      </div>
      <WeatherStrip hours={hours} days={days} />
      <CareLine care={care} date={today} members={members} className="text-xs" />
      <PeopleDay events={events} day={today} members={members} categories={categories} compact live empty="Ingen avtaler i dag." />
    </section>
  );
}
