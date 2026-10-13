import { listUploads } from "@/actions/files";
import { FilesApp } from "@/components/files/FilesApp";
import { loadFamilyUi } from "@/lib/familyUi";
import { requireFamily } from "@/lib/session";

export const metadata = { title: "Les inn fil – Familien" };

export default async function FilesPage() {
  const session = await requireFamily();
  const [{ members, categories }, uploads] = await Promise.all([loadFamilyUi(session), listUploads()]);
  return (
    <FilesApp initialUploads={uploads} members={members} eventCategories={categories.event} taskCategories={categories.task} />
  );
}
