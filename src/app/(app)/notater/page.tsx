import { listNotes } from "@/actions/notes";
import { NotesApp } from "@/components/notes/NotesApp";
import { loadFamilyUi } from "@/lib/familyUi";
import { requireFamily } from "@/lib/session";

export const metadata = { title: "Notater – Familien" };

export default async function NotesPage() {
  const session = await requireFamily();
  const [{ members }, notes] = await Promise.all([loadFamilyUi(session), listNotes()]);
  return <NotesApp initialNotes={notes} members={members} activeMemberId={session.activeMember?.id ?? null} selected={null} />;
}
