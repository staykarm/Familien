import { listCarePlans } from "@/actions/care";
import { CalendarApp } from "@/components/calendar/CalendarApp";
import { loadFamilyUi } from "@/lib/familyUi";
import { requireFamily } from "@/lib/session";

export default async function CalendarPage() {
  const session = await requireFamily();
  const [{ members, categories }, carePlans] = await Promise.all([loadFamilyUi(session), listCarePlans()]);

  return (
    <CalendarApp
      members={members}
      categories={categories.event}
      taskCategories={categories.task}
      activeMemberId={session.activeMember?.id ?? null}
      carePlans={carePlans}
    />
  );
}
