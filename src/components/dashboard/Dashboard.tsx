"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { askDashboard } from "@/actions/dashboard";
import { CareLine } from "@/components/care/CareLine";
import { HouseAgent, HouseChips, HousePage, HouseQuickLights, HouseStatusList, kr, PriceChart, SafetyBanner, usePrices, useHouseLive } from "@/components/huset/public";
import { formatTemp, WeatherIcon } from "@/components/weather/WeatherBadge";
import type { CalendarCategory, CalendarMember } from "@/lib/calendar/types";
import type { CareData } from "@/lib/care/plan";
import type { AgendaItem } from "@/lib/dashboard/day";
import type { HouseData, HouseSetup } from "@/lib/huset/public";
import type { ShoppingItem } from "@/lib/shopping/types";
import type { Task } from "@/lib/tasks/types";
import type { DailyWeather, HourlyWeather } from "@/lib/weather/yr";
import { ShoppingChecklist, TaskChecklist } from "./Lists";
import { AgendaList, Card, Clock, DaysRow, HoursStrip, viewHref } from "./parts";

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
  agendaToday: AgendaItem[];
  agendaTomorrow: AgendaItem[];
  care: CareData;
  tasks: Task[];
  shopping: ShoppingItem[];
  hours: HourlyWeather[];
  days: DailyWeather[];
  house: HouseData;
  houseSetup: HouseSetup;
}

/**
 * Totaloversikten for iPad (liggende): været over hele bredden øverst, familien til venstre (avtaler, oppgaver og
 * handlelisten), kartet over 1. og 2. etasje i midten, og status fra enhetene til høyre (Huset nå og strømmen).
 * «Spør» nederst. Hvert kort åpner en underside med mer (`?vis=…`).
 */
export function Dashboard(p: DashboardProps) {
  const live = useHouseLive(p.house);
  useAutoRefresh();
  const prices = usePrices();
  const now = p.hours[0];
  const outdoor = live.data.home.outdoorTemp;
  const { energy, safety } = live.data;

  return (
    <div className="flex min-h-dvh flex-col gap-3 p-3 lg:h-dvh lg:overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-1 px-1">
        <Clock />
        <HouseChips energy={energy} safety={safety} base="/dashboard?vis=" />
        <Link href="/i-dag" className="ml-auto text-xs font-medium text-ink-light hover:text-ink">
          Til Familien
        </Link>
      </header>

      <SafetyBanner safety={safety} />

      {/* Været over hele bredden: nå, time for time og de neste dagene. */}
      <Link href={viewHref("vaer")} className="flex shrink-0 items-center gap-4 rounded-2xl bg-card px-3 py-2 shadow-[0_2px_12px_rgba(0,0,0,0.05)] hover:ring-2 hover:ring-line" aria-label="Været">
        {now && (
          <div className="flex shrink-0 items-center gap-2">
            <WeatherIcon code={now.symbolCode} size={48} />
            <div className="flex flex-col leading-tight">
              <span className="text-3xl font-bold tabular-nums">{formatTemp(now.temp)}</span>
              <span className="text-xs text-ink-light">
                {outdoor !== null ? `Ved huset ${outdoor.toLocaleString("nb-NO", { maximumFractionDigits: 1 })}°` : "Nå"}
              </span>
            </div>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <HoursStrip hours={p.hours.slice(1, 11)} />
        </div>
        <div className="hidden w-[32rem] shrink-0 lg:block">
          <DaysRow days={p.days.slice(0, 5)} />
        </div>
      </Link>

      <main className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[17rem_minmax(0,1fr)_17rem]">
        {/* Familien til venstre. */}
        <div className="flex min-h-0 flex-col gap-3">
          <Card title="I dag" href={viewHref("dag")} className="overflow-hidden lg:flex-auto">
            <CareLine care={p.care} date={p.today} members={p.members} className="text-xs" />
            <AgendaList items={p.agendaToday} members={p.members} categories={p.categories} max={6} />
          </Card>
          <Card title="I morgen" href={viewHref("dag")} className="overflow-hidden lg:flex-auto">
            <CareLine care={p.care} date={p.tomorrow} members={p.members} className="text-xs" />
            <AgendaList items={p.agendaTomorrow} members={p.members} categories={p.categories} max={3} />
          </Card>
          <Card title="Oppgaver" href={viewHref("oppgaver")} className="overflow-hidden lg:flex-auto">
            <TaskChecklist tasks={p.tasks} members={p.members} today={p.today} max={4} />
          </Card>
          <Card title="Handleliste" href={viewHref("handleliste")} className="overflow-hidden lg:flex-auto">
            <ShoppingChecklist items={p.shopping} max={6} />
          </Card>
        </div>

        {/* Kartet over 1. og 2. etasje i midten: trykk på et rom åpner det med lys, varme, persienner og musikk. */}
        <Card title="Huset" href={viewHref("kart")} className="min-h-0 lg:flex-1" aside={live.data.ok ? <HouseQuickLights live={live} /> : undefined}>
          <HousePage initial={p.house} setup={p.houseSetup} notice={null} fixedTab="kart" mapFloors={["1", "2"]} mapClassName="max-h-[58dvh]" onData={live.push} refreshKey={live.version} />
        </Card>

        {/* Status fra enhetene til høyre. */}
        <div className="flex min-h-0 flex-col gap-3">
          {live.data.ok && (
            <Card title="Huset nå" className="overflow-hidden lg:flex-1">
              <HouseStatusList live={live} base="/dashboard?vis=" />
            </Card>
          )}
          {energy.price !== null && (
            <Card title="Strøm" href={viewHref("strom")} className="shrink-0" aside={<span className="text-xs tabular-nums text-ink-light">i dag {kr(energy.todayCost, 0)}</span>}>
              <PriceChart hours={prices.hours} now={prices.now} compact />
            </Card>
          )}
        </div>
      </main>

      <HouseAgent ask={askDashboard} onChanged={live.refresh} placeholder="Spør om huset eller familien, f.eks. «hvem henter Olav i dag?» eller «skru av lyset i stua»" />
    </div>
  );
}
