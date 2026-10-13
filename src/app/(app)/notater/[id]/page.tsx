import { notFound } from "next/navigation";
import { getNote, listNotes } from "@/actions/notes";
import { NotesApp } from "@/components/notes/NotesApp";
import { loadFamilyUi } from "@/lib/familyUi";
import { requireFamily } from "@/lib/session";

export const metadata = { title: "Notat – Familien" };

export default async function NotePage({ params }: PageProps<"/notater/[id]">) {
  const { id } = await params;
  const session = await requireFamily();
  const [{ members }, notes, note] = await Promise.all([loadFamilyUi(session), listNotes(), getNote(id)]);
  if (!note) notFound();
  // key: nytt notat = ny editor og ny tilstand.
  return (
    <NotesApp key={id} initialNotes={notes} members={members} activeMemberId={session.activeMember?.id ?? null} selected={note} />
  );
}
