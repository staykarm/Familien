import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Member } from "@/lib/session";
import { eventTargets } from "./settings";
import { claimOnce, notify, notifyLater } from "./send";
import { namesText, whenText } from "./text";

/**
 * Varsler fra server actions. Alt sendes etter at svaret er gitt (notifyLater), og feil stopper aldri selve handlingen.
 */

const sharedIds = (members: Member[]) => members.filter((m) => m.is_shared).map((m) => m.id);
const nameOf = (members: Member[], id: string | null | undefined) => members.find((m) => m.id === id)?.name ?? null;

/** «Marius la inn» / «Lagt inn». */
const byLine = (verb: string, actor: Member | null) => (actor ? `${actor.name} ${verb}` : verb[0].toUpperCase() + verb.slice(1));

export function notifyEventSaved(
  e: { title: string; participantIds: string[]; start: string; allDay: boolean },
  opts: { isNew: boolean; count?: number; actor: Member | null; members: Member[] }
) {
  const who = namesText(e.participantIds.filter((id) => !sharedIds(opts.members).includes(id)).map((id) => nameOf(opts.members, id) ?? ""));
  const when = opts.count && opts.count > 1 ? `${opts.count} ganger fra ${whenText(e.start, e.allDay)}` : whenText(e.start, e.allDay);
  notifyLater(
    "calendar",
    {
      title: `📅 ${byLine(opts.isNew ? "la inn" : "endret", opts.actor)} «${e.title}»`,
      body: [when, who].filter(Boolean).join(" · "),
      url: "/",
    },
    { targets: eventTargets(e.participantIds, sharedIds(opts.members)), exclude: opts.actor?.id ?? null }
  );
}

/** Kalles etter angrefristen (allerede i bakgrunnen), så den sender med en gang. */
export async function notifyEventsDeleted(
  events: { title: string; participantIds: string[]; start: string; allDay: boolean }[],
  opts: { actor: Member | null; members: Member[] }
): Promise<void> {
  if (!events.length) return;
  const first = events[0];
  const participants = [...new Set(events.flatMap((e) => e.participantIds))];
  await notify(
    "calendar",
    {
      title: `🗑️ ${byLine("slettet", opts.actor)} «${first.title}»`,
      body: events.length > 1 ? `${events.length} aktiviteter fra ${whenText(first.start, first.allDay)}` : whenText(first.start, first.allDay),
      url: "/",
    },
    { targets: eventTargets(participants, sharedIds(opts.members)), exclude: opts.actor?.id ?? null }
  );
}

/** Hvor lenge vi venter før varsel om ny oppgave: dialogen lagrer mens man skriver, så tittelen skal være ferdig. */
const TASK_SETTLE_MS = 20_000;

/**
 * Ny ansvarlig for en oppgave. Venter litt og leser oppgaven på nytt, så varselet får den ferdige tittelen.
 * Sendes én gang per oppgave og person.
 */
export function notifyTaskAssigned(taskId: string, assigneeId: string, opts: { actor: Member | null }) {
  if (assigneeId === opts.actor?.id) return;
  after(async () => {
    try {
      await new Promise((r) => setTimeout(r, TASK_SETTLE_MS));
      const db = createAdminClient();
      const { data: task } = await db.from("tasks").select("title, assignee_id, due_date, status").eq("id", taskId).maybeSingle();
      if (!task || task.assignee_id !== assigneeId || task.status === "done") return;
      if (!(await claimOnce(db, `task:${taskId}:${assigneeId}`))) return;
      await notify(
        "tasks",
        {
          title: `✅ ${opts.actor ? `${opts.actor.name} ga deg en oppgave` : "Ny oppgave til deg"}`,
          body: task.due_date ? `${task.title} · frist ${whenText(`${task.due_date}T12:00:00`, true)}` : task.title,
          url: "/oppgaver",
        },
        { targets: [assigneeId], exclude: opts.actor?.id ?? null }
      );
    } catch (err) {
      console.warn("Kunne ikke sende pushvarsel", err);
    }
  });
}

export function notifyShopping(names: string[], opts: { actor: Member | null; template?: string }) {
  if (!names.length) return;
  const title = opts.template
    ? `🛒 ${byLine("la til", opts.actor)} «${opts.template}»`
    : `🛒 ${byLine("la til", opts.actor)} ${names.length === 1 ? `«${names[0]}»` : `${names.length} varer`}`;
  notifyLater(
    "shopping",
    { title, body: names.slice(0, 6).join(", ") + (names.length > 6 ? " …" : ""), url: "/handleliste", tag: "handleliste" },
    { targets: null, exclude: opts.actor?.id ?? null }
  );
}

export function notifyFileReady(filename: string, count: number, opts: { actor: Member | null }) {
  if (!count) return;
  notifyLater(
    "files",
    { title: `📄 ${count === 1 ? "1 forslag" : `${count} forslag`} er klare`, body: `Fra «${filename}» – godkjenn dem i «Les inn fil»`, url: "/filer" },
    { targets: null, exclude: opts.actor?.id ?? null }
  );
}

export interface OutlookChange {
  kind: "new" | "updated" | "deleted";
  title: string;
  start: string;
  allDay: boolean;
  participantIds: string[];
}

/** Maks antall enkeltvarsler per synk. Flere enn dette samles i ett. */
const MAX_OUTLOOK_SINGLE = 3;

/** Endringer som kom inn fra Outlook. Bare kommende aktiviteter; mange på en gang samles i ett varsel. */
export async function notifyOutlookChanges(changes: OutlookChange[]): Promise<void> {
  const now = Date.now();
  const upcoming = changes.filter((c) => Date.parse(c.start) >= now - 24 * 3600_000);
  if (!upcoming.length) return;
  const db = createAdminClient();
  const { data: members } = await db.from("members").select("id, is_shared");
  const shared = (members ?? []).filter((m) => m.is_shared).map((m) => m.id);
  const verb = { new: "Ny", updated: "Endret", deleted: "Slettet" } as const;

  if (upcoming.length > MAX_OUTLOOK_SINGLE) {
    await notify(
      "outlook",
      { title: `📅 ${upcoming.length} endringer fra Outlook`, body: upcoming.slice(0, 4).map((c) => c.title).join(", ") + " …", url: "/", tag: "outlook" },
      { targets: eventTargets([...new Set(upcoming.flatMap((c) => c.participantIds))], shared) }
    );
    return;
  }
  for (const c of upcoming) {
    await notify(
      "outlook",
      { title: `📅 ${verb[c.kind]} i Outlook: «${c.title}»`, body: whenText(c.start, c.allDay), url: "/" },
      { targets: eventTargets(c.participantIds, shared) }
    );
  }
}

/** Synken feilet. Maks ett varsel hver sjette time, så en vedvarende feil ikke maser. */
export async function notifySyncError(message: string): Promise<void> {
  const db = createAdminClient();
  const slot = Math.floor(Date.now() / (6 * 3600_000));
  if (!(await claimOnce(db, `sync-error:${slot}`))) return;
  await notify("sync", { title: "⚠️ Outlook-synken feilet", body: message.slice(0, 160), url: "/innstillinger#outlook" }, { targets: null });
}

/** Noen er satt opp til å levere eller hente en dag (fra barnets profil). */
export function notifyCareAssigned(
  p: { childName: string; part: "drop" | "pick"; date: string; time: string | null; by: string },
  opts: { actor: Member | null }
) {
  if (p.by === opts.actor?.id) return;
  const verb = p.part === "drop" ? "levere" : "hente";
  notifyLater(
    "care",
    {
      title: `🚸 Du skal ${verb} ${p.childName} ${whenText(`${p.date}T${p.time ?? "12:00"}:00`, !p.time)}`,
      body: opts.actor ? `Satt opp av ${opts.actor.name}` : "Endret i planen for levering og henting",
      url: "/i-dag",
    },
    { targets: [p.by], exclude: opts.actor?.id ?? null }
  );
}
