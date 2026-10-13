import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Kjører hele synken mot en enkel database i minnet og en falsk Microsoft Graph,
 * siden ekte Outlook ikke kan nås fra testene.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/crypto", () => ({ encryptSecret: (s: string) => s, decryptSecret: (s: string) => s }));
vi.mock("@/lib/realtime", () => ({ broadcastChange: async () => {} }));
vi.mock("@/lib/env", () => ({ serverEnv: () => "hemmelig" }));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let nextId = 0;

/** Minimal Supabase-lignende spørringsbygger for metodene synken bruker. */
function query(table: string) {
  let op: "select" | "update" | "delete" | "insert" | "upsert" = "select";
  let payload: Row | Row[] | null = null;
  let returning = false;
  let single: "single" | "maybe" | null = null;
  let limit = Infinity;
  const filters: ((r: Row) => boolean)[] = [];

  const run = () => {
    const rows = (tables[table] ??= []);
    if (op === "insert" || op === "upsert") {
      const list = (Array.isArray(payload) ? payload : [payload!]).map((p) => ({ ...p }));
      for (const r of list) {
        if (op === "upsert" && r.id !== undefined) {
          const existing = rows.find((x) => x.id === r.id);
          if (existing) {
            Object.assign(existing, r);
            continue;
          }
        }
        if (table === "events" && r.outlook_id && rows.some((x) => x.outlook_id === r.outlook_id)) {
          return { data: null, error: { message: "duplicate" } };
        }
        r.id ??= `id-${++nextId}`;
        rows.push(r);
      }
      return finish(list);
    }
    const hit = rows.filter((r) => filters.every((f) => f(r))).slice(0, limit);
    if (op === "update") hit.forEach((r) => Object.assign(r, payload));
    if (op === "delete") tables[table] = rows.filter((r) => !hit.includes(r));
    return finish(hit);
  };
  const finish = (list: Row[]) => {
    if (op !== "select" && !returning) return { data: null, error: null, count: list.length };
    if (single) return { data: list[0] ?? null, error: single === "single" && !list[0] ? { message: "none" } : null };
    return { data: list, error: null, count: list.length };
  };

  const b = {
    select: () => {
      if (op !== "select") returning = true;
      return b;
    },
    insert: (p: Row | Row[]) => ((op = "insert"), (payload = p), b),
    upsert: (p: Row) => ((op = "upsert"), (payload = p), b),
    update: (p: Row) => ((op = "update"), (payload = p), b),
    delete: () => ((op = "delete"), b),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    is: (c: string, v: null) => (filters.push((r) => (r[c] ?? null) === v), b),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
    not: (c: string) => (filters.push((r) => (r[c] ?? null) !== null), b),
    gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), b),
    lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), b),
    or: (expr: string) => {
      const parts = expr.split(",").map((p) => p.split("."));
      filters.push((r) => parts.some(([c, o, ...v]) => (o === "is" ? (r[c] ?? null) === null : String(r[c]) < v.join("."))));
      return b;
    },
    order: () => b,
    limit: (n: number) => ((limit = n), b),
    maybeSingle: () => ((single = "maybe"), b),
    single: () => ((single = "single"), b),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  };
  return b;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: query }) }));

// --- Falsk Outlook ----------------------------------------------------------------------
interface OEvent {
  id: string;
  changeKey: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay: boolean;
  transactionId?: string;
  categories: string[];
  type: string;
}
let outlook: Map<string, OEvent>;
let pendingDelta: (OEvent | { id: string; "@removed": { reason: string } })[];
let changeCounter = 0;
const ck = () => `ck-${++changeCounter}`;

function toUtcParts(t: { dateTime: string; timeZone: string }) {
  // Testene sender bare Oslo-tid om høsten (UTC+2).
  if (t.timeZone === "UTC") return t;
  const d = new Date(`${t.dateTime}+02:00`);
  return { dateTime: d.toISOString().slice(0, 19), timeZone: "UTC" };
}

vi.stubGlobal("fetch", async (input: string, init: { method?: string; body?: string } = {}) => {
  const url = new URL(input);
  const method = init.method ?? "GET";
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const path = url.pathname.replace("/v1.0", "");

  if (path.endsWith("/calendarView/delta")) {
    return json({ value: [...outlook.values()], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/neste-delta" });
  }
  if (path === "/neste-delta") {
    const value = pendingDelta;
    pendingDelta = [];
    return json({ value, "@odata.deltaLink": "https://graph.microsoft.com/v1.0/neste-delta" });
  }
  if (path.match(/^\/me\/calendars\/[^/]+\/events$/) && method === "POST") {
    const b = JSON.parse(init.body!);
    const ev: OEvent = { id: `o-${outlook.size + 1}`, changeKey: ck(), subject: b.subject, start: toUtcParts(b.start), end: toUtcParts(b.end), isAllDay: b.isAllDay, transactionId: b.transactionId, categories: b.categories, type: "singleInstance" };
    outlook.set(ev.id, ev);
    return json(ev, 201);
  }
  const m = path.match(/^\/me\/events\/([^/]+)$/);
  if (m) {
    const ev = outlook.get(decodeURIComponent(m[1]));
    if (!ev) return json({ error: { code: "ErrorItemNotFound" } }, 404);
    if (method === "GET") return json(ev);
    if (method === "DELETE") {
      outlook.delete(ev.id);
      return new Response(null, { status: 204 });
    }
    if (method === "PATCH") {
      const b = JSON.parse(init.body!);
      // Som ekte Graph: transactionId kan bare settes når hendelsen lages.
      if ("transactionId" in b) return json({ error: { code: "ErrorInvalidRequest" } }, 400);
      Object.assign(ev, { subject: b.subject, start: toUtcParts(b.start), end: toUtcParts(b.end), changeKey: ck() });
      return json(ev);
    }
  }
  return json({ error: { code: "NotMocked", message: `${method} ${path}` } }, 500);
});

const { syncAll, pushEvent } = await import("./sync");

const FELLES = "m-felles";
const OLAV = "m-olav";

beforeEach(() => {
  nextId = 0;
  changeCounter = 0;
  outlook = new Map();
  pendingDelta = [];
  tables = {
    outlook_connection: [
      {
        id: 1,
        account_email: "familie@outlook.com",
        tokens_encrypted: JSON.stringify({ accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 3_600_000 }),
        calendar_id: "kal",
        delta_link: null,
        delta_window_start: null,
        sync_lock_until: null,
        resync_requested: false,
      },
    ],
    members: [
      { id: OLAV, name: "Olav", is_shared: false },
      { id: FELLES, name: "Felles", is_shared: true },
    ],
    categories: [
      { id: "c-trening", name: "Trening", outlook_category: null, color: "#4fb071", scope: "event" },
      { id: "c-annet", name: "Annet", outlook_category: null, color: "#a39e93", scope: "event" },
    ],
    events: [],
    event_participants: [],
    sync_log: [],
  };
});

const soon = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString().slice(0, 19);
const events = () => tables.events;
const participantsOf = (id: unknown) => tables.event_participants.filter((p) => p.event_id === id).map((p) => p.member_id);

describe("Outlook-synk", () => {
  it("første synk henter hendelser fra Outlook og tolker deltakere", async () => {
    outlook.set("o-1", {
      id: "o-1",
      changeKey: "ck-a",
      subject: "Fotball (Olav)",
      start: { dateTime: soon(24), timeZone: "UTC" },
      end: { dateTime: soon(25), timeZone: "UTC" },
      isAllDay: false,
      categories: ["Trening"],
      type: "singleInstance",
    });
    const res = await syncAll();
    expect(res.ok).toBe(true);
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({ title: "Fotball", origin: "outlook", outlook_id: "o-1", category_id: "c-trening", sync_status: "synced" });
    expect(participantsOf(events()[0].id)).toEqual([OLAV]);
    expect(tables.outlook_connection[0].delta_link).toContain("neste-delta");
    expect(tables.outlook_connection[0].sync_lock_until).toBeNull();
  });

  it("ny aktivitet i appen sendes til Outlook med deltakere i tittelen, og ekkoet ignoreres", async () => {
    events().push({ id: "e1", title: "Svømming", start_at: new Date(Date.now() + 86_400_000).toISOString(), end_at: new Date(Date.now() + 90_000_000).toISOString(), all_day: false, location: null, notes: null, category_id: null, deleted_at: null, origin: "app", outlook_id: null, outlook_change_key: null, sync_status: "local" });
    tables.event_participants.push({ event_id: "e1", member_id: OLAV });

    await pushEvent("e1");
    const created = [...outlook.values()][0];
    expect(created).toMatchObject({ subject: "Svømming (Olav)", transactionId: "e1" });
    expect(events()[0]).toMatchObject({ outlook_id: created.id, outlook_change_key: created.changeKey, sync_status: "synced" });

    // Outlook melder tilbake om den samme hendelsen: ingen ny aktivitet, ingen endring.
    tables.outlook_connection[0].delta_link = "https://graph.microsoft.com/v1.0/neste-delta";
    tables.outlook_connection[0].delta_window_start = new Date().toISOString();
    pendingDelta = [created];
    await syncAll();
    expect(events()).toHaveLength(1);
    expect(events()[0].title).toBe("Svømming");
  });

  it("ny changeKey uten endret innhold gir verken logg, oppdatering eller konflikt", async () => {
    events().push({ id: "e1", title: "Svømming", start_at: new Date(Date.now() + 86_400_000).toISOString(), end_at: new Date(Date.now() + 90_000_000).toISOString(), all_day: false, location: null, notes: null, category_id: null, deleted_at: null, origin: "app", outlook_id: null, outlook_change_key: null, sync_status: "local" });
    tables.event_participants.push({ event_id: "e1", member_id: OLAV });
    await pushEvent("e1");
    const o = [...outlook.values()][0];

    // Outlook bytter changeKey av seg selv rett etter opprettelsen.
    o.changeKey = "ck-av-seg-selv";
    tables.outlook_connection[0].delta_link = "https://graph.microsoft.com/v1.0/neste-delta";
    tables.outlook_connection[0].delta_window_start = new Date().toISOString();
    pendingDelta = [o];
    const logBefore = tables.sync_log.length;
    await syncAll();
    expect(tables.sync_log.length).toBe(logBefore);
    expect(events()[0].outlook_change_key).toBe("ck-av-seg-selv");

    // Endres den så i appen, er det ingen konflikt.
    Object.assign(events()[0], { title: "Svømming kl. 18", sync_status: "pending" });
    o.changeKey = "ck-igjen";
    await pushEvent("e1");
    expect(events()[0].sync_status).toBe("synced");
    expect(o.subject).toBe("Svømming kl. 18 (Olav)");
  });

  it("endret begge steder gir konflikt i stedet for å overskrive", async () => {
    events().push({ id: "e1", title: "Middag", start_at: new Date(Date.now() + 86_400_000).toISOString(), end_at: new Date(Date.now() + 90_000_000).toISOString(), all_day: false, location: null, notes: null, category_id: null, deleted_at: null, origin: "app", outlook_id: null, outlook_change_key: null, sync_status: "local" });
    tables.event_participants.push({ event_id: "e1", member_id: FELLES });
    await pushEvent("e1");
    const o = [...outlook.values()][0];

    // Endret i Outlook (ny changeKey) ...
    o.subject = "Middag hos besteforeldre";
    o.changeKey = "ck-outlook";
    // ... og i appen før synken har hentet Outlook sin endring.
    Object.assign(events()[0], { title: "Middag ute", sync_status: "pending" });

    await pushEvent("e1");
    expect(events()[0].sync_status).toBe("conflict");
    expect(events()[0].outlook_conflict).toMatchObject({ title: "Middag hos besteforeldre", changeKey: "ck-outlook" });
    expect(o.subject).toBe("Middag hos besteforeldre"); // Outlook er ikke overskrevet
  });

  it("slettet i Outlook fjernes i appen, og sletting i appen fjernes i Outlook", async () => {
    outlook.set("o-1", { id: "o-1", changeKey: "a", subject: "A", start: { dateTime: soon(24), timeZone: "UTC" }, end: { dateTime: soon(25), timeZone: "UTC" }, isAllDay: false, categories: [], type: "singleInstance" });
    outlook.set("o-2", { id: "o-2", changeKey: "b", subject: "B", start: { dateTime: soon(48), timeZone: "UTC" }, end: { dateTime: soon(49), timeZone: "UTC" }, isAllDay: false, categories: [], type: "singleInstance" });
    await syncAll();
    expect(events()).toHaveLength(2);

    pendingDelta = [{ id: "o-1", "@removed": { reason: "deleted" } }];
    await syncAll();
    expect(events().map((e) => e.title)).toEqual(["B"]);

    const b = events()[0];
    Object.assign(b, { deleted_at: new Date().toISOString(), sync_status: "pending" });
    await pushEvent(b.id as string);
    expect(outlook.has("o-2")).toBe(false);
    expect(events()).toHaveLength(0);
  });
});
