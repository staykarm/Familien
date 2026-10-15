import { DateTime } from "luxon";
import { z } from "zod";
import { TIME_ZONE } from "@/lib/time";

/**
 * Pushvarsler: hvilke typer som sendes, og til hvem. Lagres i `settings` (nøkkel «push») og styres i Innstillinger.
 * Rene funksjoner; sendingen ligger i send.ts og jobbene i cron-ruten.
 */

export const PUSH_TYPES = [
  { key: "calendar", label: "Endringer i kalenderen", hint: "Når noen legger til, endrer eller sletter en aktivitet du er med på." },
  { key: "outlook", label: "Nytt fra Outlook", hint: "Når en aktivitet kommer inn eller endres i Outlook." },
  { key: "reminder", label: "Påminnelse før aktiviteter", hint: "Litt før aktiviteter med klokkeslett starter." },
  { key: "morning", label: "Morgenoversikt", hint: "Hva du har i dag, og oppgaver med frist." },
  { key: "care", label: "Levering og henting", hint: "Påminnelse til den som skal levere eller hente." },
  { key: "tasks", label: "Oppgaver", hint: "Når noen gir deg en oppgave." },
  { key: "shopping", label: "Handlelisten", hint: "Når noen legger til varer." },
  { key: "files", label: "Les inn fil", hint: "Når forslag fra en innlest fil er klare." },
  { key: "sync", label: "Feil i Outlook-synken", hint: "Når synken mot Outlook feiler." },
] as const;

export type PushType = (typeof PUSH_TYPES)[number]["key"];
export const PUSH_TYPE_KEYS = PUSH_TYPES.map((t) => t.key) as [PushType, ...PushType[]];

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Skriv klokkeslett som tt:mm");

const typeSchema = z.object({
  enabled: z.boolean(),
  /** Hvem som får denne typen på sine enheter. Enheter for «hele familien» får alt som er slått på. */
  members: z.array(z.uuid()).max(20),
});

export const pushSettingsSchema = z.object({
  types: z.record(z.enum(PUSH_TYPE_KEYS), typeSchema),
  /** Minutter før aktiviteter. */
  reminderMinutes: z.number().int().min(5, "Minst 5 minutter").max(240, "Maks 4 timer"),
  /** Minutter før levering/henting. */
  careMinutes: z.number().int().min(5, "Minst 5 minutter").max(120, "Maks 2 timer"),
  morningTime: hhmm,
  quiet: z.object({ enabled: z.boolean(), from: hhmm, to: hhmm }),
});

export type PushSettings = z.infer<typeof pushSettingsSchema>;
export type PushTypeSettings = z.infer<typeof typeSchema>;

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

/** Standard: alle (unntatt Felles) får det som er slått på. */
export function defaultPushSettings(memberIds: string[]): PushSettings {
  return {
    types: Object.fromEntries(PUSH_TYPE_KEYS.map((k) => [k, { enabled: DEFAULT_ON[k], members: memberIds }])) as PushSettings["types"],
    reminderMinutes: 30,
    careMinutes: 15,
    morningTime: "07:00",
    quiet: { enabled: true, from: "22:00", to: "07:00" },
  };
}

/** Lagret verdi, fylt ut med standardverdier for det som mangler (f.eks. nye typer). */
export function readPushSettings(raw: unknown, memberIds: string[]): PushSettings {
  const base = defaultPushSettings(memberIds);
  const obj = (raw && typeof raw === "object" ? raw : {}) as Partial<PushSettings>;
  const merged = {
    ...base,
    ...obj,
    quiet: { ...base.quiet, ...(obj.quiet ?? {}) },
    types: { ...base.types, ...(obj.types ?? {}) },
  };
  const parsed = pushSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : base;
}

const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Er det stille tid nå (Oslo)? Perioden kan gå over midnatt, f.eks. 22:00–07:00. */
export function inQuietHours(quiet: PushSettings["quiet"], now: Date): boolean {
  if (!quiet.enabled || quiet.from === quiet.to) return false;
  const local = DateTime.fromJSDate(now).setZone(TIME_ZONE);
  const m = local.hour * 60 + local.minute;
  const from = minutesOf(quiet.from);
  const to = minutesOf(quiet.to);
  return from < to ? m >= from && m < to : m >= from || m < to;
}

/**
 * Hvilke enheter får et varsel? `targets` er medlemmene det gjelder (null = alle).
 * Personlige enheter må høre til et medlem som både er mål og har typen slått på.
 * Enheter for hele familien (uten medlem) får alt som er slått på. Den som gjorde endringen, får ikke varsel.
 */
export function pickRecipients<S extends { memberId: string | null }>(
  subs: S[],
  type: PushTypeSettings,
  targets: string[] | null,
  exclude: string | null = null
): S[] {
  if (!type.enabled) return [];
  return subs.filter((s) => {
    if (s.memberId === null) return true;
    if (s.memberId === exclude) return false;
    if (!type.members.includes(s.memberId)) return false;
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
