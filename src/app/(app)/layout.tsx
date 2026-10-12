import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { signAvatarUrls } from "@/lib/avatars";
import { requireFamily } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireFamily();
  const me = session.activeMember;
  const urls = me ? await signAvatarUrls(await createClient(), [me.avatar_path]) : {};

  const meLink = (
    <Link href="/hvem-er-jeg" className="flex min-h-12 items-center" aria-label="Bytt person">
      {me ? (
        <Avatar name={me.name} color={me.color} icon={me.icon} url={me.avatar_path ? urls[me.avatar_path] : null} size={40} />
      ) : (
        <span className="rounded-full bg-primary-soft px-3 py-2 text-sm font-bold text-primary-dark">Hvem er du?</span>
      )}
    </Link>
  );

  return <AppShell me={meLink}>{children}</AppShell>;
}
