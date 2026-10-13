import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { signAvatarUrls } from "@/lib/avatars";
import { requireFamily } from "@/lib/session";
import { getDb } from "@/lib/supabase/db";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireFamily();
  const me = session.activeMember;
  const urls = me ? await signAvatarUrls(await getDb(), [me.avatar_path]) : {};

  const meLink = (
    <Link href="/hvem-er-jeg" className="flex min-h-11 items-center" aria-label="Bytt person">
      {me ? (
        <Avatar name={me.name} color={me.color} icon={me.icon} url={me.avatar_path ? urls[me.avatar_path] : null} size={36} />
      ) : (
        <span
          className="flex h-9 min-w-9 items-center justify-center rounded-full bg-primary-soft px-2 text-sm font-bold text-primary-dark"
          title="Hvem er du?"
        >
          {/* Smal ikonmeny på nettbrett har bare plass til «?» */}
          <span className="hidden md:inline lg:hidden">?</span>
          <span className="whitespace-nowrap md:hidden lg:inline">Hvem er du?</span>
        </span>
      )}
    </Link>
  );

  return <AppShell me={meLink}>{children}</AppShell>;
}
