import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { listCarePlans } from "@/actions/care";
import { CarePlanEditor } from "@/components/care/CarePlanEditor";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { buttonGhost } from "@/components/ui/styles";
import { signAvatarUrls } from "@/lib/avatars";
import { requireFamily } from "@/lib/session";
import { getDb } from "@/lib/supabase/db";
import { parseDetails } from "@/lib/validation/profile";

export default async function ProfilePage({ params }: PageProps<"/profiler/[id]">) {
  const { id } = await params;
  const session = await requireFamily();
  const member = session.members.find((m) => m.id === id);
  if (!member) notFound();
  const others = session.members.filter((m) => !m.is_shared && m.id !== member.id);
  const [urls, plans] = await Promise.all([
    signAvatarUrls(await getDb(), [member.avatar_path, ...others.map((m) => m.avatar_path)]),
    member.is_shared ? Promise.resolve([]) : listCarePlans(),
  ]);

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
      {!member.is_shared && (
        <CarePlanEditor
          memberId={member.id}
          memberName={member.name}
          people={others.map((m) => ({
            id: m.id,
            name: m.name,
            color: m.color,
            icon: m.icon,
            avatarUrl: m.avatar_path ? (urls[m.avatar_path] ?? null) : null,
          }))}
          initial={plans.filter((p) => p.memberId === member.id)}
        />
      )}
    </div>
  );
}
