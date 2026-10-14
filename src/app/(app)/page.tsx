import { CalendarApp } from "@/components/calendar/CalendarApp";
import { loadFamilyUi } from "@/lib/familyUi";
import { requireFamily } from "@/lib/session";

export default async function CalendarPage() {
  const session = await requireFamily();
  const { members, categories } = await loadFamilyUi(session);

  return (
    <CalendarApp
      members={members}
      categories={categories.event}
      taskCategories={categories.task}
      activeMemberId={session.activeMember?.id ?? null}
    />
  );
}
