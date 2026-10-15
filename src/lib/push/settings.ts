import { DateTime } from "luxon";
import { z } from "zod";
import { TIME_ZONE } from "@/lib/time";

/**
 * Pushvarsler: hvilke typer en enhet får, og når. Hver enhet har sine egne valg (`push_subscriptions.prefs`),
 * og alle enhetene kan endres fra Innstillinger. Rene funksjoner; sendingen ligger i send.ts og jobbene i jobs.ts.
 */

export const PUSH_TYPES = [
  { key: "calendar", label: "Endringer i kalenderen", hint: "Når noen legger til, endrer eller sletter en aktivitet." },
  { key: "outlook", label: "Nytt fra Outlook", hint: "Når en aktivitet kommer inn eller endres i Outlook." },
  { key: "reminder", label: "Påminnelse før aktiviteter", hint: "Litt før aktiviteter med klokkeslett starter." },
  { key: "morning", label: "Morgenoversikt", hint: "Hva som skjer i dag, og oppgaver med frist." },
  { key: "care", label: "Henting", hint: "Påminnelse til den som skal hente, og når noen blir satt opp til å hente en dag." },
  { key: "tasks", label: "Oppgaver", hint: "Når noen gir en oppgave." },
  { key: "shopping", label: "Handlelisten", hint: "Når noen legger til varer." },
  { key: "files", label: "Les inn fil", hint: "Når forslag fra en innlest fil er klare." },
  { key: "sync", label: "Feil i Outlook-synken", hint: "Når synken mot Outlook feiler." },
] as const;

export type PushType = (typeof PUSH_TYPES)[number]["key"];
export const PUSH_TYPE_KEYS = PUSH_TYPES.map((t) => t.key) as [PushType, ...PushType[]];

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Skriv klokkeslett som tt:mm");

/** Valgene for én enhet. */
export const pushPrefsSchema = z.object({
  types: z.record(z.enum(PUSH_TYPE_KEYS), z.boolean()),
  /** Minutter før aktiviteter. */
  reminderMinutes: z.number().int().min(5, "Minst 5 minutter").max(240, "Maks 4 timer"),
  /** Minutter før henting. */
  careMinutes: z.number().int().min(5, "Minst 5 minutter").max(120, "Maks 2 timer"),
  morningTime: hhmm,
  quiet: z.object({ enabled: z.boolean(), from: hhmm, to: hhmm }),
});

export type PushPrefs = z.infer<typeof pushPrefsSchema>;

const DEFAULT_ON: Record<PushType, boolean> = {
  calendar: true,
  outlook: false,
  reminder: true,
  morning: true,
  care: true,
  tasks: true,
  shopping: false,
  files: true,
  sync: false,
};

export function defaultPushPrefs(): PushPrefs {
  return {
    types: { ...DEFAULT_ON },
    reminderMinutes: 30,
    careMinutes: 15,
    morningTime: "07:00",
    quiet: { enabled: true, from: "22:00", to: "07:00" },
  };
}

/** Lagret verdi, fylt ut med standardverdier for det som mangler (f.eks. nye typer). Ugyldig verdi gir standard. */
export function readPushPrefs(raw: unknown): PushPrefs {
  const base = defaultPushPrefs();
  const obj = (raw && typeof raw === "object" ? raw : {}) as Partial<PushPrefs>;
  const merged = {
    ...base,
    ...obj,
    quiet: { ...base.quiet, ...(obj.quiet ?? {}) },
    types: { ...base.types, ...(obj.types ?? {}) },
  };
  const parsed = pushPrefsSchema.safeParse(merged);
  return parsed.success ? parsed.data : base;
}

const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Er det stille tid nå (Oslo)? Perioden kan gå over midnatt, f.eks. 22:00–07:00. */
export function inQuietHours(quiet: PushPrefs["quiet"], now: Date): boolean {
  if (!quiet.enabled || quiet.from === quiet.to) return false;
  const local = DateTime.fromJSDate(now).setZone(TIME_ZONE);
  const m = local.hour * 60 + local.minute;
  const from = minutesOf(quiet.from);
  const to = minutesOf(quiet.to);
  return from < to ? m >= from && m < to : m >= from || m < to;
}

export interface RecipientOptions {
  /** Medlemmene det gjelder. Null = hele familien. */
  targets?: string[] | null;
  /** Den som gjorde endringen – får ikke varsel om sin egen endring. */
  exclude?: string | null;
  /** Sendes også i stille tid (f.eks. morgenoversikten på valgt klokkeslett). */
  ignoreQuiet?: boolean;
}

/**
 * Hvilke enheter får et varsel? Enheten må ha typen slått på og ikke ha stille tid.
 * Personlige enheter får bare det som gjelder personen; enheter for hele familien (uten medlem) får alt.
 * Den som gjorde endringen, får ikke varsel.
 */
export function pickRecipients<S extends { memberId: string | null; prefs: PushPrefs }>(
  subs: S[],
  type: PushType,
  opts: RecipientOptions,
  now: Date
): S[] {
  const targets = opts.targets ?? null;
  return subs.filter((s) => {
    if (!s.prefs.types[type]) return false;
    if (!opts.ignoreQuiet && inQuietHours(s.prefs.quiet, now)) return false;
    if (s.memberId === null) return true;
    if (opts.exclude && s.memberId === opts.exclude) return false;
    return targets === null || targets.includes(s.memberId);
  });
}

/** Deltakerne som skal varsles: Felles betyr hele familien. */
export function eventTargets(participantIds: string[], sharedIds: string[]): string[] | null {
  return participantIds.some((id) => sharedIds.includes(id)) ? null : participantIds;
}

export interface UpcomingEvent {
  id: string;
  title: string;
  start: string;
  allDay: boolean;
  participantIds: string[];
}

/**
 * Aktiviteter som skal ha påminnelse nå: starter innen `minutes` minutter og har ikke startet ennå.
 * Nøkkelen (id + start) gjør at hver påminnelse sendes én gang, også om cron går ofte eller tiden flyttes.
 * Den gjelder per enhet, så jobben legger enhetens id foran.
 */
export function dueReminders(events: UpcomingEvent[], minutes: number, now: Date): { event: UpcomingEvent; key: string }[] {
  const t = now.getTime();
  return events
    .filter((e) => !e.allDay)
    .filter((e) => {
      const start = Date.parse(e.start);
      return start > t && start - minutes * 60_000 <= t;
    })
    .map((event) => ({ event, key: `reminder:${event.id}:${event.start}` }));
}

/** Er det tid for morgenoversikten? Fra klokkeslettet og to timer framover (i tilfelle cron er forsinket). */
export function morningDue(morningTime: string, now: Date): boolean {
  const local = DateTime.fromJSDate(now).setZone(TIME_ZONE);
  const m = local.hour * 60 + local.minute;
  const at = minutesOf(morningTime);
  return m >= at && m < at + 120;
}

/** «Om 30 min» / «Om 1 t 15 min». */
export function inMinutes(start: string, now: Date): string {
  const min = Math.max(0, Math.round((Date.parse(start) - now.getTime()) / 60_000));
  if (min < 60) return `om ${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `om ${h} t ${rest} min` : `om ${h} t`;
}
