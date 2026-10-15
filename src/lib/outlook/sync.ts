import "server-only";
import { createHash } from "node:crypto";
import { DateTime } from "luxon";
import type { Json } from "@/lib/database.types";
import { serverEnv } from "@/lib/env";
import { broadcastChange } from "@/lib/realtime";
import { CALENDAR_TOPIC } from "@/lib/realtimeTopics";
import { createAdminClient } from "@/lib/supabase/admin";
import { OutlookAuthError } from "./auth";
import { acquireSyncLock, graphFor, loadConnection, releaseSyncLock, syncLog, updateConnection, type OutlookConnection } from "./connection";
import { GraphError, graphError, type GraphClient } from "./graph";
import { fromGraphEvent, outlookCategoryName, outlookFingerprint, presetForColor, toGraphEvent, type AppEventData, type CategoryRef, type GraphEvent, type MemberRef } from "./mapping";

/** Vinduet vi synker: 3 måneder bakover og 12 fremover. Delta-lenken fornyes etter 30 dager så vinduet flytter seg. */
const WINDOW_PAST_DAYS = 90;
const WINDOW_FUTURE_DAYS = 365;
const DELTA_MAX_AGE_DAYS = 30;
/** Outlook-abonnement på hendelser varer maks 7 døgn. Vi ber om 4 og fornyer daglig. */
const SUBSCRIPTION_MINUTES = 4 * 24 * 60;

const READ_PREFER = 'odata.maxpagesize=100, outlook.timezone="UTC", outlook.body-content-type="text"';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Db = ReturnType<typeof createAdminClient>;

interface Ctx {
  db: Db;
  graph: GraphClient;
  conn: OutlookConnection & { calendar_id: string };
  members: MemberRef[];
  categories: (CategoryRef & { color: string })[];
}

export interface SyncSummary {
  ok: boolean;
  message: string;
  pulled?: number;
  pushed?: number;
}

/** Outlook sin versjon lagret ved konflikt. */
export interface OutlookConflict extends AppEventData {
  changeKey: string | null;
  /** Fingeravtrykket til Outlook sin versjon, se `contentHash`. */
  hash?: string;
}

/** Kort fingeravtrykk av innholdet i Outlook (se outlookFingerprint). */
export function contentHash(g: Parameters<typeof outlookFingerprint>[0]): string {
  return createHash("sha256").update(outlookFingerprint(g)).digest("base64url").slice(0, 22);
}

async function context(conn: OutlookConnection & { calendar_id: string }): Promise<Ctx> {
  const db = createAdminClient();
  const [{ data: members }, { data: categories }] = await Promise.all([
    db.from("members").select("id, name, is_shared").order("sort_order"),
    db.from("categories").select("id, name, outlook_category, color").eq("scope", "event").order("sort_order"),
  ]);
  return {
    db,
    graph: graphFor(conn),
    conn,
    members: (members ?? []).map((m) => ({ id: m.id, name: m.name, isShared: m.is_shared })),
    categories: (categories ?? []).map((c) => ({ id: c.id, name: c.name, outlookCategory: c.outlook_category, color: c.color })),
  };
}

async function connectedContext(): Promise<Ctx | null> {
  const conn = await loadConnection();
  if (!conn?.calendar_id) return null;
  return context(conn as Ctx["conn"]);
}

const errorText = (e: unknown) =>
  e instanceof GraphError || e instanceof OutlookAuthError ? e.message : e instanceof Error ? e.message : "Ukjent feil";

// --- App → Outlook ---------------------------------------------------------------------

/** Sender én aktivitet til Outlook (opprett, endre eller slett). Gjør ingenting hvis Outlook ikke er koblet til. */
export async function pushEvent(id: string): Promise<void> {
  try {
    const ctx = await connectedContext();
    if (ctx) await pushOne(ctx, id);
  } catch (e) {
    console.error("Outlook-push feilet", e);
  }
}

async function eventWithParticipants(db: Db, id: string) {
  const { data: row } = await db.from("events").select("*").eq("id", id).maybeSingle();
  if (!row) return null;
  const { data: parts } = await db.from("event_participants").select("member_id").eq("event_id", id);
  return { row, participantIds: (parts ?? []).map((p) => p.member_id) };
}

function outlookFields(g: GraphEvent) {
  return {
    outlook_id: g.id,
    outlook_change_key: g.changeKey ?? null,
    outlook_ical_uid: g.iCalUId ?? null,
    outlook_series_id: g.seriesMasterId ?? null,
    outlook_last_modified: g.lastModifiedDateTime ?? null,
  };
}

async function pushOne(ctx: Ctx, id: string): Promise<boolean> {
  const { db, graph, conn } = ctx;
  const ev = await eventWithParticipants(db, id);
  if (!ev || ev.row.sync_status === "conflict") return false;
  const { row, participantIds } = ev;

  try {
    if (row.deleted_at) {
      if (row.outlook_id) {
        const res = await graph.request(`/me/events/${encodeURIComponent(row.outlook_id)}`, { method: "DELETE" });
        if (!res.ok && res.status !== 404) throw await graphError(res);
      }
      await db.from("events").delete().eq("id", id);
      await syncLog("out", `Slettet «${row.title}» i Outlook`, true, null);
      return true;
    }

    const body = toGraphEvent(
      { id, title: row.title, start: row.start_at, end: row.end_at, allDay: row.all_day, location: row.location, notes: row.notes, categoryId: row.category_id, participantIds },
      ctx.members,
      ctx.categories
    );

    if (row.outlook_id) {
      // Er hendelsen endret i Outlook siden sist vi så den? Da er det en konflikt, og familien må velge.
      const current = await graph.request(`/me/events/${encodeURIComponent(row.outlook_id)}`, { headers: { Prefer: READ_PREFER } });
      if (current.ok) {
        const g = (await current.json()) as GraphEvent;
        // Ny changeKey betyr ikke nødvendigvis en endring: Outlook bytter den av seg selv. Sammenlign innholdet.
        const changedInOutlook =
          !!row.outlook_change_key && !!g.changeKey && g.changeKey !== row.outlook_change_key && contentHash(g) !== row.outlook_synced_hash;
        if (changedInOutlook) {
          await markConflict(ctx, id, g, participantIds, row.category_id, row.title);
          return false;
        }
        // transactionId kan bare settes når hendelsen lages; Graph avviser den ved endring (400 ErrorInvalidRequest).
        const patch = { ...body, transactionId: undefined };
        const updated = await graph.json<GraphEvent>(`/me/events/${encodeURIComponent(row.outlook_id)}`, { method: "PATCH", body: patch });
        await db
          .from("events")
          .update({ ...outlookFields(updated), outlook_synced_hash: contentHash(body), sync_status: "synced", sync_error: null })
          .eq("id", id);
        await syncLog("out", `Oppdaterte «${row.title}» i Outlook`, true, id);
        return true;
      }
      if (current.status !== 404) throw await graphError(current);
      // Borte i Outlook, men endret i appen nå: lag den på nytt.
    }

    const created = await graph.json<GraphEvent>(`/me/calendars/${encodeURIComponent(conn.calendar_id)}/events`, { method: "POST", body });
    await db
      .from("events")
      .update({ ...outlookFields(created), outlook_synced_hash: contentHash(body), sync_status: "synced", sync_error: null })
      .eq("id", id);
    await syncLog("out", `La «${row.title}» inn i Outlook`, true, id);
    return true;
  } catch (e) {
    const message = errorText(e);
    await db.from("events").update({ sync_status: "error", sync_error: message }).eq("id", id);
    await syncLog("out", `«${row.title}»: ${message}`, false, id);
    if (e instanceof OutlookAuthError) throw e;
    return false;
  }
}

async function markConflict(ctx: Ctx, id: string, g: GraphEvent, participantIds: string[], categoryId: string | null, title: string) {
  const data = fromGraphEvent(g, { members: ctx.members, categories: ctx.categories, current: { participantIds, categoryId } });
  if (!data) return;
  const conflict: OutlookConflict = { ...data, changeKey: g.changeKey ?? null, hash: contentHash(g) };
  await ctx.db
    .from("events")
    .update({ sync_status: "conflict", outlook_conflict: conflict as unknown as Json, sync_error: null })
    .eq("id", id);
  await syncLog("system", `«${title}» er endret både i appen og i Outlook – velg hvilken som gjelder`, false, id);
}

/** Slettinger yngre enn dette kan fortsatt angres i appen, og venter (se finalizeDeletes i actions/events.ts). */
const UNDO_WINDOW_MS = 30_000;

/** Sender alt som venter (nye, endrede, slettede og tidligere feil). */
async function pushPending(ctx: Ctx): Promise<number> {
  const undoable = new Date(Date.now() - UNDO_WINDOW_MS).toISOString();
  const { data } = await ctx.db
    .from("events")
    .select("id")
    .in("sync_status", ["local", "pending", "error"])
    .or(`deleted_at.is.null,deleted_at.lt.${undoable}`)
    .order("updated_at")
    .limit(100);
  let pushed = 0;
  for (const { id } of data ?? []) if (await pushOne(ctx, id)) pushed++;
  return pushed;
}

// --- Outlook → app ---------------------------------------------------------------------

async function replaceParticipants(db: Db, eventId: string, ids: string[]) {
  await db.from("event_participants").delete().eq("event_id", eventId);
  if (ids.length) await db.from("event_participants").insert(ids.map((member_id) => ({ event_id: eventId, member_id })));
}

/** Henter endringer fra Outlook med delta-spørring og oppdaterer appen. Returnerer antall endrede aktiviteter. */
async function pullChanges(ctx: Ctx): Promise<number> {
  const { graph, conn } = ctx;
  const windowAge = conn.delta_window_start ? DateTime.now().diff(DateTime.fromISO(conn.delta_window_start), "days").days : Infinity;
  // delta_window_start er starten på vinduet (90 dager bakover), så alderen på vinduet er det som er utover det.
  let reset = !conn.delta_link || windowAge > WINDOW_PAST_DAYS + DELTA_MAX_AGE_DAYS;

  const fresh = () => {
    const start = DateTime.now().minus({ days: WINDOW_PAST_DAYS }).startOf("day").toUTC();
    const end = start.plus({ days: WINDOW_PAST_DAYS + WINDOW_FUTURE_DAYS });
    return {
      start,
      url: `/me/calendars/${encodeURIComponent(conn.calendar_id)}/calendarView/delta?startDateTime=${start.toISO()}&endDateTime=${end.toISO()}`,
    };
  };
  let windowStart = reset ? fresh().start : DateTime.fromISO(conn.delta_window_start!);
  let url: string = reset ? fresh().url : conn.delta_link!;

  const items: GraphEvent[] = [];
  let deltaLink: string | null = null;
  for (let page = 0; page < 200 && url; page++) {
    const res = await graph.request(url, { headers: { Prefer: READ_PREFER } });
    if (res.status === 410 && !reset) {
      // Delta-lenken er utløpt hos Microsoft: start på nytt.
      reset = true;
      ({ start: windowStart, url } = fresh());
      items.length = 0;
      continue;
    }
    if (!res.ok) throw await graphError(res);
    const json = (await res.json()) as { value?: GraphEvent[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string };
    items.push(...(json.value ?? []));
    url = json["@odata.nextLink"] ?? "";
    deltaLink = json["@odata.deltaLink"] ?? deltaLink;
  }

  let changed = 0;
  const seen = new Set<string>();
  for (const item of items) {
    seen.add(item.id);
    if (await applyItem(ctx, item)) changed++;
  }

  if (reset) changed += await reconcileMissing(ctx, seen, windowStart);

  await updateConnection({
    delta_link: deltaLink,
    delta_window_start: windowStart.toISO(),
    last_sync_at: new Date().toISOString(),
    last_error: null,
  });
  return changed;
}

async function applyItem(ctx: Ctx, g: GraphEvent): Promise<boolean> {
  const { db } = ctx;
  if (g.type === "seriesMaster") return false;

  const { data: byOutlook } = await db.from("events").select("*").eq("outlook_id", g.id).maybeSingle();
  let row = byOutlook;

  if (g["@removed"] || g.isCancelled) {
    if (!row || row.sync_status !== "synced") return false;
    await db.from("events").delete().eq("id", row.id);
    await syncLog("in", `«${row.title}» ble slettet i Outlook`, true, null);
    return true;
  }

  // Hendelser vi selv har laget har appens id som transactionId.
  if (!row && g.transactionId && UUID.test(g.transactionId)) {
    ({ data: row } = await db.from("events").select("*").eq("id", g.transactionId).maybeSingle());
  }
  if (!row && g.iCalUId && (g.type ?? "singleInstance") === "singleInstance") {
    ({ data: row } = await db.from("events").select("*").eq("outlook_ical_uid", g.iCalUId).is("outlook_series_id", null).maybeSingle());
  }

  // Ekko av vår egen endring: ingenting nytt.
  if (row && row.outlook_id === g.id && row.outlook_change_key && row.outlook_change_key === g.changeKey) return false;

  // Samme innhold som sist synket, bare ny changeKey (Outlook gjør det av seg selv): oppdater stille.
  // Gjelder også når appen har en endring som venter – Outlook er ikke endret, så det er ingen konflikt.
  const hash = contentHash(g);
  if (row && row.outlook_synced_hash === hash) {
    await db.from("events").update(outlookFields(g)).eq("id", row.id);
    return false;
  }

  let current: { participantIds: string[]; categoryId: string | null; notes: string | null; location: string | null } | null = null;
  if (row) {
    const { data: parts } = await db.from("event_participants").select("member_id").eq("event_id", row.id);
    current = { participantIds: (parts ?? []).map((p) => p.member_id), categoryId: row.category_id, notes: row.notes, location: row.location };
  }
  const data = fromGraphEvent(g, { members: ctx.members, categories: ctx.categories, current });
  if (!data) return false;

  if (row && row.deleted_at) return false;

  if (row && row.outlook_id && (row.sync_status === "pending" || row.sync_status === "conflict" || row.sync_status === "error")) {
    // Endret både i appen og i Outlook.
    await markConflict(ctx, row.id, g, current!.participantIds, row.category_id, row.title);
    return true;
  }

  const fields = {
    title: data.title,
    start_at: data.start,
    end_at: data.end,
    all_day: data.allDay,
    location: data.location,
    notes: data.notes,
    category_id: data.categoryId,
    ...outlookFields(g),
    outlook_synced_hash: hash,
    sync_status: "synced" as const,
    sync_error: null,
    outlook_conflict: null,
  };

  if (row) {
    await db.from("events").update(fields).eq("id", row.id);
    await replaceParticipants(db, row.id, data.participantIds);
    await syncLog("in", `«${data.title}» ble oppdatert fra Outlook`, true, row.id);
    return true;
  }

  const { data: inserted, error } = await db
    .from("events")
    .insert({ ...fields, origin: "outlook" })
    .select("id")
    .single();
  if (error || !inserted) return false; // f.eks. samme outlook_id satt inn av en samtidig synk
  await replaceParticipants(db, inserted.id, data.participantIds);
  await syncLog("in", `«${data.title}» kom inn fra Outlook`, true, inserted.id);
  return true;
}

/**
 * Etter en full gjennomgang: aktiviteter som har en Outlook-id men ikke finnes i Outlook lenger.
 * Importerte slettes; de som ble laget i appen sendes til Outlook på nytt.
 */
async function reconcileMissing(ctx: Ctx, seen: Set<string>, windowStart: DateTime): Promise<number> {
  const { data } = await ctx.db
    .from("events")
    .select("id, outlook_id, origin, sync_status")
    .not("outlook_id", "is", null)
    .is("deleted_at", null)
    .gte("start_at", windowStart.toISO()!)
    .lt("start_at", windowStart.plus({ days: WINDOW_PAST_DAYS + WINDOW_FUTURE_DAYS }).toISO()!);
  let changed = 0;
  for (const row of data ?? []) {
    if (seen.has(row.outlook_id!) || row.sync_status === "pending" || row.sync_status === "conflict") continue;
    if (row.origin === "outlook") await ctx.db.from("events").delete().eq("id", row.id);
    else await ctx.db.from("events").update({ outlook_id: null, outlook_change_key: null, sync_status: "local" }).eq("id", row.id);
    changed++;
  }
  return changed;
}

// --- Hele synken -----------------------------------------------------------------------

/** Henter fra Outlook og sender det som venter. Trygg å kalle ofte; bare én kjører om gangen. */
export async function syncAll(): Promise<SyncSummary> {
  const conn = await loadConnection();
  if (!conn) return { ok: false, message: "Outlook er ikke koblet til." };
  if (!conn.calendar_id) return { ok: false, message: "Velg hvilken Outlook-kalender som skal brukes." };
  if (!(await acquireSyncLock())) return { ok: true, message: "En synk pågår allerede." };

  let pulled = 0;
  let pushed = 0;
  try {
    // Kom det varsler mens vi holdt på, tar vi en runde til (maks tre).
    let again = true;
    for (let round = 1; again; round++) {
      const ctx = await context((await loadConnection()) as Ctx["conn"]);
      pulled += await pullChanges(ctx);
      pushed += await pushPending(ctx);
      again = (await releaseSyncLock()) && round < 3 && (await acquireSyncLock());
    }
    if (pulled) await broadcastChange(CALENDAR_TOPIC);
    return { ok: true, pulled, pushed, message: pulled || pushed ? `Synket: ${pulled} inn, ${pushed} ut` : "Alt er oppdatert" };
  } catch (e) {
    const message = errorText(e);
    await updateConnection({ last_error: message, sync_lock_until: null });
    await syncLog("system", `Synken feilet: ${message}`, false);
    return { ok: false, message };
  }
}

// --- Varsler fra Outlook (abonnement) ---------------------------------------------------

/** Sørger for at Outlook varsler oss om endringer. Fornyes daglig av cron. */
export async function ensureSubscription(): Promise<string | null> {
  const conn = await loadConnection();
  if (!conn?.calendar_id) return null;
  const site = conn.site_url;
  if (!site || !site.startsWith("https://")) return "Varsler fra Outlook krever en https-adresse (virker ikke lokalt).";

  const graph = graphFor(conn);
  const expires = new Date(Date.now() + SUBSCRIPTION_MINUTES * 60_000).toISOString();
  try {
    if (conn.subscription_id) {
      const res = await graph.request(`/subscriptions/${conn.subscription_id}`, { method: "PATCH", body: { expirationDateTime: expires } });
      if (res.ok) {
        await updateConnection({ subscription_expires_at: expires });
        return null;
      }
      if (res.status !== 404) throw await graphError(res);
    }
    const sub = await graph.json<{ id: string; expirationDateTime: string }>("/subscriptions", {
      method: "POST",
      body: {
        changeType: "created,updated,deleted",
        notificationUrl: `${site}/api/outlook/webhook`,
        resource: `/me/calendars/${conn.calendar_id}/events`,
        expirationDateTime: expires,
        clientState: serverEnv("OUTLOOK_WEBHOOK_CLIENT_STATE"),
      },
    });
    await updateConnection({ subscription_id: sub.id, subscription_expires_at: sub.expirationDateTime });
    await syncLog("system", "Outlook varsler nå appen om endringer");
    return null;
  } catch (e) {
    const message = `Kunne ikke sette opp varsler fra Outlook: ${errorText(e)}`;
    await syncLog("system", message, false);
    return message;
  }
}

export async function deleteSubscription(conn: OutlookConnection): Promise<void> {
  if (!conn.subscription_id) return;
  try {
    await graphFor(conn).request(`/subscriptions/${conn.subscription_id}`, { method: "DELETE" });
  } catch {
    // Utløper uansett av seg selv.
  }
}

/** Lager Outlook-kategorier (med farge) for appens kategorier som ikke finnes der. Valgfritt – feil ignoreres. */
export async function ensureOutlookCategories(): Promise<void> {
  const ctx = await connectedContext();
  if (!ctx) return;
  try {
    const existing = await ctx.graph.json<{ value: { displayName: string }[] }>("/me/outlook/masterCategories");
    const names = new Set(existing.value.map((c) => c.displayName.toLocaleLowerCase("nb")));
    for (const c of ctx.categories) {
      const name = outlookCategoryName(c);
      if (names.has(name.toLocaleLowerCase("nb"))) continue;
      await ctx.graph.request("/me/outlook/masterCategories", { method: "POST", body: { displayName: name, color: presetForColor(c.color) } });
    }
  } catch (e) {
    console.warn("Kunne ikke lage Outlook-kategorier", e);
  }
}
