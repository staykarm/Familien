import "server-only";
import type { getDb } from "@/lib/supabase/db";
import { correctionLines, habitLines, type Decision, type TaggedItem } from "./learning";

type Db = Awaited<ReturnType<typeof getDb>>;

/** Hvor langt tilbake vi ser etter vaner i kalenderen. */
const HABIT_DAYS = 180;

/**
 * Henter det tolkningen skal lære av: vaner fra kalenderen og rettelser på tidligere forslag.
 * Feiler noe, returneres tomme lister – tolkningen skal virke uansett.
 */
export async function loadLearning(
  db: Db,
  members: { id: string; name: string; is_shared: boolean }[]
): Promise<{ habits: string[]; corrections: string[] }> {
  try {
    const nameOf = new Map(members.map((m) => [m.id, m.name]));
    const felles = members.find((m) => m.is_shared)?.name;
    const since = new Date(Date.now() - HABIT_DAYS * 86_400_000).toISOString();

    const [{ data: events }, { data: parts }, { data: cats }, { data: decided }] = await Promise.all([
      db.from("events").select("id, title, category_id").is("deleted_at", null).gte("start_at", since).limit(2000),
      db.from("event_participants").select("event_id, member_id").limit(10000),
      db.from("categories").select("id, name"),
      db
        .from("suggestions")
        .select("kind, payload, status, created_ref")
        .in("status", ["approved", "rejected"])
        .in("kind", ["event", "task"])
        .order("decided_at", { ascending: false })
        .limit(80),
    ]);

    const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));
    const peopleOf = new Map<string, string[]>();
    for (const p of parts ?? []) {
      const name = nameOf.get(p.member_id);
      if (name) peopleOf.set(p.event_id, [...(peopleOf.get(p.event_id) ?? []), name]);
    }
    const eventItem = (e: { id: string; title: string; category_id: string | null }): TaggedItem => ({
      title: e.title,
      people: peopleOf.get(e.id) ?? [],
      category: e.category_id ? (catName.get(e.category_id) ?? null) : null,
    });

    const habits = habitLines((events ?? []).map(eventItem));

    // Rettelser: sammenlign forslaget med det som faktisk ble lagret.
    const refs = (decided ?? []).map((d) => d.created_ref).filter((r): r is string => !!r);
    const [{ data: savedEvents }, { data: savedTasks }] = await Promise.all([
      refs.length ? db.from("events").select("id, title, category_id").in("id", refs) : Promise.resolve({ data: [] }),
      refs.length ? db.from("tasks").select("id, title, assignee_id").in("id", refs) : Promise.resolve({ data: [] }),
    ]);
    const eventsById = new Map((savedEvents ?? []).map((e) => [e.id, eventItem(e)]));
    const tasksById = new Map(
      (savedTasks ?? []).map((t) => [
        t.id,
        { title: t.title, people: t.assignee_id && nameOf.get(t.assignee_id) ? [nameOf.get(t.assignee_id)!] : [], category: null },
      ])
    );

    const decisions: Decision[] = (decided ?? []).flatMap((d): Decision[] => {
      const p = (d.payload ?? {}) as { title?: string; participants?: string[]; category?: string | null; assignee?: string | null };
      if (!p.title || (d.status !== "approved" && d.status !== "rejected")) return [];
      if (d.kind === "event") {
        const people = p.participants?.length ? p.participants : felles ? [felles] : [];
        return [
          {
            kind: "event",
            status: d.status,
            suggested: { title: p.title, people, category: p.category ?? null },
            saved: d.created_ref ? eventsById.get(d.created_ref) : null,
          },
        ];
      }
      if (d.kind === "task") {
        return [
          {
            kind: "task",
            status: d.status,
            suggested: { title: p.title, people: p.assignee ? [p.assignee] : [], category: null },
            saved: d.created_ref ? tasksById.get(d.created_ref) : null,
          },
        ];
      }
      return [];
    });

    return { habits, corrections: correctionLines(decisions) };
  } catch (err) {
    console.warn("Kunne ikke hente læring til tolkningen", err);
    return { habits: [], corrections: [] };
  }
}
