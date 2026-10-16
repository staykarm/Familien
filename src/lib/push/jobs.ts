import "server-only";
import { DateTime } from "luxon";
import { careFor, PART_LABEL, toCareEntry, type CareData } from "@/lib/care/plan";
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

/** Levering og henting registrert for denne datoen. */
async function loadCareData(db: Db, date: string): Promise<CareData> {
  const { data, error } = await db
    .from("care_entries")
    .select("member_id, date, drop_by, drop_time, pick_by, pick_time")
    .eq("date", date);
  return { entries: error ? [] : (data ?? []).map(toCareEntry) };
}

/** Påminnelse til den som skal levere eller hente. */
async function care(db: Db, subs: PushSub[], members: MemberRow[], now: Date): Promise<number> {
  const wanting = subs.filter((s) => s.prefs.types.care);
  if (!wanting.length) return 0;
  const date = DateTime.fromJSDate(now).setZone(TIME_ZONE).toISODate()!;
  const data = await loadCareData(db, date);
  let sent = 0;
  for (const child of members) {
    const day = careFor(data, child.id, date);
    for (const slot of [day?.drop, day?.pick]) {
      if (!slot?.by || !slot.time) continue;
      const at = DateTime.fromISO(`${date}T${slot.time}`, { zone: TIME_ZONE });
      const diff = at.toMillis() - now.getTime();
      if (diff <= 0) continue;
      const start = at.toUTC().toISO()!;
      const who = members.find((m) => m.id === slot.by)?.name ?? "";
      const verb = PART_LABEL[slot.part].verb;
      for (const sub of wanting) {
        if (diff > sub.prefs.careMinutes * 60_000) continue;
        sent += await sendOnce(db, sub, "care", { targets: [slot.by] }, now, `care:${child.id}:${date}:${slot.part}`, {
          // Felles enhet: si hvem som skal levere/hente.
          title: sub.memberId ? `🚸 Du skal ${verb} ${child.name} kl. ${slot.time}` : `🚸 ${who} skal ${verb} ${child.name} kl. ${slot.time}`,
          body: `Om ${inMinutes(start, now).slice(3)}`,
          url: "/henting",
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
      const day = careFor(careData, child.id, date);
      return [day?.drop, day?.pick].flatMap((slot) => {
        if (!slot?.by || (memberId && slot.by !== memberId)) return [];
        const verb = slot.part === "drop" ? "leverer" : "henter";
        return [`${memberId ? "Du" : nameOf(slot.by)} ${verb} ${child.name}${slot.time ? ` ${slot.time}` : ""}`];
      });
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
