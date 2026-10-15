import { DateTime } from "luxon";
import { listCarePlans } from "@/actions/care";
import { listEvents } from "@/actions/events";
import { getShopping } from "@/actions/shopping";
import { listTasks } from "@/actions/tasks";
import { getWeather } from "@/actions/weather";
import { TodayView } from "@/components/today/TodayView";
import { osloDate, osloToday } from "@/lib/calendar/dates";
import { loadFamilyUi } from "@/lib/familyUi";
import { requireFamily } from "@/lib/session";
import { TIME_ZONE } from "@/lib/time";

export const metadata = { title: "I dag – Familien" };

/** «I dag»: det man trenger før man går ut døra – hvem skal hvor, hva må huskes, været og handlelisten. */
export default async function TodayPage() {
  const session = await requireFamily();
  const today = osloToday();
  const tomorrow = osloDate(today).plus({ days: 1 }).toISODate()!;
  const [{ members, categories }, events, tasks, shopping, weather, carePlans] = await Promise.all([
    loadFamilyUi(session),
    listEvents({ start: osloDate(today).toUTC().toISO()!, end: osloDate(today).plus({ days: 2 }).toUTC().toISO()! }),
    listTasks(),
    getShopping(),
    getWeather().catch(() => null),
    listCarePlans(),
  ]);

  return (
    <TodayView
      today={today}
      tomorrow={tomorrow}
      nowHour={DateTime.now().setZone(TIME_ZONE).hour}
      members={members}
      categories={categories.event}
      events={events}
      tasks={tasks.filter((t) => t.status !== "done" && t.dueDate && t.dueDate <= tomorrow)}
      shopping={shopping.items.filter((i) => !i.checked).map((i) => (i.quantity ? `${i.name} (${i.quantity})` : i.name))}
      weather={weather?.forecast ?? null}
      carePlans={carePlans}
    />
  );
}
