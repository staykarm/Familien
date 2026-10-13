import { chooseActiveMember } from "@/actions/me";
import { Avatar } from "@/components/ui/Avatar";
import { signAvatarUrls } from "@/lib/avatars";
import { requireFamily } from "@/lib/session";
import { getDb } from "@/lib/supabase/db";

export const metadata = { title: "Hvem er du? – Familien" };

export default async function WhoAmIPage() {
  const session = await requireFamily();
  const people = session.members.filter((m) => !m.is_shared);
  const urls = await signAvatarUrls(await getDb(), people.map((m) => m.avatar_path));

  return (
    <div className="flex flex-col items-center gap-8 py-6">
      <h1 className="font-display text-2xl font-bold sm:text-3xl lg:text-4xl">Hvem er du?</h1>
      <form action={chooseActiveMember} className="grid w-full max-w-xl grid-cols-2 gap-4">
        {people.map((m) => (
          <button
            key={m.id}
            name="memberId"
            value={m.id}
            className={`flex flex-col items-center gap-3 rounded-3xl border-4 bg-card p-6 transition active:scale-95 ${
              session.activeMember?.id === m.id ? "" : "border-transparent"
            }`}
            style={{ borderColor: session.activeMember?.id === m.id ? m.color : undefined }}
          >
            <Avatar name={m.name} color={m.color} icon={m.icon} url={m.avatar_path ? urls[m.avatar_path] : null} size={96} />
            <span className="font-display text-xl font-bold sm:text-2xl">{m.name}</span>
          </button>
        ))}
      </form>
    </div>
  );
}
