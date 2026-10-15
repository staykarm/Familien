import "server-only";
import { after } from "next/server";
import webpush from "web-push";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import type { Json } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { inQuietHours, pickRecipients, readPushSettings, type PushSettings, type PushType } from "./settings";

type Db = ReturnType<typeof createAdminClient>;

export const PUSH_SETTINGS_KEY = "push";

/** Det som vises i varselet. `url` åpnes når man trykker på det. */
export interface PushMessage {
  title: string;
  body: string;
  url?: string;
  /** Varsler med samme tag erstatter hverandre i stedet for å hope seg opp. */
  tag?: string;
}

export interface PushSub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  memberId: string | null;
}

/** VAPID-nøklene. Lages automatisk første gang og lagres (privatnøkkelen kryptert) i push_keys. */
async function vapidKeys(db: Db): Promise<{ publicKey: string; privateKey: string }> {
  const { data } = await db.from("push_keys").select("public_key, private_key_encrypted").eq("id", 1).maybeSingle();
  if (data) return { publicKey: data.public_key, privateKey: decryptSecret(data.private_key_encrypted) };
  const keys = webpush.generateVAPIDKeys();
  // To samtidige kall: den første vinner, og begge leser den lagrede raden.
  await db.from("push_keys").upsert(
    { id: 1, public_key: keys.publicKey, private_key_encrypted: encryptSecret(keys.privateKey) },
    { onConflict: "id", ignoreDuplicates: true }
  );
  const { data: saved } = await db.from("push_keys").select("public_key, private_key_encrypted").eq("id", 1).single();
  if (!saved) throw new Error("Kunne ikke lagre nøklene for pushvarsler");
  return { publicKey: saved.public_key, privateKey: decryptSecret(saved.private_key_encrypted) };
}

/** Den offentlige nøkkelen nettleseren trenger for å slå på varsler. Null hvis tabellene mangler (SQL ikke kjørt). */
export async function pushPublicKey(): Promise<string | null> {
  try {
    return (await vapidKeys(createAdminClient())).publicKey;
  } catch (err) {
    console.warn("Pushvarsler er ikke klare", err);
    return null;
  }
}

/** Innstillingene for varsler, med standardverdier (alle unntatt Felles får det som er på). */
export async function loadPushSettings(db: Db = createAdminClient()): Promise<PushSettings> {
  const [{ data }, { data: members }] = await Promise.all([
    db.from("settings").select("value").eq("key", PUSH_SETTINGS_KEY).maybeSingle(),
    db.from("members").select("id").eq("is_shared", false).order("sort_order"),
  ]);
  return readPushSettings(data?.value, (members ?? []).map((m) => m.id));
}

export async function savePushSettingsValue(db: Db, settings: PushSettings): Promise<boolean> {
  const { error } = await db.from("settings").upsert({ key: PUSH_SETTINGS_KEY, value: settings as unknown as Json });
  return !error;
}

async function loadSubscriptions(db: Db): Promise<PushSub[]> {
  const { data } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth, member_id");
  return (data ?? []).map((s) => ({ id: s.id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, memberId: s.member_id }));
}

function vapidSubject(): string {
  const email = process.env.MET_CONTACT_EMAIL;
  return email ? `mailto:${email}` : "https://github.com/staykarm/familien";
}

/** Sender til én enhet. Enheter som ikke finnes lenger (404/410), fjernes. */
export async function sendToSubscription(db: Db, sub: PushSub, message: PushMessage): Promise<boolean> {
  const keys = await vapidKeys(db);
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ ...message, url: message.url ?? "/i-dag" }),
      { vapidDetails: { subject: vapidSubject(), ...keys }, TTL: 60 * 60 * 6, urgency: "normal" }
    );
    await db.from("push_subscriptions").update({ last_sent_at: new Date().toISOString() }).eq("id", sub.id);
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("id", sub.id);
    else console.warn("Pushvarsel feilet", status, err);
    return false;
  }
}

export interface NotifyOptions {
  /** Medlemmene det gjelder. Null = hele familien. */
  targets?: string[] | null;
  /** Den som gjorde endringen – får ikke varsel om sin egen endring. */
  exclude?: string | null;
  /** Sendes også i stille tid (f.eks. morgenoversikten på valgt klokkeslett). */
  ignoreQuiet?: boolean;
}

/**
 * Sender et varsel av en gitt type til dem innstillingene sier. `message` kan være en funksjon som lager
 * en egen tekst per medlem (null = enheten for hele familien); returnerer den null, hoppes enheten over.
 * Returnerer antall enheter som fikk varselet.
 */
export async function notify(
  type: PushType,
  message: PushMessage | ((memberId: string | null) => PushMessage | null),
  opts: NotifyOptions = {}
): Promise<number> {
  const db = createAdminClient();
  const settings = await loadPushSettings(db);
  if (!opts.ignoreQuiet && inQuietHours(settings.quiet, new Date())) return 0;
  const recipients = pickRecipients(await loadSubscriptions(db), settings.types[type], opts.targets ?? null, opts.exclude ?? null);
  const results = await Promise.all(
    recipients.map((sub) => {
      const msg = typeof message === "function" ? message(sub.memberId) : message;
      return msg ? sendToSubscription(db, sub, msg) : false;
    })
  );
  return results.filter(Boolean).length;
}

/** Som notify, men etter at svaret er sendt, og uten å kaste. Brukes fra server actions. */
export function notifyLater(type: PushType, message: Parameters<typeof notify>[1], opts: NotifyOptions = {}): void {
  after(async () => {
    try {
      await notify(type, message, opts);
    } catch (err) {
      console.warn("Kunne ikke sende pushvarsel", err);
    }
  });
}

/** Sant første gang en nøkkel brukes – så samme påminnelse ikke sendes to ganger. */
export async function claimOnce(db: Db, key: string): Promise<boolean> {
  const { error } = await db.from("push_log").insert({ key });
  return !error;
}
