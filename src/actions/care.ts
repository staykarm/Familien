"use server";

import { DateTime } from "luxon";
import { shortTime, type CareData, type CareOverride } from "@/lib/care/plan";
import { notifyCareAssigned } from "@/lib/push/notify";
import { requireFamily } from "@/lib/session";
import { getDb } from "@/lib/supabase/db";
import { TIME_ZONE } from "@/lib/time";
import { careOverrideSchema, carePlanSchema, type CareOverrideInput, type CarePlanInput } from "@/lib/validation/care";

export interface CareResult {
  ok: boolean;
  message?: string;
}

const OVERRIDE_COLUMNS = "id, member_id, from_date, to_date, note, drop_override, drop_by, drop_time, pick_override, pick_by, pick_time, created_at";

type OverrideRow = {
  id: string;
  member_id: string;
  from_date: string;
  to_date: string;
  note: string | null;
  drop_override: boolean;
  drop_by: string | null;
  drop_time: string | null;
  pick_override: boolean;
  pick_by: string | null;
  pick_time: string | null;
  created_at: string;
};

function toOverride(r: OverrideRow): CareOverride {
  return {
    id: r.id,
    memberId: r.member_id,
    from: r.from_date,
    to: r.to_date,
    note: r.note,
    drop: r.drop_override ? { by: r.drop_by, time: shortTime(r.drop_time) } : null,
    pick: r.pick_override ? { by: r.pick_by, time: shortTime(r.pick_time) } : null,
    createdAt: r.created_at,
  };
}

/** Ukeplanene og unntakene som ikke er over (fra to måneder tilbake). Tomt hvis tabellene mangler. */
export async function loadCare(): Promise<CareData> {
  await requireFamily();
  const db = await getDb();
  const since = DateTime.now().setZone(TIME_ZONE).minus({ months: 2 }).toISODate()!;
  const [{ data: plans }, { data: overrides }] = await Promise.all([
    db.from("care_plans").select("member_id, weekday, drop_by, drop_time, pick_by, pick_time"),
    db.from("care_overrides").select(OVERRIDE_COLUMNS).gte("to_date", since).order("from_date"),
  ]);
  return {
    plans: (plans ?? []).map((r) => ({
      memberId: r.member_id,
      weekday: r.weekday,
      drop: { by: r.drop_by, time: shortTime(r.drop_time) },
      pick: { by: r.pick_by, time: shortTime(r.pick_time) },
    })),
    overrides: (overrides ?? []).map(toOverride),
  };
}

function knownPeople(ids: Set<string>, ...people: (string | null | undefined)[]) {
  return people.every((p) => !p || ids.has(p));
}

/** Lagrer den faste ukeplanen. Dager uten innhold fjernes. */
export async function saveCarePlan(input: CarePlanInput): Promise<CareResult> {
  const session = await requireFamily();
  const parsed = carePlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { memberId, days } = parsed.data;
  const ids = new Set(session.members.map((m) => m.id));
  if (!knownPeople(ids, memberId, ...days.flatMap((d) => [d.drop.by, d.pick.by]))) return { ok: false, message: "Ukjent person" };

  const db = await getDb();
  const isEmpty = (d: (typeof days)[number]) => !d.drop.by && !d.drop.time && !d.pick.by && !d.pick.time;
  const filled = days.filter((d) => !isEmpty(d));
  const empty = days.filter(isEmpty).map((d) => d.weekday);
  if (filled.length) {
    const { error } = await db.from("care_plans").upsert(
      filled.map((d) => ({
        member_id: memberId,
        weekday: d.weekday,
        drop_by: d.drop.by,
        drop_time: d.drop.time,
        pick_by: d.pick.by,
        pick_time: d.pick.time,
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

/** Nytt eller endret unntak for en periode. Returnerer unntaket slik det ble lagret. */
export async function saveCareOverride(input: CareOverrideInput): Promise<CareResult & { override?: CareOverride }> {
  const session = await requireFamily();
  const parsed = careOverrideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;
  const ids = new Set(session.members.map((m) => m.id));
  if (!knownPeople(ids, v.memberId, v.drop?.by, v.pick?.by)) return { ok: false, message: "Ukjent person" };

  const fields = {
    member_id: v.memberId,
    from_date: v.from,
    to_date: v.to,
    note: v.note || null,
    drop_override: v.drop !== null,
    drop_by: v.drop?.by ?? null,
    drop_time: v.drop?.time ?? null,
    pick_override: v.pick !== null,
    pick_by: v.pick?.by ?? null,
    pick_time: v.pick?.time ?? null,
  };
  const db = await getDb();
  const { data, error } = v.id
    ? await db.from("care_overrides").update(fields).eq("id", v.id).select(OVERRIDE_COLUMNS).single()
    : await db.from("care_overrides").insert(fields).select(OVERRIDE_COLUMNS).single();
  if (error || !data) return { ok: false, message: "Kunne ikke lagre. Er SQL-en for levering og henting kjørt?" };

  const child = session.members.find((m) => m.id === v.memberId)?.name ?? "";
  for (const [part, s] of [["drop", v.drop], ["pick", v.pick]] as const) {
    if (s?.by) notifyCareAssigned({ childName: child, part, from: v.from, to: v.to, time: s.time, by: s.by }, { actor: session.activeMember });
  }
  return { ok: true, message: "Lagret", override: toOverride(data) };
}

/** Sletter et unntak. Returnerer det, så det kan angres. */
export async function deleteCareOverride(id: string): Promise<CareResult & { deleted?: CareOverride }> {
  await requireFamily();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Ugyldig unntak" };
  const db = await getDb();
  const { data } = await db.from("care_overrides").select(OVERRIDE_COLUMNS).eq("id", id).maybeSingle();
  const { error } = await db.from("care_overrides").delete().eq("id", id);
  if (error) return { ok: false, message: "Kunne ikke slette" };
  return { ok: true, message: "Unntaket er slettet", deleted: data ? toOverride(data) : undefined };
}

/** «Angre» etter sletting: legger unntaket tilbake med samme id og tidspunkt. */
export async function restoreCareOverride(o: CareOverride): Promise<CareResult> {
  await requireFamily();
  const parsed = careOverrideSchema.safeParse({ ...o, id: o.id });
  if (!parsed.success || !o.id) return { ok: false, message: "Kunne ikke angre" };
  const db = await getDb();
  const { error } = await db.from("care_overrides").insert({
    id: o.id,
    member_id: o.memberId,
    from_date: o.from,
    to_date: o.to,
    note: o.note,
    drop_override: o.drop !== null,
    drop_by: o.drop?.by ?? null,
    drop_time: o.drop?.time ?? null,
    pick_override: o.pick !== null,
    pick_by: o.pick?.by ?? null,
    pick_time: o.pick?.time ?? null,
    created_at: o.createdAt,
  });
  return error ? { ok: false, message: "Kunne ikke angre" } : { ok: true, message: "Unntaket er tilbake" };
}
