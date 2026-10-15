import "server-only";
import { DateTime } from "luxon";
import { planForDate, shortTime } from "@/lib/care/plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { TIME_ZONE } from "@/lib/time";
import { claimOnce, loadPushSettings, notify } from "./send";
import { dueReminders, eventTargets, inMinutes, inQuietHours, morningDue, type PushSettings, type UpcomingEvent } from "./settings";

type Db = ReturnType<typeof createAdminClient>;

interface MemberRow {
  id: string;
  name: string;
  is_shared: boolean;
}

/**
 * Det som skal sendes på tid: påminnelser før aktiviteter, levering/henting og morgenoversikten.
 * Kjøres ofte (hvert 5. minutt via Supabase, se README). Hver ting sendes bare én gang (push_log).
 */
export async function runPushJobs(now: Date = new Date()): Promise<Record<string, number>> {
  const db = createAdminClient();
  const settings = await loadPushSettings(db);
  const { data: members } = await db.from("members").select("id, name, is_shared").order("sort_order");
  const list = members ?? [];
  const quiet = inQuietHours(settings.quiet, now);

  const result = {
    reminders: quiet || !settings.types.reminder.enabled ? 0 : await reminders(db, settings, list, now),
    care: quiet || !settings.types.care.enabled ? 0 : await care(db, settings, list, now),
    morning: settings.types.morning.enabled ? await morning(db, settings, list, now) : 0,
  };
  // Rydd i loggen av og til.
  await db.from("push_log").delete().lt("sent_at", new Date(now.getTime() - 30 * 86_400_000).toISOString());
  return result;
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

async function reminders(db: Db, settings: PushSettings, members: MemberRow[], now: Date): Promise<number> {
  const events = await loadEvents(db, now, new Date(now.getTime() + settings.reminderMinutes * 60_000 + 60_000));
  const shared = members.filter((m) => m.is_shared).map((m) => m.id);
  let sent = 0;
  for (const { event, key } of dueReminders(events, settings.reminderMinutes, now)) {
    if (!(await claimOnce(db, key))) continue;
    sent += await notify(
      "reminder",
      { title: `⏰ ${event.title}`, body: `Starter ${inMinutes(event.start, now)} (kl. ${osloTime(event.start)})`, url: "/", tag: `reminder-${event.id}` },
      { targets: eventTargets(event.participantIds, shared) }
    );
  }
  return sent;
}

async function care(db: Db, settings: PushSettings, members: MemberRow[], now: Date): Promise<number> {
  const local = DateTime.fromJSDate(now).setZone(TIME_ZONE);
  const date = local.toISODate()!;
  const { data, error } = await db.from("care_plans").select("member_id, weekday, drop_by, drop_time, pick_by, pick_time");
  if (error || !data) return 0;
  const plans = data.map((r) => ({
    memberId: r.member_id,
    weekday: r.weekday,
    dropBy: r.drop_by,
    dropTime: shortTime(r.drop_time),
    pickBy: r.pick_by,
    pickTime: shortTime(r.pick_time),
  }));
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
      const start = at.toUTC().toISO()!;
      const diff = at.toMillis() - now.getTime();
      if (diff <= 0 || diff > settings.careMinutes * 60_000) continue;
      if (!(await claimOnce(db, `care:${child.id}:${date}:${what}`))) continue;
      sent += await notify(
        "care",
        { title: `🚸 Du skal ${what} ${child.name} kl. ${time}`, body: `Om ${inMinutes(start, now).slice(3)}`, url: "/i-dag" },
        { targets: [by] }
      );
    }
  }
  return sent;
}

async function morning(db: Db, settings: PushSettings, members: MemberRow[], now: Date): Promise<number> {
  if (!morningDue(settings.morningTime, now)) return 0;
  const local = DateTime.fromJSDate(now).setZone(TIME_ZONE);
  const date = local.toISODate()!;
  if (!(await claimOnce(db, `morning:${date}`))) return 0;

  const dayStart = local.startOf("day");
  const events = await loadEvents(db, dayStart.toJSDate(), dayStart.plus({ days: 1 }).toJSDate());
  const { data: tasks } = await db
    .from("tasks")
    .select("title, assignee_id, due_date")
    .neq("status", "done")
    .not("due_date", "is", null)
    .lte("due_date", date);
  const { data: careRows } = await db.from("care_plans").select("member_id, weekday, drop_by, drop_time, pick_by, pick_time");
  const plans = (careRows ?? []).map((r) => ({
    memberId: r.member_id,
    weekday: r.weekday,
    dropBy: r.drop_by,
    dropTime: shortTime(r.drop_time),
    pickBy: r.pick_by,
    pickTime: shortTime(r.pick_time),
  }));
  const shared = members.filter((m) => m.is_shared).map((m) => m.id);
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? "";
  const dayName = local.setLocale("nb").toFormat("cccc d. LLLL");

  const line = (e: UpcomingEvent) => (e.allDay ? e.title : `${osloTime(e.start)} ${e.title}`);

  return notify(
    "morning",
    (memberId) => {
      const mine = memberId ? events.filter((e) => e.participantIds.includes(memberId) || e.participantIds.some((p) => shared.includes(p))) : events;
      const myTasks = (tasks ?? []).filter((t) => !memberId || t.assignee_id === memberId || !t.assignee_id);
      const careLines = memberId
        ? members.flatMap((child) => {
            const p = planForDate(plans, child.id, date);
            if (!p) return [];
            return [
              p.dropBy === memberId ? `Du leverer ${child.name}${p.dropTime ? ` ${p.dropTime}` : ""}` : null,
              p.pickBy === memberId ? `Du henter ${child.name}${p.pickTime ? ` ${p.pickTime}` : ""}` : null,
            ].filter((x): x is string => !!x);
          })
        : [];
      const parts = [
        mine.length ? mine.slice(0, 5).map(line).join(" · ") + (mine.length > 5 ? ` (+${mine.length - 5})` : "") : "Ingenting i kalenderen",
        ...careLines,
        myTasks.length ? (myTasks.length === 1 ? `Husk: ${myTasks[0].title}` : `${myTasks.length} oppgaver med frist`) : null,
      ].filter(Boolean);
      const who = memberId ? nameOf(memberId) : "familien";
      return { title: `☀️ God morgen${memberId ? `, ${who}` : ""} – ${dayName}`, body: parts.join("\n"), url: "/i-dag", tag: "morning" };
    },
    { targets: null, ignoreQuiet: true }
  );
}

