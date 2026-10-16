"use server";

import { DateTime } from "luxon";
import { hasSlot, isWeekday, toCareEntry, type CareData } from "@/lib/care/plan";
import { notifyCareAssigned } from "@/lib/push/notify";
import { requireFamily } from "@/lib/session";
import { getDb } from "@/lib/supabase/db";
import { TIME_ZONE } from "@/lib/time";
import { careEntrySchema, type CareEntryInput } from "@/lib/validation/care";

export interface CareResult {
  ok: boolean;
  message?: string;
}

const COLUMNS = "member_id, date, drop_by, drop_time, pick_by, pick_time";

/** Levering og henting fra to måneder tilbake og framover. Tomt hvis tabellen mangler. */
export async function loadCare(): Promise<CareData> {
  await requireFamily();
  const db = await getDb();
  const since = DateTime.now().setZone(TIME_ZONE).minus({ months: 2 }).toISODate()!;
  const { data } = await db.from("care_entries").select(COLUMNS).gte("date", since).order("date");
  return { entries: (data ?? []).map(toCareEntry) };
}

/** Lagrer hvem som leverer og henter én dag. En tom dag fjernes. */
export async function saveCareEntry(input: CareEntryInput): Promise<CareResult> {
  const session = await requireFamily();
  const parsed = careEntrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { memberId, date, drop, pick } = parsed.data;
  if (!isWeekday(date)) return { ok: false, message: "Levering og henting gjelder bare hverdager" };
  const ids = new Set(session.members.map((m) => m.id));
  if (![memberId, drop.by, pick.by].every((id) => !id || ids.has(id))) return { ok: false, message: "Ukjent person" };

  const db = await getDb();
  const { data: before } = await db.from("care_entries").select(COLUMNS).eq("member_id", memberId).eq("date", date).maybeSingle();
  const { error } =
    hasSlot(drop) || hasSlot(pick)
      ? await db.from("care_entries").upsert({
          member_id: memberId,
          date,
          drop_by: drop.by,
          drop_time: drop.time,
          pick_by: pick.by,
          pick_time: pick.time,
        })
      : await db.from("care_entries").delete().eq("member_id", memberId).eq("date", date);
  if (error) return { ok: false, message: "Kunne ikke lagre. Er SQL-en for levering og henting kjørt?" };

  // Varsel til den som nylig er satt opp (ikke ved hver endring av klokkeslett).
  const child = session.members.find((m) => m.id === memberId)?.name ?? "";
  const previous = before ? toCareEntry(before) : null;
  for (const [part, s] of [["drop", drop], ["pick", pick]] as const) {
    if (s.by && s.by !== previous?.[part].by) {
      notifyCareAssigned({ childName: child, part, date, time: s.time, by: s.by }, { actor: session.activeMember });
    }
  }
  return { ok: true };
}
