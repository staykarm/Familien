import "server-only";
import { DateTime } from "luxon";
import { pickupFor, shortTime, type CareData } from "@/lib/care/plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { TIME_ZONE } from "@/lib/time";
import { claimOnce, loadSubscriptions, sendToSubscription, type PushMessage, type PushSub } from "./send";
import { dueReminders, eventTargets, inMinutes, morningDue, pickRecipients, type RecipientOptions, type UpcomingEvent } from "./settings";

type Db = ReturnType<typeof createAdminClient>;

interface MemberRow {
  id: string;
  name: string;
  is_shared: boolean;
}

/**
 * Det som skal sendes på tid: påminnelser før aktiviteter, henting og morgenoversikten.
 * Hver enhet har egne valg (typer, minutter før, klokkeslett, stille tid), så alt regnes ut per enhet.
 * Kjøres ofte (hvert 5. minutt via Supabase, se README). Hvert varsel sendes bare én gang per enhet (push_log).
 */
export async function runPushJobs(now: Date = new Date()): Promise<Record<string, number>> {
  const db = createAdminClient();
  const [subs, { data: members }] = await Promise.all([loadSubscriptions(db), db.from("members").select("id, name, is_shared").order("sort_order")]);
  const list = members ?? [];
  const result = {
    reminders: await reminders(db, subs, list, now),
    care: await care(db, subs, list, now),
    morning: await morning(db, subs, list, now),
  };
  // Rydd i loggen av og til.
  await db.from("push_log").delete().lt("sent_at", new Date(now.getTime() - 30 * 86_400_000).toISOString());
  return result;
}

/** Sender til én enhet hvis den skal ha typen (valg, stille tid, person), og bare første gang for nøkkelen. */
async function sendOnce(
  db: Db,
  sub: PushSub,
  type: Parameters<typeof pickRecipients>[1],
  opts: RecipientOptions,
  now: Date,
  key: string,
  message: PushMessage
): Promise<number> {
  if (!pickRecipients([sub], type, opts, now).length) return 0;
  if (!(await claimOnce(db, `${key}:${sub.id}`))) return 0;
  return (await sendToSubscription(db, sub, message)) ? 1 : 0;
}

async function loadEvents(db: Db, from: Date, to: Date): Promise<UpcomingEvent[]> {
  const { data: events } = await db
    .from("events")
    .select("id, title, start_at, end_at, all_day")
    .is("deleted_at", null)
    .lt("start_at", to.toISOString())
    .gt("end_at", from.toISOString())
    .order("start_at");
  const ids = (events ?? []).map((e) => e.id);
  const { data: parts } = ids.length ? await db.from("event_participants").select("event_id, member_id").in("event_id", ids) : { data: [] };
  return (events ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    start: e.start_at,
    allDay: e.all_day,
    participantIds: (parts ?? []).filter((p) => p.event_id === e.id).map((p) => p.member_id),
  }));
}

const osloTime = (iso: string) => DateTime.fromISO(iso).setZone(TIME_ZONE).toFormat("HH:mm");

async function reminders(db: Db, subs: PushSub[], members: MemberRow[], now: Date): Promise<number> {
  const wanting = subs.filter((s) => s.prefs.types.reminder);
  if (!wanting.length) return 0;
  const longest = Math.max(...wanting.map((s) => s.prefs.reminderMinutes));
  const events = await loadEvents(db, now, new Date(now.getTime() + longest * 60_000 + 60_000));
  const shared = members.filter((m) => m.is_shared).map((m) => m.id);
  let sent = 0;
  for (const sub of wanting) {
    for (const { event, key } of dueReminders(events, sub.prefs.reminderMinutes, now)) {
      sent += await sendOnce(db, sub, "reminder", { targets: eventTargets(event.participantIds, shared) }, now, key, {
        title: `⏰ ${event.title}`,
        body: `Starter ${inMinutes(event.start, now)} (kl. ${osloTime(event.start)})`,
        url: "/",
        tag: `reminder-${event.id}`,
      });
    }
  }
  return sent;
}

async function loadCareData(db: Db, date: string): Promise<CareData> {
  const [{ data: plans, error }, { data: days }] = await Promise.all([
    db.from("care_plans").select("member_id, weekday, pick_by, pick_time"),
    db.from("care_days").select("member_id, date, pick_by, pick_time").eq("date", date),
  ]);
  if (error) return { plans: [], days: [] };
  return {
    plans: (plans ?? []).map((r) => ({ memberId: r.member_id, weekday: r.weekday, pickBy: r.pick_by, pickTime: shortTime(r.pick_time) })),
    days: (days ?? []).map((r) => ({ memberId: r.member_id, date: r.date, pickBy: r.pick_by, pickTime: shortTime(r.pick_time) })),
  };
}

/** Påminnelse til den som skal hente (ukeplan eller endring for dagen). */
async function care(db: Db, subs: PushSub[], members: MemberRow[], now: Date): Promise<number> {
  const wanting = subs.filter((s) => s.prefs.types.care);
  if (!wanting.length) return 0;
  const date = DateTime.fromJSDate(now).setZone(TIME_ZONE).toISODate()!;
  const data = await loadCareData(db, date);
  let sent = 0;
  for (const child of members) {
    const p = pickupFor(data, child.id, date);
    if (!p?.by || !p.time) continue;
    const at = DateTime.fromISO(`${date}T${p.time}`, { zone: TIME_ZONE });
    const diff = at.toMillis() - now.getTime();
    if (diff <= 0) continue;
    const start = at.toUTC().toISO()!;
    const who = members.find((m) => m.id === p.by)?.name ?? "";
    for (const sub of wanting) {
      if (diff > sub.prefs.careMinutes * 60_000) continue;
      sent += await sendOnce(db, sub, "care", { targets: [p.by] }, now, `care:${child.id}:${date}:hente`, {
        // Felles enhet: si hvem som skal hente.
        title: sub.memberId ? `🚸 Du skal hente ${child.name} kl. ${p.time}` : `🚸 ${who} skal hente ${child.name} kl. ${p.time}`,
        body: `Om ${inMinutes(start, now).slice(3)}`,
        url: "/i-dag",
      });
    }
  }
  return sent;
}

async function morning(db: Db, subs: PushSub[], members: MemberRow[], now: Date): Promise<number> {
  const due = subs.filter((s) => s.prefs.types.morning && morningDue(s.prefs.morningTime, now));
  if (!due.length) return 0;
  const local = DateTime.fromJSDate(now).setZone(TIME_ZONE);
  const date = local.toISODate()!;

  const dayStart = local.startOf("day");
  const [events, { data: tasks }, careData] = await Promise.all([
    loadEvents(db, dayStart.toJSDate(), dayStart.plus({ days: 1 }).toJSDate()),
    db.from("tasks").select("title, assignee_id, due_date").neq("status", "done").not("due_date", "is", null).lte("due_date", date),
    loadCareData(db, date),
  ]);
  const shared = members.filter((m) => m.is_shared).map((m) => m.id);
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? "";
  const dayName = local.setLocale("nb").toFormat("cccc d. LLLL");
  const line = (e: UpcomingEvent) => (e.allDay ? e.title : `${osloTime(e.start)} ${e.title}`);

  const messageFor = (memberId: string | null): PushMessage => {
    const mine = memberId ? events.filter((e) => e.participantIds.includes(memberId) || e.participantIds.some((p) => shared.includes(p))) : events;
    const myTasks = (tasks ?? []).filter((t) => !memberId || t.assignee_id === memberId || !t.assignee_id);
    const careLines = members.flatMap((child) => {
      const p = pickupFor(careData, child.id, date);
      if (!p?.by || (memberId && p.by !== memberId)) return [];
      return [`${memberId ? "Du" : nameOf(p.by)} henter ${child.name}${p.time ? ` ${p.time}` : ""}`];
    });
    const parts = [
      mine.length ? mine.slice(0, 5).map(line).join(" · ") + (mine.length > 5 ? ` (+${mine.length - 5})` : "") : "Ingenting i kalenderen",
      ...careLines,
      myTasks.length ? (myTasks.length === 1 ? `Husk: ${myTasks[0].title}` : `${myTasks.length} oppgaver med frist`) : null,
    ].filter(Boolean);
    return { title: `☀️ God morgen${memberId ? `, ${nameOf(memberId)}` : ""} – ${dayName}`, body: parts.join("\n"), url: "/i-dag", tag: "morning" };
  };

  let sent = 0;
  for (const sub of due) {
    // Morgenoversikten kommer på valgt klokkeslett, også i stille tid.
    sent += await sendOnce(db, sub, "morning", { targets: null, ignoreQuiet: true }, now, `morning:${date}`, messageFor(sub.memberId));
  }
  return sent;
}
