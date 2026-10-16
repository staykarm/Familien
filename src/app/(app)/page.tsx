import { loadCare } from "@/actions/care";
import { CalendarApp } from "@/components/calendar/CalendarApp";
import { loadFamilyUi } from "@/lib/familyUi";
import { requireFamily } from "@/lib/session";

export default async function CalendarPage() {
  const session = await requireFamily();
  const [{ members, categories }, care] = await Promise.all([loadFamilyUi(session), loadCare()]);

  return (
    <CalendarApp
      members={members}
      categories={categories.event}
      taskCategories={categories.task}
      activeMemberId={session.activeMember?.id ?? null}
      care={care}
    />
  );
}
