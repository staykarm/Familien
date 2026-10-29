"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { askDashboard } from "@/actions/dashboard";
import { CareLine } from "@/components/care/CareLine";
import { HouseAgent, HouseNowPlaying, HousePage, HouseQuickLights, HouseStatusList, useHouseLive } from "@/components/huset/public";
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
 * Totaloversikten for iPad (liggende): familien til venstre, huset og været i midten, handlelisten og
 * status til høyre, og «Spør» nederst. Hvert kort åpner en underside med mer (`?vis=…`).
 */
export function Dashboard(p: DashboardProps) {
  const router = useRouter();
  const live = useHouseLive(p.house);
  useAutoRefresh();
  const now = p.hours[0];
  const outdoor = live.data.home.outdoorTemp;

  return (
    <div className="flex min-h-dvh flex-col gap-3 p-3 lg:h-dvh lg:overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-1 px-1">
        <Clock />
        {now && (
          <Link href={viewHref("vaer")} className="flex items-center gap-1.5 rounded-lg px-1 hover:bg-card">
            <WeatherIcon code={now.symbolCode} size={26} />
            <span className="text-lg font-semibold tabular-nums">{formatTemp(now.temp)}</span>
            {outdoor !== null && <span className="text-xs text-ink-light">Ute ved huset {outdoor.toLocaleString("nb-NO", { maximumFractionDigits: 1 })}°</span>}
          </Link>
        )}
        <Link href="/i-dag" className="ml-auto text-xs font-medium text-ink-light hover:text-ink">
          Til Familien
        </Link>
      </header>

      <main className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[18rem_minmax(0,1fr)_18rem]">
        <div className="flex min-h-0 flex-col gap-3">
          <Card title="I dag" href={viewHref("dag")} className="overflow-hidden lg:flex-auto">
            <CareLine care={p.care} date={p.today} members={p.members} className="text-xs" />
            <AgendaList items={p.agendaToday} members={p.members} categories={p.categories} max={7} />
          </Card>
          <Card title="I morgen" href={viewHref("dag")} className="overflow-hidden lg:flex-auto">
            <CareLine care={p.care} date={p.tomorrow} members={p.members} className="text-xs" />
            <AgendaList items={p.agendaTomorrow} members={p.members} categories={p.categories} max={4} />
          </Card>
          <Card title="Oppgaver" href={viewHref("oppgaver")} className="overflow-hidden lg:flex-auto">
            <TaskChecklist tasks={p.tasks} members={p.members} today={p.today} max={5} />
          </Card>
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          <Card title="Huset" href={viewHref("kart")} className="lg:flex-1" aside={live.data.ok ? <HouseQuickLights live={live} /> : undefined}>
            {/* Samme kart som i Huset: trykk på et rom åpner det med lys, varme, persienner og musikk. */}
            <HousePage initial={p.house} setup={p.houseSetup} notice={null} fixedTab="kart" mapClassName="max-h-[44dvh]" onData={live.push} refreshKey={live.version} />
          </Card>
          <Card title="Været" href={viewHref("vaer")} className="shrink-0">
            <HoursStrip hours={p.hours} />
            <DaysRow days={p.days} />
          </Card>
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          <Card title="Handleliste" href={viewHref("handleliste")} className="overflow-hidden lg:flex-1">
            <ShoppingChecklist items={p.shopping} max={8} />
          </Card>
          {live.data.ok && (
            <Card title="Huset nå" className="shrink-0">
              <HouseStatusList live={live} onArea={(area) => router.push(viewHref(area))} />
            </Card>
          )}
          {live.data.ok && (
            <Card title="Musikk" href={viewHref("musikk")} className="shrink-0">
              <HouseNowPlaying live={live} />
            </Card>
          )}
        </div>
      </main>

      <HouseAgent ask={askDashboard} onChanged={live.refresh} placeholder="Spør om huset eller familien, f.eks. «hvem henter Olav i dag?» eller «skru av lyset i stua»" />
    </div>
  );
}
