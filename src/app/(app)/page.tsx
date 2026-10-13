import { CalendarApp } from "@/components/calendar/CalendarApp";
import { signAvatarUrls } from "@/lib/avatars";
import type { CalendarCategory, CalendarMember } from "@/lib/calendar/types";
import { requireFamily } from "@/lib/session";
import { getDb } from "@/lib/supabase/db";
import { formatLongDate, greeting } from "@/lib/time";

export default async function CalendarPage() {
  const session = await requireFamily();
  const db = await getDb();
  const [urls, { data: categories }] = await Promise.all([
    signAvatarUrls(db, session.members.map((m) => m.avatar_path)),
    db.from("categories").select("id, name, icon, color").eq("scope", "event").order("sort_order"),
  ]);

  const members: CalendarMember[] = session.members.map((m) => ({
    id: m.id,
    name: m.name,
    color: m.color,
    icon: m.icon,
    isShared: m.is_shared,
    avatarUrl: m.avatar_path ? (urls[m.avatar_path] ?? null) : null,
  }));
  const now = new Date();
  const name = session.activeMember?.name;

  return (
    <div className="flex flex-col gap-4">
      <p className="font-semibold text-ink-light">
        <span className="capitalize">{formatLongDate(now)}</span> · {greeting(now)}
        {name ? `, ${name}` : ""}! 👋
      </p>
      <CalendarApp
        members={members}
        categories={(categories ?? []) as CalendarCategory[]}
        activeMemberId={session.activeMember?.id ?? null}
      />
    </div>
  );
}
