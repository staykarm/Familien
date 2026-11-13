import "server-only";
import type { Json } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDb } from "@/lib/supabase/db";
import { homeCommandSchema } from "@/lib/validation/huset";
import { executeHomeCommand, type ParsedHomeCommand } from "./execute";
import type { ScheduledItem } from "./schedule";

// Planlagte handlinger (`house_schedule`): «Spør huset» legger dem inn, /api/cron/push utfører dem hvert 5. minutt.
// En brytere slås aldri på herfra (det krever kode); slike handlinger avvises både ved lagring og ved utføring.

const allowed = (cmd: ParsedHomeCommand) => !(cmd.action === "switch" && cmd.on);

export async function addSchedule(runAt: Date, commands: ParsedHomeCommand[], description: string): Promise<ScheduledItem> {
  if (!commands.length || !commands.every(allowed)) throw new Error("Den handlingen kan ikke planlegges");
  const db = await getDb();
  const { data, error } = await db
    .from("house_schedule")
    .insert({ run_at: runAt.toISOString(), commands: commands as unknown as Json, description: description.slice(0, 200) })
    .select("id, run_at, description")
    .single();
  if (error || !data) throw new Error("Kunne ikke lagre planen");
  return { id: data.id, runAt: data.run_at, description: data.description };
}

/** Det som venter, først det som skjer først. Tomt hvis tabellen mangler. */
export async function pendingSchedule(): Promise<ScheduledItem[]> {
  try {
    const db = await getDb();
    const { data } = await db.from("house_schedule").select("id, run_at, description").is("done_at", null).order("run_at").limit(20);
    return (data ?? []).map((r) => ({ id: r.id, runAt: r.run_at, description: r.description }));
  } catch {
    return [];
  }
}

/** Avlyser en plan som ikke er utført ennå. */
export async function cancelSchedule(id: string): Promise<boolean> {
  const db = await getDb();
  const { data } = await db.from("house_schedule").delete().eq("id", id).is("done_at", null).select("id");
  return !!data?.length;
}

/** Utfører det som skal skje nå. Kalles fra cron (uten innlogging), derfor service role. */
export async function runHouseSchedule(now: Date = new Date()): Promise<number> {
  const db = createAdminClient();
  const { data: due } = await db.from("house_schedule").select("id, commands").is("done_at", null).lte("run_at", now.toISOString()).order("run_at").limit(20);
  let done = 0;
  for (const row of due ?? []) {
    // Merk den som tatt først, så to kjøringer samtidig ikke gjør det samme to ganger.
    const { data: claimed } = await db.from("house_schedule").update({ done_at: new Date().toISOString() }).eq("id", row.id).is("done_at", null).select("id");
    if (!claimed?.length) continue;
    const results: string[] = [];
    for (const raw of Array.isArray(row.commands) ? row.commands : []) {
      const parsed = homeCommandSchema.safeParse(raw);
      if (!parsed.success || !allowed(parsed.data)) {
        results.push("ugyldig handling");
        continue;
      }
      try {
        const r = await executeHomeCommand(parsed.data);
        results.push(r.ok ? "ok" : (r.message ?? "feilet"));
      } catch (e) {
        results.push(e instanceof Error ? e.message : "feilet");
      }
    }
    await db.from("house_schedule").update({ result: results.join("; ").slice(0, 500) }).eq("id", row.id);
    done++;
  }
  return done;
}
