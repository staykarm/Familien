"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { pushEvent } from "@/lib/outlook/sync";
import { broadcastChange } from "@/lib/realtime";
import { CALENDAR_TOPIC } from "@/lib/realtimeTopics";
import { requireFamily } from "@/lib/session";
import { getDb } from "@/lib/supabase/db";
import { eventFormSchema, moveEventSchema, rangeSchema, type EventFormInput } from "@/lib/validation/event";
import type { CalendarEvent } from "@/lib/calendar/types";

export interface EventResult {
  ok: boolean;
  message?: string;
  id?: string;
}

function conflictSummary(raw: unknown): CalendarEvent["conflict"] {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as { title?: unknown; start?: unknown; end?: unknown; allDay?: unknown };
  if (typeof c.title !== "string" || typeof c.start !== "string" || typeof c.end !== "string") return null;
  return { title: c.title, start: c.start, end: c.end, allDay: c.allDay === true };
}

/** Aktiviteter som overlapper perioden [start, end). */
export async function listEvents(range: { start: string; end: string }): Promise<CalendarEvent[]> {
  await requireFamily();
  const parsed = rangeSchema.safeParse(range);
  if (!parsed.success) return [];

  const db = await getDb();
  const { data: events, error } = await db
    .from("events")
    .select("id, title, start_at, end_at, all_day, location, notes, category_id, sync_status, sync_error, origin, outlook_conflict")
    .is("deleted_at", null)
    .lt("start_at", parsed.data.end)
    .gt("end_at", parsed.data.start)
    .order("start_at");
  if (error || !events?.length) return [];

  const { data: participants } = await db
    .from("event_participants")
    .select("event_id, member_id")
    .in(
      "event_id",
      events.map((e) => e.id)
    );
  const byEvent = new Map<string, string[]>();
  for (const p of participants ?? []) {
    byEvent.set(p.event_id, [...(byEvent.get(p.event_id) ?? []), p.member_id]);
  }

  return events.map((e) => ({
    id: e.id,
    title: e.title,
    start: e.start_at,
    end: e.end_at,
    allDay: e.all_day,
    location: e.location,
    notes: e.notes,
    categoryId: e.category_id,
    participantIds: byEvent.get(e.id) ?? [],
    syncStatus: e.sync_status,
    origin: e.origin,
    syncError: e.sync_error,
    conflict: conflictSummary(e.outlook_conflict),
  }));
}

/** Etter en endring: send til Outlook i bakgrunnen (hvis koblet til) og be andre skjermer hente på nytt. */
function afterChange(id: string) {
  after(async () => {
    await pushEvent(id);
    await broadcastChange(CALENDAR_TOPIC);
  });
}

export async function saveEvent(input: EventFormInput): Promise<EventResult> {
  await requireFamily();
  const parsed = eventFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;

  const db = await getDb();
  const { data, error } = await db.rpc("save_event", {
    p_id: v.id,
    p_title: v.title,
    p_start_at: v.start,
    p_end_at: v.end,
    p_all_day: v.allDay,
    p_location: v.location,
    p_notes: v.notes,
    p_category_id: v.categoryId,
    p_participants: v.participantIds,
  });
  if (error) return { ok: false, message: "Kunne ikke lagre aktiviteten" };

  afterChange(data);
  revalidatePath("/");
  return { ok: true, message: v.id ? "Endringene er lagret" : "Aktiviteten er lagt til", id: data };
}

export async function moveEvent(input: { id: string; start: string; end: string; allDay: boolean }): Promise<EventResult> {
  await requireFamily();
  const parsed = moveEventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Ugyldig tidspunkt" };
  const { id, start, end, allDay } = parsed.data;

  const db = await getDb();
  const { data: existing } = await db.from("events").select("outlook_id").eq("id", id).maybeSingle();
  if (!existing) return { ok: false, message: "Fant ikke aktiviteten" };
  const { error } = await db
    .from("events")
    .update({
      start_at: start,
      end_at: end,
      all_day: allDay,
      ...(existing.outlook_id ? { sync_status: "pending" as const } : {}),
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { ok: false, message: "Kunne ikke flytte aktiviteten" };
  afterChange(id);
  return { ok: true, message: "Flyttet" };
}

export async function deleteEvent(id: string): Promise<EventResult> {
  await requireFamily();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Ugyldig aktivitet" };

  const db = await getDb();
  const { data: existing } = await db.from("events").select("outlook_id").eq("id", id).maybeSingle();
  if (!existing) return { ok: false, message: "Fant ikke aktiviteten" };

  // Aktiviteter som aldri har vært i Outlook kan slettes helt. Ellers myk sletting, så synken (fase 3) får fjernet den der.
  const { error } = existing.outlook_id
    ? await db.from("events").update({ deleted_at: new Date().toISOString(), sync_status: "pending" }).eq("id", id)
    : await db.from("events").delete().eq("id", id);
  if (error) return { ok: false, message: "Kunne ikke slette aktiviteten" };

  afterChange(id);
  revalidatePath("/");
  return { ok: true, message: "Aktiviteten er slettet" };
}
