import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { card } from "@/components/ui/styles";
import { signAvatarUrls } from "@/lib/avatars";
import { requireFamily } from "@/lib/session";
import { getDb } from "@/lib/supabase/db";
import { formatLongDate, greeting } from "@/lib/time";

export default async function HomePage() {
  const session = await requireFamily();
  const now = new Date();
  const urls = await signAvatarUrls(await getDb(), session.members.map((m) => m.avatar_path));
  const name = session.activeMember?.name ?? session.displayName;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <p className="text-lg font-semibold capitalize text-ink-light">{formatLongDate(now)}</p>
        <h1 className="font-display text-4xl font-bold">
          {greeting(now)}
          {name ? `, ${name}` : ""}! 👋
        </h1>
      </section>

      <section className="flex flex-wrap gap-4">
        {session.members.map((m) => (
          <Link key={m.id} href={`/profiler/${m.id}`} className="flex flex-col items-center gap-1">
            <Avatar name={m.name} color={m.color} icon={m.icon} url={m.avatar_path ? urls[m.avatar_path] : null} size={64} />
            <span className="text-sm font-bold">{m.name}</span>
          </Link>
        ))}
      </section>

      <section className={`${card} flex flex-col items-center gap-2 py-12 text-center`}>
        <span className="text-5xl" aria-hidden>
          📅
        </span>
        <h2 className="font-display text-2xl font-bold">Kalenderen kommer snart</h2>
        <p className="text-ink-light">Dag-, uke- og månedsvisning bygges i neste fase.</p>
      </section>
    </div>
  );
}
