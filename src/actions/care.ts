"use server";

import { DateTime } from "luxon";
import { isWeekday, shortTime, type CareData } from "@/lib/care/plan";
import { notifyPickupAssigned } from "@/lib/push/notify";
import { requireFamily } from "@/lib/session";
import { getDb } from "@/lib/supabase/db";
import { TIME_ZONE } from "@/lib/time";
import { careDaySchema, carePlanSchema, type CareDayInput, type CarePlanInput } from "@/lib/validation/care";

export interface CareResult {
  ok: boolean;
  message?: string;
}

/** Ukeplanene og endringene for enkeltdager (fra to måneder tilbake). Tomt hvis tabellene mangler. */
export async function loadCare(): Promise<CareData> {
  await requireFamily();
  const db = await getDb();
  const since = DateTime.now().setZone(TIME_ZONE).minus({ months: 2 }).toISODate()!;
  const [{ data: plans }, { data: days }] = await Promise.all([
    db.from("care_plans").select("member_id, weekday, pick_by, pick_time"),
    db.from("care_days").select("member_id, date, pick_by, pick_time").gte("date", since),
  ]);
  return {
    plans: (plans ?? []).map((r) => ({ memberId: r.member_id, weekday: r.weekday, pickBy: r.pick_by, pickTime: shortTime(r.pick_time) })),
    days: (days ?? []).map((r) => ({ memberId: r.member_id, date: r.date, pickBy: r.pick_by, pickTime: shortTime(r.pick_time) })),
  };
}

function knownPeople(ids: Set<string>, ...people: (string | null)[]) {
  return people.every((p) => !p || ids.has(p));
}

/** Lagrer den faste ukeplanen for henting. Dager uten innhold fjernes. */
export async function saveCarePlan(input: CarePlanInput): Promise<CareResult> {
  const session = await requireFamily();
  const parsed = carePlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { memberId, days } = parsed.data;
  const ids = new Set(session.members.map((m) => m.id));
  if (!knownPeople(ids, memberId, ...days.map((d) => d.pickBy))) return { ok: false, message: "Ukjent person" };

  const db = await getDb();
  const filled = days.filter((d) => d.pickBy || d.pickTime);
  const empty = days.filter((d) => !d.pickBy && !d.pickTime).map((d) => d.weekday);
  if (filled.length) {
    const { error } = await db
      .from("care_plans")
      .upsert(filled.map((d) => ({ member_id: memberId, weekday: d.weekday, pick_by: d.pickBy, pick_time: d.pickTime })));
    if (error) return { ok: false, message: "Kunne ikke lagre planen" };
  }
  if (empty.length) {
    const { error } = await db.from("care_plans").delete().eq("member_id", memberId).in("weekday", empty);
    if (error) return { ok: false, message: "Kunne ikke lagre planen" };
  }
  return { ok: true };
}

/** Endrer hentingen én dato, eller setter den tilbake til ukeplanen. */
export async function saveCareDay(input: CareDayInput): Promise<CareResult> {
  const session = await requireFamily();
  const parsed = careDaySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { memberId, date, reset, pickBy, pickTime } = parsed.data;
  if (!isWeekday(date)) return { ok: false, message: "Henting gjelder bare hverdager" };
  const ids = new Set(session.members.map((m) => m.id));
  if (!knownPeople(ids, memberId, pickBy)) return { ok: false, message: "Ukjent person" };

  const db = await getDb();
  const { error } = reset
    ? await db.from("care_days").delete().eq("member_id", memberId).eq("date", date)
    : await db.from("care_days").upsert({ member_id: memberId, date, pick_by: pickBy, pick_time: pickTime });
  if (error) return { ok: false, message: "Kunne ikke lagre. Er SQL-en for henting kjørt?" };

  if (!reset && pickBy) {
    const child = session.members.find((m) => m.id === memberId);
    notifyPickupAssigned({ childName: child?.name ?? "", date, time: pickTime, by: pickBy }, { actor: session.activeMember });
  }
  return { ok: true };
}
