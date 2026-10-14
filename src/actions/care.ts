"use server";

import { hasPlan, shortTime, type CarePlanDay } from "@/lib/care/plan";
import { requireFamily } from "@/lib/session";
import { getDb } from "@/lib/supabase/db";
import { carePlanSchema, type CarePlanInput } from "@/lib/validation/care";

export interface CareResult {
  ok: boolean;
  message?: string;
}

/** Alle planer for levering og henting. Tom liste hvis tabellen mangler (migrasjonen er ikke kjørt ennå). */
export async function listCarePlans(): Promise<CarePlanDay[]> {
  await requireFamily();
  const db = await getDb();
  const { data, error } = await db.from("care_plans").select("member_id, weekday, drop_by, drop_time, pick_by, pick_time");
  if (error) return [];
  return (data ?? []).map((r) => ({
    memberId: r.member_id,
    weekday: r.weekday,
    dropBy: r.drop_by,
    dropTime: shortTime(r.drop_time),
    pickBy: r.pick_by,
    pickTime: shortTime(r.pick_time),
  }));
}

/** Lagrer hele uka for ett barn. Dager uten innhold fjernes. */
export async function saveCarePlan(input: CarePlanInput): Promise<CareResult> {
  const session = await requireFamily();
  const parsed = carePlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { memberId, days } = parsed.data;
  const ids = new Set(session.members.map((m) => m.id));
  if (!ids.has(memberId) || days.some((d) => (d.dropBy && !ids.has(d.dropBy)) || (d.pickBy && !ids.has(d.pickBy)))) {
    return { ok: false, message: "Ukjent person" };
  }

  const db = await getDb();
  const filled = days.filter(hasPlan);
  const empty = days.filter((d) => !hasPlan(d)).map((d) => d.weekday);
  if (filled.length) {
    const { error } = await db.from("care_plans").upsert(
      filled.map((d) => ({
        member_id: memberId,
        weekday: d.weekday,
        drop_by: d.dropBy,
        drop_time: d.dropTime,
        pick_by: d.pickBy,
        pick_time: d.pickTime,
      }))
    );
    if (error) return { ok: false, message: "Kunne ikke lagre planen" };
  }
  if (empty.length) {
    const { error } = await db.from("care_plans").delete().eq("member_id", memberId).in("weekday", empty);
    if (error) return { ok: false, message: "Kunne ikke lagre planen" };
  }
  return { ok: true };
}
