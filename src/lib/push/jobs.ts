import "server-only";
import { DateTime } from "luxon";
import { planForDate, shortTime } from "@/lib/care/plan";
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
 * Det som skal sendes på tid: påminnelser før aktiviteter, levering/henting og morgenoversikten.
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

async function loadPlans(db: Db) {
  const { data, error } = await db.from("care_plans").select("member_id, weekday, drop_by, drop_time, pick_by, pick_time");
  if (error || !data) return [];
  return data.map((r) => ({
    memberId: r.member_id,
    weekday: r.weekday,
    dropBy: r.drop_by,
    dropTime: shortTime(r.drop_time),
    pickBy: r.pick_by,
    pickTime: shortTime(r.pick_time),
  }));
}

async function care(db: Db, subs: PushSub[], members: MemberRow[], now: Date): Promise<number> {
  const wanting = subs.filter((s) => s.prefs.types.care);
  if (!wanting.length) return 0;
  const date = DateTime.fromJSDate(now).setZone(TIME_ZONE).toISODate()!;
  const plans = await loadPlans(db);
  let sent = 0;
  for (const child of members) {
    const plan = planForDate(plans, child.id, date);
    if (!plan) continue;
    for (const [what, by, time] of [
      ["levere", plan.dropBy, plan.dropTime],
      ["hente", plan.pickBy, plan.pickTime],
    ] as const) {
      if (!by || !time) continue;
      const at = DateTime.fromISO(`${date}T${time}`, { zone: TIME_ZONE });
      const diff = at.toMillis() - now.getTime();
      if (diff <= 0) continue;
      const start = at.toUTC().toISO()!;
      for (const sub of wanting) {
        if (diff > sub.prefs.careMinutes * 60_000) continue;
        const who = members.find((m) => m.id === by)?.name ?? "";
        sent += await sendOnce(db, sub, "care", { targets: [by] }, now, `care:${child.id}:${date}:${what}`, {
          // Felles enhet: si hvem som skal levere/hente.
          title: sub.memberId ? `🚸 Du skal ${what} ${child.name} kl. ${time}` : `🚸 ${who} skal ${what} ${child.name} kl. ${time}`,
          body: `Om ${inMinutes(start, now).slice(3)}`,
          url: "/i-dag",
        });
      }
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
  const [events, { data: tasks }, plans] = await Promise.all([
    loadEvents(db, dayStart.toJSDate(), dayStart.plus({ days: 1 }).toJSDate()),
    db.from("tasks").select("title, assignee_id, due_date").neq("status", "done").not("due_date", "is", null).lte("due_date", date),
    loadPlans(db),
  ]);
  const shared = members.filter((m) => m.is_shared).map((m) => m.id);
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? "";
  const dayName = local.setLocale("nb").toFormat("cccc d. LLLL");
  const line = (e: UpcomingEvent) => (e.allDay ? e.title : `${osloTime(e.start)} ${e.title}`);

  const messageFor = (memberId: string | null): PushMessage => {
    const mine = memberId ? events.filter((e) => e.participantIds.includes(memberId) || e.participantIds.some((p) => shared.includes(p))) : events;
    const myTasks = (tasks ?? []).filter((t) => !memberId || t.assignee_id === memberId || !t.assignee_id);
    const careLines = members.flatMap((child) => {
      const p = planForDate(plans, child.id, date);
      if (!p) return [];
      const drop = p.dropBy && (!memberId || p.dropBy === memberId);
      const pick = p.pickBy && (!memberId || p.pickBy === memberId);
      return [
        drop ? `${memberId ? "Du" : nameOf(p.dropBy)} leverer ${child.name}${p.dropTime ? ` ${p.dropTime}` : ""}` : null,
        pick ? `${memberId ? "Du" : nameOf(p.pickBy)} henter ${child.name}${p.pickTime ? ` ${p.pickTime}` : ""}` : null,
      ].filter((x): x is string => !!x);
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
