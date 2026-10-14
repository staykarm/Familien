import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { card } from "@/components/ui/styles";
import { signAvatarUrls } from "@/lib/avatars";
import { requireFamily } from "@/lib/session";
import { getDb } from "@/lib/supabase/db";
import { parseDetails } from "@/lib/validation/profile";

export const metadata = { title: "Familien" };

export default async function ProfilesPage() {
  const session = await requireFamily();
  const urls = await signAvatarUrls(await getDb(), session.members.map((m) => m.avatar_path));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold sm:text-3xl lg:text-4xl">Familien</h1>
      <ul className="grid gap-4 sm:grid-cols-2">
        {session.members.map((m) => {
          const filled = parseDetails(m.details).filter((d) => d.value);
          return (
            <li key={m.id}>
              <Link
                href={`/profiler/${m.id}`}
                className={`${card} flex items-center gap-4 border-l-8 transition hover:-translate-y-0.5`}
                style={{ borderLeftColor: m.color }}
              >
                <Avatar name={m.name} color={m.color} icon={m.icon} url={m.avatar_path ? urls[m.avatar_path] : null} size={72} />
                <div className="min-w-0">
                  <h2 className="font-display text-xl font-bold sm:text-2xl">{m.name}</h2>
                  <p className="wrap-break-word text-ink-light">
                    {filled.length > 0 ? filled.map((d) => d.value).join(" · ") : "Trykk for å legge til detaljer"}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
