import { DateTime } from "luxon";
import { allDayRangeToUtc } from "@/lib/calendar/dates";
import { TIME_ZONE } from "@/lib/time";

/**
 * Oversetting mellom en aktivitet i appen og en hendelse i Outlook (Microsoft Graph).
 * Rene funksjoner uten nettverk, slik at de kan testes.
 *
 * - Deltakerne skrives som et tillegg i tittelen: «Fotball (Edvard, Olav)». Kun Felles gir ingen parentes.
 * - Kategorien blir Outlook-kategorien med samme navn (eller `outlook_category`).
 * - Appens id sendes som `transactionId`, så vi kjenner igjen våre egne hendelser når de kommer tilbake.
 */

export interface MemberRef {
  id: string;
  name: string;
  isShared: boolean;
}

export interface CategoryRef {
  id: string;
  name: string;
  outlookCategory: string | null;
}

export interface AppEventData {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  categoryId: string | null;
  participantIds: string[];
}

export interface GraphDateTime {
  dateTime: string;
  timeZone: string;
}

export interface GraphEvent {
  id: string;
  changeKey?: string;
  iCalUId?: string;
  seriesMasterId?: string | null;
  type?: "singleInstance" | "occurrence" | "exception" | "seriesMaster";
  transactionId?: string | null;
  subject?: string | null;
  body?: { contentType?: string; content?: string } | null;
  start?: GraphDateTime;
  end?: GraphDateTime;
  isAllDay?: boolean;
  isCancelled?: boolean;
  location?: { displayName?: string } | null;
  categories?: string[];
  lastModifiedDateTime?: string;
  "@removed"?: { reason?: string };
}

const MAX_TITLE = 200;
const MAX_NOTES = 2000;
const LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";

const norm = (s: string) => s.trim().toLocaleLowerCase("nb");

export const outlookCategoryName = (c: CategoryRef) => c.outlookCategory?.trim() || c.name;

/** «Fotball» + [Edvard, Olav] → «Fotball (Edvard, Olav)». Navnene kommer i samme rekkefølge som `members`. */
export function outlookTitle(title: string, participantIds: string[], members: MemberRef[]): string {
  const chosen = members.filter((m) => participantIds.includes(m.id));
  const named = chosen.filter((m) => !m.isShared);
  if (named.length === 0) return title;
  return `${title} (${named.map((m) => m.name).join(", ")})`;
}

/**
 * Leser deltakerne fra slutten av tittelen. Bare hvis ALLE navnene i parentesen er familiemedlemmer,
 * ellers er parentesen en del av tittelen (f.eks. «Møte (zoom)»).
 */
export function parseOutlookTitle(subject: string, members: MemberRef[]): { title: string; participantIds: string[] | null } {
  const clean = subject.trim();
  const m = clean.match(/^(.*\S)\s*\(([^()]+)\)\s*$/);
  if (!m) return { title: clean, participantIds: null };
  const parts = m[2]
    .split(/,|\s+og\s+|\s*&\s*|\s*\+\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const ids: string[] = [];
  for (const part of parts) {
    const member = members.find((x) => norm(x.name) === norm(part));
    if (!member) return { title: clean, participantIds: null };
    if (!ids.includes(member.id)) ids.push(member.id);
  }
  return ids.length ? { title: m[1].trim(), participantIds: ids } : { title: clean, participantIds: null };
}

function toOsloLocal(iso: string): string {
  return DateTime.fromISO(iso).setZone(TIME_ZONE).toFormat(LOCAL_FORMAT);
}

/** Body til POST/PATCH mot Graph. */
export function toGraphEvent(ev: AppEventData & { id?: string }, members: MemberRef[], categories: CategoryRef[]) {
  const category = categories.find((c) => c.id === ev.categoryId);
  return {
    subject: outlookTitle(ev.title, ev.participantIds, members),
    body: { contentType: "text", content: ev.notes ?? "" },
    start: { dateTime: toOsloLocal(ev.start), timeZone: TIME_ZONE },
    end: { dateTime: toOsloLocal(ev.end), timeZone: TIME_ZONE },
    isAllDay: ev.allDay,
    location: { displayName: ev.location ?? "" },
    categories: category ? [outlookCategoryName(category)] : [],
    ...(ev.id ? { transactionId: ev.id } : {}),
  };
}

/** Tidspunkt fra Graph («2026-10-14T08:00:00.0000000» + tidssone) → ISO i UTC. */
export function graphTimeToUtc(t: GraphDateTime): DateTime {
  const zone = !t.timeZone || /^(utc|gmt|coordinated universal time)$/i.test(t.timeZone) ? "utc" : TIME_ZONE;
  return DateTime.fromISO(t.dateTime.slice(0, 19), { zone });
}

/** Oslo-datoen et heldagstidspunkt hører til. Tåler både «flytende» midnatt og midnatt omregnet til UTC. */
function allDayDate(t: GraphDateTime): string {
  return graphTimeToUtc(t).setZone(TIME_ZONE).plus({ hours: 6 }).toISODate()!;
}

/**
 * Innholdet slik det ser ut i Outlook, normalisert til én streng. Brukes til å se om en hendelse faktisk er
 * endret, fordi Outlook ofte bytter changeKey uten at noe synlig er endret (særlig rett etter at den er laget).
 * Samme resultat for det vi sender (Oslo-tid, ren tekst) og det Graph sender tilbake (UTC, ev. HTML).
 */
export function outlookFingerprint(g: {
  subject?: string | null;
  start?: GraphDateTime;
  end?: GraphDateTime;
  isAllDay?: boolean;
  location?: { displayName?: string } | null;
  body?: { contentType?: string; content?: string } | null;
  categories?: string[];
}): string {
  const time = (t: GraphDateTime | undefined) => (!t ? "" : g.isAllDay ? allDayDate(t) : String(graphTimeToUtc(t).toMillis()));
  const squash = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();
  return JSON.stringify([
    squash(g.subject),
    time(g.start),
    time(g.end),
    !!g.isAllDay,
    squash(g.location?.displayName),
    squash(g.body?.content ? stripHtml(g.body.content, g.body.contentType) : ""),
    [...(g.categories ?? [])].map((c) => c.toLocaleLowerCase("nb")).sort(),
  ]);
}

/** Finner appens kategori ut fra Outlook-kategoriene. Null hvis ingen passer. */
export function categoryFromOutlook(names: string[] | undefined, categories: CategoryRef[]): string | null {
  for (const n of names ?? []) {
    const hit = categories.find((c) => norm(outlookCategoryName(c)) === norm(n) || norm(c.name) === norm(n));
    if (hit) return hit.id;
  }
  return null;
}

/**
 * En hendelse fra Outlook → feltene i appen. `current` er aktiviteten slik den er i appen nå (hvis den finnes):
 * deltakere og kategori beholdes når Outlook ikke sier noe annet.
 */
export function fromGraphEvent(
  g: GraphEvent,
  ctx: {
    members: MemberRef[];
    categories: CategoryRef[];
    current?: { participantIds: string[]; categoryId: string | null; notes?: string | null; location?: string | null } | null;
  }
): AppEventData | null {
  if (!g.start || !g.end) return null;
  const parsed = parseOutlookTitle(g.subject?.trim() || "(uten tittel)", ctx.members);
  const felles = ctx.members.find((m) => m.isShared)?.id;

  let start: string;
  let end: string;
  if (g.isAllDay) {
    const first = allDayDate(g.start);
    const endExclusive = allDayDate(g.end);
    const last = DateTime.fromISO(endExclusive).minus({ days: 1 }).toISODate()!;
    const range = allDayRangeToUtc(first, last < first ? first : last);
    if (!range) return null;
    ({ start, end } = range);
  } else {
    const s = graphTimeToUtc(g.start);
    const e = graphTimeToUtc(g.end);
    if (!s.isValid || !e.isValid) return null;
    start = s.toUTC().toISO()!;
    end = (e < s ? s : e).toUTC().toISO()!;
  }

  const participantIds = parsed.participantIds ?? (ctx.current?.participantIds.length ? ctx.current.participantIds : felles ? [felles] : []);
  const outlookCategory = categoryFromOutlook(g.categories, ctx.categories);
  const fallbackCategory = ctx.categories.find((c) => c.name === "Annet")?.id ?? null;
  // Felt Outlook ikke sender med (undefined) beholdes fra appen i stedet for å tømmes.
  const notes =
    g.body === undefined
      ? (ctx.current?.notes ?? null)
      : g.body?.content?.trim()
        ? stripHtml(g.body.content, g.body.contentType).slice(0, MAX_NOTES)
        : null;
  const location =
    g.location === undefined ? (ctx.current?.location ?? null) : g.location?.displayName?.trim() ? g.location.displayName.trim().slice(0, 200) : null;

  return {
    title: parsed.title.slice(0, MAX_TITLE),
    start,
    end,
    allDay: !!g.isAllDay,
    location,
    notes: notes || null,
    categoryId: outlookCategory ?? (ctx.current ? ctx.current.categoryId : fallbackCategory),
    participantIds,
  };
}

function stripHtml(content: string, contentType?: string): string {
  if (contentType?.toLowerCase() !== "html") return content.trim();
  return content
    .replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Nærmeste Outlook-fargepreset for en hex-farge (for kategoriene i Outlook). */
export function presetForColor(hex: string): string {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return "preset12";
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 0.12) return "preset12"; // grå
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 15 || h >= 345) return "preset0"; // rød
  if (h < 40) return "preset1"; // oransje
  if (h < 65) return "preset3"; // gul
  if (h < 160) return "preset4"; // grønn
  if (h < 200) return "preset5"; // turkis
  if (h < 255) return "preset7"; // blå
  if (h < 300) return "preset8"; // lilla
  return "preset9"; // tranebær
}
