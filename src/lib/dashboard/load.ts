import "server-only";
import { loadCare } from "@/actions/care";
import { listEvents } from "@/actions/events";
import { getShopping } from "@/actions/shopping";
import { listTasks } from "@/actions/tasks";
import { osloDate, osloToday } from "@/lib/calendar/dates";
import type { FamilySession } from "@/lib/session";

/** Så mange dager fram dashboardet viser avtaler (oversikten bruker i dag og i morgen, «Uka» alle). */
export const AGENDA_DAYS = 7;

/** Det dashboardet og «Spør» trenger fra familien: avtaler en uke fram, levering/henting, oppgaver og handlelisten. */
export async function loadFamilyDay(session: FamilySession) {
  const today = osloToday();
  const tomorrow = osloDate(today).plus({ days: 1 }).toISODate()!;
  const [events, care, tasks, shopping] = await Promise.all([
    listEvents({ start: osloDate(today).toUTC().toISO()!, end: osloDate(today).plus({ days: AGENDA_DAYS }).toUTC().toISO()! }),
    loadCare(),
    listTasks(),
    getShopping(),
  ]);
  const names = new Map(session.members.map((m) => [m.id, m.name]));
  return { today, tomorrow, events, care, tasks, shopping: shopping.items, nameOf: (id: string) => names.get(id) ?? "" };
}
