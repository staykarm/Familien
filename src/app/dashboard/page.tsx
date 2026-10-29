import { getWeather } from "@/actions/weather";
import { CareLine } from "@/components/care/CareLine";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { ShoppingChecklist, TaskChecklist } from "@/components/dashboard/Lists";
import { AgendaList, Card, DaysRow, HoursStrip } from "@/components/dashboard/parts";
import { HousePage, type HouseTab } from "@/components/huset/public";
import { osloDate } from "@/lib/calendar/dates";
import { dayAgenda, nextDays, nextHours, openTasks } from "@/lib/dashboard/day";
import { AGENDA_DAYS, loadFamilyDay } from "@/lib/dashboard/load";
import { isDashboardView } from "@/lib/dashboard/views";
import { loadFamilyUi } from "@/lib/familyUi";
import { loadHouse, loadHouseSetup } from "@/lib/huset/public";
import { requireFamily } from "@/lib/session";

const HOUSE_TABS: HouseTab[] = ["kart", "lys", "varme", "persienner", "roboter", "vanning", "musikk"];

const dayTitle = (date: string, today: string) => {
  const label = osloDate(date).setLocale("nb").toFormat("cccc d. LLLL");
  const diff = osloDate(date).diff(osloDate(today), "days").days;
  return diff === 0 ? `I dag, ${label}` : diff === 1 ? `I morgen, ${label}` : label.charAt(0).toUpperCase() + label.slice(1);
};

/**
 * Dashboardet (/dashboard): totaloversikt for iPad med familien og huset. `?vis=<del>` åpner en underside
 * med mer (uka, været, oppgaver, handlelisten eller en av fanene i Huset); `rom` åpner et rom i kartet.
 */
export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const session = await requireFamily();
  const params = await searchParams;
  const vis = isDashboardView(params.vis) ? params.vis : null;

  if (vis && (HOUSE_TABS as string[]).includes(vis)) {
    const [initial, setup] = await Promise.all([loadHouse(), loadHouseSetup()]);
    const room = typeof params.rom === "string" ? params.rom : null;
    return (
      <DashboardView view={vis}>
        <HousePage initial={initial} setup={setup} notice={null} fixedTab={vis as HouseTab} room={room} />
      </DashboardView>
    );
  }

  const [family, { members, categories }, weather] = await Promise.all([loadFamilyDay(session), loadFamilyUi(session), getWeather().catch(() => null)]);
  const { today, tomorrow, events, care, tasks, shopping, nameOf } = family;
  const forecast = weather?.forecast ?? null;
  const open = openTasks(tasks);

  if (vis === "dag") {
    const days = Array.from({ length: AGENDA_DAYS }, (_, i) => osloDate(today).plus({ days: i }).toISODate()!);
    return (
      <DashboardView view={vis}>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {days.map((d) => (
            <Card key={d} title={dayTitle(d, today)}>
              <CareLine care={care} date={d} members={members} className="text-xs" />
              <AgendaList items={dayAgenda(events, d, nameOf)} members={members} categories={categories.event} />
            </Card>
          ))}
        </div>
      </DashboardView>
    );
  }

  if (vis === "vaer") {
    const hours = nextHours(forecast, new Date(), 48);
    return (
      <DashboardView view={vis}>
        {[0, 16, 32].map((from) => {
          const slice = hours.slice(from, from + 16);
          if (!slice.length) return null;
          return (
            <Card key={from} title={from === 0 ? "De neste 16 timene" : `Om ${from} timer`}>
              <HoursStrip hours={slice} />
            </Card>
          );
        })}
        <Card title="De neste dagene">
          <DaysRow days={nextDays(forecast, today, 5)} />
          <DaysRow days={nextDays(forecast, today, 10).slice(5)} />
        </Card>
        <p className="text-xs text-ink-light">
          Værdata fra{" "}
          <a href="https://www.yr.no" target="_blank" rel="noreferrer" className="underline underline-offset-2">
            Yr
          </a>{" "}
          (Meteorologisk institutt og NRK).
        </p>
      </DashboardView>
    );
  }

  if (vis === "oppgaver") {
    return (
      <DashboardView view={vis}>
        <Card title={`${open.length} åpne oppgaver · åpne i Familien`} href="/oppgaver">
          <TaskChecklist tasks={open} members={members} today={today} />
        </Card>
      </DashboardView>
    );
  }

  if (vis === "handleliste") {
    return (
      <DashboardView view={vis}>
        <Card title={`${shopping.filter((i) => !i.checked).length} varer · åpne i Familien`} href="/handleliste">
          <ShoppingChecklist items={shopping} columns />
        </Card>
      </DashboardView>
    );
  }

  const [house, houseSetup] = await Promise.all([loadHouse(), loadHouseSetup()]);
  return (
    <Dashboard
      today={today}
      tomorrow={tomorrow}
      members={members}
      categories={categories.event}
      agendaToday={dayAgenda(events, today, nameOf)}
      agendaTomorrow={dayAgenda(events, tomorrow, nameOf)}
      care={care}
      tasks={open}
      shopping={shopping}
      hours={nextHours(forecast, new Date(), 16)}
      days={nextDays(forecast, today, 5)}
      house={house}
      houseSetup={houseSetup}
    />
  );
}
