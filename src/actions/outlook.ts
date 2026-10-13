"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { outlookConfigured } from "@/lib/outlook/auth";
import { graphFor, loadConnection, syncLog, updateConnection } from "@/lib/outlook/connection";
import type { OutlookConflict } from "@/lib/outlook/sync";
import { deleteSubscription, ensureOutlookCategories, ensureSubscription, pushEvent, syncAll } from "@/lib/outlook/sync";
import { broadcastChange } from "@/lib/realtime";
import { CALENDAR_TOPIC } from "@/lib/realtimeTopics";
import { requireFamily } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDb } from "@/lib/supabase/db";

export interface OutlookResult {
  ok: boolean;
  message?: string;
}

export interface OutlookStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  calendarId: string | null;
  calendarName: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  subscriptionActive: boolean;
  counts: { waiting: number; conflicts: number; errors: number };
  log: { id: number; createdAt: string; direction: "in" | "out" | "system"; ok: boolean; message: string }[];
}

export async function getOutlookStatus(): Promise<OutlookStatus> {
  await requireFamily();
  const conn = await loadConnection();
  const db = await getDb();
  const [waiting, conflicts, errors, log] = await Promise.all([
    db.from("events").select("id", { count: "exact", head: true }).in("sync_status", ["local", "pending"]),
    db.from("events").select("id", { count: "exact", head: true }).eq("sync_status", "conflict"),
    db.from("events").select("id", { count: "exact", head: true }).eq("sync_status", "error"),
    db.from("sync_log").select("id, created_at, direction, ok, message").order("created_at", { ascending: false }).limit(8),
  ]);
  return {
    configured: outlookConfigured(),
    connected: !!conn,
    email: conn?.account_email ?? null,
    calendarId: conn?.calendar_id ?? null,
    calendarName: conn?.calendar_name ?? null,
    lastSyncAt: conn?.last_sync_at ?? null,
    lastError: conn?.last_error ?? null,
    subscriptionActive: !!conn?.subscription_expires_at && new Date(conn.subscription_expires_at) > new Date(),
    counts: { waiting: conn?.calendar_id ? (waiting.count ?? 0) : 0, conflicts: conflicts.count ?? 0, errors: errors.count ?? 0 },
    log: (log.data ?? []).map((l) => ({ id: l.id, createdAt: l.created_at, direction: l.direction, ok: l.ok, message: l.message })),
  };
}

export interface OutlookCalendar {
  id: string;
  name: string;
  canEdit: boolean;
  owner: string | null;
  isDefault: boolean;
}

export async function listOutlookCalendars(): Promise<{ ok: boolean; message?: string; calendars: OutlookCalendar[] }> {
  await requireFamily();
  const conn = await loadConnection();
  if (!conn) return { ok: false, message: "Koble til Outlook først.", calendars: [] };
  try {
    const res = await graphFor(conn).json<{
      value: { id: string; name: string; canEdit?: boolean; isDefaultCalendar?: boolean; owner?: { address?: string } }[];
    }>("/me/calendars?$select=id,name,canEdit,isDefaultCalendar,owner&$top=100");
    return {
      ok: true,
      calendars: res.value.map((c) => ({
        id: c.id,
        name: c.name,
        canEdit: c.canEdit !== false,
        owner: c.owner?.address ?? null,
        isDefault: !!c.isDefaultCalendar,
      })),
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Kunne ikke hente kalenderne", calendars: [] };
  }
}

const chooseSchema = z.object({ id: z.string().min(1).max(500), name: z.string().min(1).max(200) });

/** Velger kalenderen som skal synkes, setter opp varsler og starter første synk i bakgrunnen. */
export async function chooseOutlookCalendar(input: z.input<typeof chooseSchema>): Promise<OutlookResult> {
  await requireFamily();
  const parsed = chooseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Velg en kalender" };
  const conn = await loadConnection();
  if (!conn) return { ok: false, message: "Koble til Outlook først." };

  if (conn.calendar_id !== parsed.data.id) {
    if (conn.subscription_id) await deleteSubscription(conn);
    await updateConnection({
      calendar_id: parsed.data.id,
      calendar_name: parsed.data.name,
      delta_link: null,
      delta_window_start: null,
      subscription_id: null,
      subscription_expires_at: null,
      last_error: null,
    });
    await syncLog("system", `Synker med kalenderen «${parsed.data.name}»`);
  }

  after(async () => {
    await ensureOutlookCategories();
    await syncAll();
    await ensureSubscription();
  });
  revalidatePath("/innstillinger");
  return { ok: true, message: "Kalenderen er valgt. Første synk kjører nå – det kan ta et minutt." };
}

export async function syncOutlookNow(): Promise<OutlookResult> {
  await requireFamily();
  const result = await syncAll();
  const subError = await ensureSubscription();
  revalidatePath("/");
  return { ok: result.ok, message: subError && result.ok ? `${result.message}. ${subError}` : result.message };
}

export async function disconnectOutlook(): Promise<OutlookResult> {
  await requireFamily();
  const conn = await loadConnection();
  if (conn) await deleteSubscription(conn);
  const db = createAdminClient();
  await db.from("outlook_connection").delete().eq("id", 1);
  await syncLog("system", "Outlook ble koblet fra");
  revalidatePath("/innstillinger");
  return { ok: true, message: "Koblet fra Outlook. Aktivitetene blir liggende i appen." };
}

const resolveSchema = z.object({ id: z.uuid(), keep: z.enum(["mine", "outlook"]) });

/** Løser en konflikt: behold appens versjon (sendes til Outlook) eller bruk Outlook sin. */
export async function resolveOutlookConflict(input: z.input<typeof resolveSchema>): Promise<OutlookResult> {
  await requireFamily();
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Ugyldig valg" };
  const { id, keep } = parsed.data;

  const db = await getDb();
  const { data: row } = await db.from("events").select("sync_status, outlook_conflict").eq("id", id).maybeSingle();
  if (!row || row.sync_status !== "conflict" || !row.outlook_conflict) return { ok: false, message: "Det er ingen konflikt her lenger." };
  const conflict = row.outlook_conflict as unknown as OutlookConflict;

  if (keep === "mine") {
    // Godta Outlook sin nyeste versjon som utgangspunkt, og skriv vår versjon over den.
    await db
      .from("events")
      .update({ sync_status: "pending", outlook_conflict: null, outlook_change_key: conflict.changeKey })
      .eq("id", id);
    after(() => pushEvent(id));
  } else {
    await db
      .from("events")
      .update({
        title: conflict.title,
        start_at: conflict.start,
        end_at: conflict.end,
        all_day: conflict.allDay,
        location: conflict.location,
        notes: conflict.notes,
        category_id: conflict.categoryId,
        outlook_change_key: conflict.changeKey,
        outlook_conflict: null,
        sync_status: "synced",
        sync_error: null,
      })
      .eq("id", id);
    await db.from("event_participants").delete().eq("event_id", id);
    if (conflict.participantIds.length) {
      await db.from("event_participants").insert(conflict.participantIds.map((member_id) => ({ event_id: id, member_id })));
    }
  }
  await broadcastChange(CALENDAR_TOPIC);
  revalidatePath("/");
  return { ok: true, message: keep === "mine" ? "Din versjon sendes til Outlook" : "Outlook sin versjon er brukt" };
}
