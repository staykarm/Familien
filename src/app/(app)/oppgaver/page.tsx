import { listTasks } from "@/actions/tasks";
import { TaskBoard } from "@/components/tasks/TaskBoard";
import { loadFamilyUi } from "@/lib/familyUi";
import { requireFamily } from "@/lib/session";

export const metadata = { title: "Oppgaver – Familien" };

export default async function TasksPage() {
  const session = await requireFamily();
  const [{ members, categories }, tasks] = await Promise.all([loadFamilyUi(session), listTasks()]);

  return (
    <TaskBoard
      initialTasks={tasks}
      members={members}
      categories={categories.task}
      activeMemberId={session.activeMember?.id ?? null}
    />
  );
}
