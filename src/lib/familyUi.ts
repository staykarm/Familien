import "server-only";
import { signAvatarUrls } from "@/lib/avatars";
import type { CalendarCategory, CalendarMember } from "@/lib/calendar/types";
import type { FamilySession } from "@/lib/session";
import { getDb } from "@/lib/supabase/db";

type Scope = "event" | "task" | "shopping";

/** Medlemmer med signerte avatar-URL-er og kategorier per område – det klientkomponentene trenger. */
export async function loadFamilyUi(
  session: FamilySession
): Promise<{ members: CalendarMember[]; categories: Record<Scope, CalendarCategory[]> }> {
  const db = await getDb();
  const [urls, { data }] = await Promise.all([
    signAvatarUrls(db, session.members.map((m) => m.avatar_path)),
    db.from("categories").select("id, name, icon, color, scope").order("sort_order"),
  ]);
  const categories: Record<Scope, CalendarCategory[]> = { event: [], task: [], shopping: [] };
  for (const { scope, ...c } of data ?? []) categories[scope].push(c);

  return {
    members: session.members.map((m) => ({
      id: m.id,
      name: m.name,
      color: m.color,
      icon: m.icon,
      isShared: m.is_shared,
      avatarUrl: m.avatar_path ? (urls[m.avatar_path] ?? null) : null,
    })),
    categories,
  };
}
