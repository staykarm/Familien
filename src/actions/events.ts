"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { pushEvent } from "@/lib/outlook/sync";
import { broadcastChange } from "@/lib/realtime";
import { CALENDAR_TOPIC } from "@/lib/realtimeTopics";
import { requireFamily } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDb } from "@/lib/supabase/db";
import { z } from "zod";
import { eventFormSchema, moveEventSchema, rangeSchema, type EventFormInput, type EventToSave } from "@/lib/validation/event";
import type { CalendarEvent } from "@/lib/calendar/types";
import { occurrenceRange, sameRule, type RecurrenceRule } from "@/lib/calendar/recurrence";
import { utcToOsloParts } from "@/lib/calendar/dates";

export interface EventResult {
  ok: boolean;
  message?: string;
  id?: string;
  /** Slettede aktiviteter som kan hentes tilbake med restoreEvents («Angre»). */
  undoIds?: string[];
}

/** Hvor lenge en sletting kan angres før den gjøres endelig (og sendes til Outlook). Litt lenger enn «Angre» vises. */
const UNDO_GRACE_MS = 12_000;

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
    .select("id, title, start_at, end_at, all_day, location, notes, category_id, sync_status, sync_error, origin, outlook_conflict, series_id")
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
  const seriesIds = [...new Set(events.map((e) => e.series_id).filter((id): id is string => !!id))];
  const rules = new Map<string, RecurrenceRule>();
  if (seriesIds.length) {
    const { data: series } = await db.from("event_series").select("id, freq, interval, weekdays, until").in("id", seriesIds);
    for (const s of series ?? []) rules.set(s.id, { freq: s.freq, interval: s.interval, weekdays: s.weekdays, until: s.until });
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
    seriesId: e.series_id,
    recurrence: e.series_id ? (rules.get(e.series_id) ?? null) : null,
  }));
}

/** Etter en endring: send til Outlook i bakgrunnen (hvis koblet til) og be andre skjermer hente på nytt. */
function afterChange(ids: string | string[]) {
  const list = Array.isArray(ids) ? ids : [ids];
  after(async () => {
    for (const id of list) await pushEvent(id);
    await broadcastChange(CALENDAR_TOPIC);
  });
}

type Db = Awaited<ReturnType<typeof getDb>>;

/** Aktiviteter i serien som venter på å bli sendt til Outlook (nye, endrede og slettede). */
async function seriesToPush(db: Db, seriesId: string): Promise<string[]> {
  const { data } = await db.from("events").select("id").eq("series_id", seriesId).in("sync_status", ["local", "pending"]);
  return (data ?? []).map((r) => r.id);
}

/** Fjerner aktiviteter: de som finnes i Outlook slettes mykt, så synken får fjernet dem der. Returnerer id-ene som må sendes. */
async function removeEvents(db: Db, rows: { id: string; outlook_id: string | null }[]): Promise<string[]> {
  const soft = rows.filter((r) => r.outlook_id).map((r) => r.id);
  const hard = rows.filter((r) => !r.outlook_id).map((r) => r.id);
  if (soft.length) await db.from("events").update({ deleted_at: new Date().toISOString(), sync_status: "pending" }).in("id", soft);
  if (hard.length) await db.from("events").delete().in("id", hard);
  return soft;
}

async function saveOne(db: Db, id: string | null, v: Pick<EventToSave, "title" | "location" | "notes" | "categoryId" | "participantIds" | "allDay">, range: { start: string; end: string }) {
  return db.rpc("save_event", {
    p_id: id,
    p_title: v.title,
    p_start_at: range.start,
    p_end_at: range.end,
    p_all_day: v.allDay,
    p_location: v.location,
    p_notes: v.notes,
    p_category_id: v.categoryId,
    p_participants: v.participantIds,
  });
}

/** Lager en ny serie, eller fornyer serien fra og med en dato. */
async function saveSeries(db: Db, v: EventToSave & { recurrence: RecurrenceRule }, opts: { seriesId: string | null; replaceFrom: string | null; replaceEvent: string | null }) {
  const occ = v.occurrences ?? [];
  return db.rpc("save_event_series", {
    p_series_id: opts.seriesId,
    p_freq: v.recurrence.freq,
    p_interval: v.recurrence.interval,
    p_weekdays: v.recurrence.weekdays,
    p_until: v.recurrence.until,
    p_replace_from: opts.replaceFrom,
    p_replace_event: opts.replaceEvent,
    p_title: v.title,
    p_starts: occ.map((o) => o.start),
    p_ends: occ.map((o) => o.end),
    p_all_day: v.allDay,
    p_location: v.location,
    p_notes: v.notes,
    p_category_id: v.categoryId,
    p_participants: v.participantIds,
  });
}

const count = (n: number) => (n === 1 ? "1 aktivitet" : `${n} aktiviteter`);

export async function saveEvent(input: EventFormInput): Promise<EventResult> {
  await requireFamily();
  const parsed = eventFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;
  const db = await getDb();
  const fail = (message = "Kunne ikke lagre aktiviteten"): EventResult => ({ ok: false, message });
  const done = (message: string, id?: string, push: string[] = id ? [id] : []): EventResult => {
    afterChange(push);
    revalidatePath("/");
    return { ok: true, message, id };
  };

  const existing = v.id
    ? (await db.from("events").select("id, start_at, series_id, outlook_id").eq("id", v.id).is("deleted_at", null).maybeSingle()).data
    : null;
  if (v.id && !existing) return fail("Fant ikke aktiviteten");

  // Ny serie, eller en enkelt aktivitet som gjøres om til en serie.
  if (v.recurrence && !existing?.series_id) {
    const { data: seriesId, error } = await saveSeries(db, { ...v, recurrence: v.recurrence }, { seriesId: null, replaceFrom: null, replaceEvent: existing?.id ?? null });
    if (error || !seriesId) return fail();
    const push = await seriesToPush(db, seriesId);
    if (existing?.outlook_id) push.push(existing.id);
    return done(`${count(v.occurrences!.length)} lagt inn`, undefined, push);
  }

  // Enkelt aktivitet, eller bare denne ene i en serie.
  if (!existing?.series_id || v.scope === "one") {
    const { data, error } = await saveOne(db, v.id, v, { start: v.start, end: v.end });
    if (error) return fail();
    return done(v.id ? "Endringene er lagret" : "Aktiviteten er lagt til", data);
  }

  // Denne og alle senere i serien.
  const seriesId = existing.series_id;
  const { data: series } = await db.from("event_series").select("freq, interval, weekdays, until").eq("id", seriesId).maybeSingle();
  const { data: following } = await db
    .from("events")
    .select("id, start_at, all_day, outlook_id")
    .eq("series_id", seriesId)
    .is("deleted_at", null)
    .gte("start_at", existing.start_at)
    .order("start_at");
  const later = (following ?? []).filter((r) => r.id !== existing.id);

  if (!v.recurrence) {
    // Gjentakelsen skrus av: denne blir en vanlig aktivitet, og de senere fjernes.
    const removed = await removeEvents(db, later);
    const { error } = await saveOne(db, existing.id, v, { start: v.start, end: v.end });
    if (error) return fail();
    await db.from("events").update({ series_id: null }).eq("id", existing.id);
    return done(later.length ? `Lagret, og ${count(later.length)} etter denne er fjernet` : "Endringene er lagret", existing.id, [existing.id, ...removed]);
  }

  const sameDate = utcToOsloParts(existing.start_at).date === v.date;
  if (series && sameRule(series, v.recurrence) && sameDate) {
    // Samme datoer: oppdater hver forekomst på sin egen dato, så id-ene (og Outlook-hendelsene) beholdes.
    for (const row of following ?? []) {
      const range = occurrenceRange(utcToOsloParts(row.start_at).date, v.timing);
      if (!range) continue;
      const { error } = await saveOne(db, row.id, v, range);
      if (error) return fail();
    }
    return done(`${count((following ?? []).length)} er oppdatert`, existing.id, (following ?? []).map((r) => r.id));
  }

  // Ny regel eller ny dato: lag forekomstene på nytt fra denne datoen.
  const { error } = await saveSeries(db, { ...v, recurrence: v.recurrence }, { seriesId, replaceFrom: existing.start_at, replaceEvent: null });
  if (error) return fail();
  return done(`Gjentakelsen er endret – ${count(v.occurrences!.length)} fra denne datoen`, undefined, await seriesToPush(db, seriesId));
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

export async function deleteEvent(id: string, scope: "one" | "following" | "all" = "one"): Promise<EventResult> {
  await requireFamily();
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["one", "following", "all"].includes(scope)) return { ok: false, message: "Ugyldig aktivitet" };

  const db = await getDb();
  const { data: existing } = await db.from("events").select("id, outlook_id, series_id, start_at").eq("id", id).maybeSingle();
  if (!existing) return { ok: false, message: "Fant ikke aktiviteten" };

  let rows: { id: string; outlook_id: string | null }[] = [existing];
  if (existing.series_id && scope !== "one") {
    let q = db.from("events").select("id, outlook_id").eq("series_id", existing.series_id).is("deleted_at", null);
    if (scope === "following") q = q.gte("start_at", existing.start_at);
    const { data, error } = await q;
    if (error) return { ok: false, message: "Kunne ikke slette aktiviteten" };
    rows = data ?? [];
  }

  // Myk sletting først, så det kan angres. Etter fristen slettes de for godt (og i Outlook), se finalizeDeletes.
  const ids = rows.map((r) => r.id);
  const now = new Date().toISOString();
  // De som er i Outlook merkes «venter», så synken uansett fjerner dem der etter fristen (også om finalizeDeletes ikke rekker det).
  const inOutlook = rows.filter((r) => r.outlook_id).map((r) => r.id);
  const local = rows.filter((r) => !r.outlook_id).map((r) => r.id);
  const results = await Promise.all([
    inOutlook.length ? db.from("events").update({ deleted_at: now, sync_status: "pending" }).in("id", inOutlook) : null,
    local.length ? db.from("events").update({ deleted_at: now }).in("id", local) : null,
  ]);
  if (results.some((r) => r?.error)) return { ok: false, message: "Kunne ikke slette aktiviteten" };
  finalizeDeletes(ids);
  await broadcastChange(CALENDAR_TOPIC);
  revalidatePath("/");
  return { ok: true, message: rows.length > 1 ? `${count(rows.length)} er slettet` : "Aktiviteten er slettet", undoIds: ids };
}

/**
 * Etter angrefristen: aktiviteter som fortsatt er slettet, fjernes i Outlook (via synken) eller fra databasen.
 * Bruker admin-klienten, siden dette kjører etter at svaret er sendt.
 */
function finalizeDeletes(ids: string[]) {
  after(async () => {
    await new Promise((r) => setTimeout(r, UNDO_GRACE_MS));
    const db = createAdminClient();
    const { data } = await db.from("events").select("id, outlook_id, deleted_at").in("id", ids);
    const still = (data ?? []).filter((r) => r.deleted_at);
    const local = still.filter((r) => !r.outlook_id).map((r) => r.id);
    if (local.length) await db.from("events").delete().in("id", local);
    for (const r of still.filter((x) => x.outlook_id)) await pushEvent(r.id);
  });
}

/** «Angre» etter sletting: henter aktivitetene tilbake. De som allerede var i Outlook, sendes dit på nytt ved behov. */
export async function restoreEvents(ids: string[]): Promise<EventResult> {
  await requireFamily();
  const parsed = z.array(z.uuid()).min(1).max(250).safeParse(ids);
  if (!parsed.success) return { ok: false, message: "Kunne ikke angre" };
  const db = await getDb();
  const { data } = await db
    .from("events")
    .update({ deleted_at: null })
    .in("id", parsed.data)
    .not("deleted_at", "is", null)
    .select("id, outlook_id, sync_status");
  const restored = data ?? [];
  if (!restored.length) return { ok: false, message: "For sent å angre – aktiviteten er allerede slettet" };
  // Har Outlook rukket å slette den, lager synken den på nytt (pushOne finner 404 og oppretter).
  const toPush = restored.filter((r) => !r.outlook_id || r.sync_status !== "synced").map((r) => r.id);
  afterChange(toPush);
  revalidatePath("/");
  return { ok: true, message: restored.length > 1 ? `${count(restored.length)} er tilbake` : "Aktiviteten er tilbake" };
}
