"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { askDashboard } from "@/actions/dashboard";
import { CareLine } from "@/components/care/CareLine";
import { HouseAgent, HouseChips, HousePage, HouseQuickLights, HouseStatusList, kr, PriceChart, SafetyBanner, usePrices, useHouseLive } from "@/components/huset/public";
import { PeopleDay } from "@/components/today/PeopleDay";
import { formatTemp, WeatherIcon } from "@/components/weather/WeatherBadge";
import type { CalendarCategory, CalendarEvent, CalendarMember } from "@/lib/calendar/types";
import type { CareData } from "@/lib/care/plan";
import type { HouseData, HouseSetup } from "@/lib/huset/public";
import type { ShoppingItem } from "@/lib/shopping/types";
import type { Task } from "@/lib/tasks/types";
import type { DailyWeather, HourlyWeather } from "@/lib/weather/yr";
import { ShoppingChecklist, TaskChecklist } from "./Lists";
import { Card, Clock, viewHref } from "./parts";
import { ColorToggle, useDashColor } from "./colorMode";
import { TodayCard } from "./TodayCard";

/** Familiedelen (avtaler, oppgaver, handlelisten, været) hentes på nytt så ofte, og når skjermen våkner. */
const FAMILY_REFRESH_MS = 2 * 60_000;

/** Henter siden på nytt fra serveren med jevne mellomrom mens den er synlig. */
export function useAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && router.refresh();
    const timer = setInterval(tick, FAMILY_REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);
}

export interface DashboardProps {
  today: string;
  tomorrow: string;
  members: CalendarMember[];
  categories: CalendarCategory[];
  /** Avtalene i dag og i morgen (vises per person, som i «I dag» i appen). */
  events: CalendarEvent[];
  care: CareData;
  tasks: Task[];
  shopping: ShoppingItem[];
  hours: HourlyWeather[];
  /** Været i dag (maks/min) og de neste dagene. */
  todayWeather: DailyWeather | undefined;
  days: DailyWeather[];
  house: HouseData;
  houseSetup: HouseSetup;
}

/**
 * Totaloversikten for iPad (liggende). Til venstre familien: «I dag» med været og hvem skal hva, og «I morgen»,
 * per person. I midten kartet over 1. og 2. etasje, med oppgavene og handlelisten under. Til høyre «Huset nå» og
 * strømmen. Hvert kort viser bare det som får plass, og åpner en underside med mer (`?vis=…`).
 */
export function Dashboard(p: DashboardProps) {
  const live = useHouseLive(p.house);
  useAutoRefresh();
  const prices = usePrices();
  const { energy, safety } = live.data;
  const tomorrowWeather = p.days.find((d) => d.date === p.tomorrow);
  const [colorful, setColorful] = useDashColor();

  return (
    <div className={`flex min-h-dvh flex-col gap-3 p-3 lg:h-dvh lg:overflow-hidden ${colorful ? "dash-farge" : ""}`}>
      <header className="flex flex-wrap items-center gap-x-6 gap-y-1 px-1">
        <Clock withDate={false} />
        <HouseChips energy={energy} safety={safety} base="/dashboard?vis=" />
        <span className="ml-auto" />
        <ColorToggle on={colorful} onChange={setColorful} />
        <Link href="/i-dag" className="text-xs font-medium text-ink-light hover:text-ink">
          Til Familien
        </Link>
      </header>

      <SafetyBanner safety={safety} />

      <main className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.25fr)_minmax(15rem,0.62fr)]">
        {/* Familien til venstre: i dag (med været) og i morgen, per person. */}
        <div className="grid min-h-0 gap-3 lg:grid-rows-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <TodayCard
            today={p.today}
            events={p.events}
            members={p.members}
            categories={p.categories}
            care={p.care}
            now={p.hours[0]}
            todayWeather={p.todayWeather}
            outdoorTemp={live.data.home.outdoorTemp}
            hours={p.hours.slice(1, 8)}
            days={p.days.slice(0, 4)}
          />
          <Card
            title="📅 I morgen"
            tone="lavendel"
            href={viewHref("dag")}
            aside={
              tomorrowWeather && (
                <span className="flex items-center gap-1 text-xs tabular-nums text-ink-light">
                  <WeatherIcon code={tomorrowWeather.symbolCode} size={20} />
                  {formatTemp(tomorrowWeather.tempMax)} / {formatTemp(tomorrowWeather.tempMin)}
                </span>
              )
            }
          >
            <CareLine care={p.care} date={p.tomorrow} members={p.members} className="text-xs" />
            <PeopleDay events={p.events} day={p.tomorrow} members={p.members} categories={p.categories} compact empty="Ingen avtaler i morgen." />
          </Card>
        </div>

        {/* I midten kartet over 1. og 2. etasje (trykk på et rom åpner det med lys, varme, persienner og musikk),
            og oppgavene og handlelisten under. */}
        <div className="flex min-h-0 flex-col gap-3">
          <Card title="🏠 Huset" tone="himmel" href={viewHref("kart")} className="shrink-0" aside={live.data.ok ? <HouseQuickLights live={live} /> : undefined}>
            <HousePage initial={p.house} setup={p.houseSetup} notice={null} fixedTab="kart" mapFloors={["1", "2"]} mapLegend={false} mapClassName="max-h-[46dvh]" onData={live.push} refreshKey={live.version} />
          </Card>
          <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
            <Card title="✅ Oppgaver" tone="mint" href={viewHref("oppgaver")} aside={<Count n={p.tasks.length} />}>
              <TaskChecklist tasks={p.tasks} members={p.members} today={p.today} fit />
            </Card>
            <Card title="🛒 Handleliste" tone="fersken" href={viewHref("handleliste")} aside={<Count n={p.shopping.filter((i) => !i.checked).length} />}>
              <ShoppingChecklist items={p.shopping} fit />
            </Card>
          </div>
        </div>

        {/* Status fra enhetene og strømmen til høyre. */}
        <div className="flex min-h-0 flex-col gap-3">
          {live.data.ok && (
            <Card title="📡 Huset nå" className="min-h-0 flex-1 overflow-y-auto">
              <HouseStatusList live={live} base="/dashboard?vis=" />
            </Card>
          )}
          {energy.price !== null && (
            <Card title="⚡ Strøm" tone="sol" href={viewHref("strom")} className="shrink-0" aside={<span className="text-xs tabular-nums text-ink-light">i dag {kr(energy.todayCost, 0)}</span>}>
              <PriceChart hours={prices.hours} now={prices.now} compact />
            </Card>
          )}
        </div>
      </main>

      <HouseAgent ask={askDashboard} onChanged={live.refresh} placeholder="Spør om huset eller familien, f.eks. «hvem henter Olav i dag?» eller «skru av lyset i stua»" />
    </div>
  );
}

/** Antall i et lite merke i kortets tittel. */
function Count({ n }: { n: number }) {
  if (!n) return null;
  return <span className="rounded-full bg-card-soft px-1.5 text-xs font-semibold tabular-nums text-ink-light">{n}</span>;
}
