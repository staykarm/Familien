import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { buttonGhost } from "@/components/ui/styles";
import { signAvatarUrls } from "@/lib/avatars";
import { requireFamily } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { parseDetails } from "@/lib/validation/profile";

export default async function ProfilePage({ params }: PageProps<"/profiler/[id]">) {
  const { id } = await params;
  const session = await requireFamily();
  const member = session.members.find((m) => m.id === id);
  if (!member) notFound();
  const urls = await signAvatarUrls(await createClient(), [member.avatar_path]);

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
    </div>
  );
}
