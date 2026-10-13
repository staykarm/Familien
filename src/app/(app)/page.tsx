import { CalendarApp } from "@/components/calendar/CalendarApp";
import { loadFamilyUi } from "@/lib/familyUi";
import { requireFamily } from "@/lib/session";
import { formatLongDate, greeting } from "@/lib/time";

export default async function CalendarPage() {
  const session = await requireFamily();
  const { members, categories } = await loadFamilyUi(session);
  const now = new Date();
  const name = session.activeMember?.name;

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <p className="text-sm font-semibold text-ink-light sm:text-base">
        <span className="capitalize">{formatLongDate(now)}</span> · {greeting(now)}
        {name ? `, ${name}` : ""}! 👋
      </p>
      <CalendarApp
        members={members}
        categories={categories.event}
        taskCategories={categories.task}
        activeMemberId={session.activeMember?.id ?? null}
      />
    </div>
  );
}
