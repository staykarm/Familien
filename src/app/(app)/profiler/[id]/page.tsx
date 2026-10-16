import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Backpack, ChevronRight } from "lucide-react";
import { loadCare } from "@/actions/care";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { buttonGhost, card } from "@/components/ui/styles";
import { signAvatarUrls } from "@/lib/avatars";
import { requireFamily } from "@/lib/session";
import { getDb } from "@/lib/supabase/db";
import { parseDetails } from "@/lib/validation/profile";

export default async function ProfilePage({ params }: PageProps<"/profiler/[id]">) {
  const { id } = await params;
  const session = await requireFamily();
  const member = session.members.find((m) => m.id === id);
  if (!member) notFound();
  const [urls, care] = await Promise.all([
    signAvatarUrls(await getDb(), [member.avatar_path]),
    member.is_shared ? Promise.resolve({ entries: [] }) : loadCare(),
  ]);
  const hasCare = care.entries.some((e) => e.memberId === member.id);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/profiler" className={`${buttonGhost} self-start`}>
        <ArrowLeft size={20} aria-hidden /> Familien
      </Link>
      <ProfileForm
        member={{
          id: member.id,
          name: member.name,
          color: member.color,
          icon: member.icon,
          isShared: member.is_shared,
          details: parseDetails(member.details),
        }}
        avatarUrl={member.avatar_path ? urls[member.avatar_path] : null}
      />
      {hasCare && (
        <Link href={`/henting?barn=${member.id}`} className={`${card} flex min-h-12 items-center gap-3 font-bold`}>
          <Backpack size={22} aria-hidden className="text-primary-dark" />
          <span className="flex-1">Levering og henting for {member.name}</span>
          <ChevronRight size={20} aria-hidden className="text-ink-light" />
        </Link>
      )}
    </div>
  );
}
