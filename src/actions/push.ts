"use server";

import { z } from "zod";
import type { Json } from "@/lib/database.types";
import { pushPrefsSchema, readPushPrefs, type PushPrefs } from "@/lib/push/settings";
import { SUB_COLUMNS, sendToSubscription, toSub } from "@/lib/push/send";
import { requireFamily } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushSubscriptionSchema, type PushSubscriptionInput } from "@/lib/validation/push";

// Enhetene ligger i en hemmelig tabell (ingen RLS-policyer), så handlingene bruker admin-klienten etter requireFamily.
// Endpoint (adressen varselet sendes til) sendes aldri til nettleseren for andre enheter enn den man står på.

export interface PushResult {
  ok: boolean;
  message?: string;
}

/** En enhet slik Innstillinger viser den. Hver enhet har egne valg. */
export interface PushDevice {
  id: string;
  memberId: string | null;
  device: string | null;
  prefs: PushPrefs;
  createdAt: string;
  lastSentAt: string | null;
}

const DEVICE_COLUMNS = "id, member_id, device, prefs, created_at, last_sent_at";

function toDevice(d: { id: string; member_id: string | null; device: string | null; prefs: unknown; created_at: string; last_sent_at: string | null }): PushDevice {
  return { id: d.id, memberId: d.member_id, device: d.device, prefs: readPushPrefs(d.prefs), createdAt: d.created_at, lastSentAt: d.last_sent_at };
}

/** Slår på varsler for denne enheten. Finnes den fra før (samme endpoint), beholdes valgene. */
export async function subscribePush(input: PushSubscriptionInput): Promise<PushResult & { device?: PushDevice }> {
  const session = await requireFamily();
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { endpoint, keys, memberId, device } = parsed.data;
  if (memberId && !session.members.some((m) => m.id === memberId)) return { ok: false, message: "Ukjent person" };
  const { data, error } = await createAdminClient()
    .from("push_subscriptions")
    .upsert({ endpoint, p256dh: keys.p256dh, auth: keys.auth, member_id: memberId, device }, { onConflict: "endpoint" })
    .select(DEVICE_COLUMNS)
    .single();
  if (error || !data) return { ok: false, message: "Kunne ikke slå på varsler. Er SQL-en for pushvarsler kjørt?" };
  return { ok: true, message: "Varsler er slått på", device: toDevice(data) };
}

/** Denne enheten, slik den er lagret (null hvis den ikke har varsler på serveren). */
export async function getPushDevice(endpoint: string): Promise<PushDevice | null> {
  await requireFamily();
  if (!z.url().safeParse(endpoint).success) return null;
  const { data } = await createAdminClient().from("push_subscriptions").select(DEVICE_COLUMNS).eq("endpoint", endpoint).maybeSingle();
  return data ? toDevice(data) : null;
}

export async function listPushDevices(): Promise<PushDevice[]> {
  await requireFamily();
  const { data, error } = await createAdminClient().from("push_subscriptions").select(DEVICE_COLUMNS).order("created_at");
  if (error) return [];
  return (data ?? []).map(toDevice);
}

const updateSchema = z.object({
  id: z.uuid(),
  memberId: z.uuid().nullable(),
  prefs: pushPrefsSchema,
});

/** Lagrer valgene for én enhet (hvem den tilhører og hva den får). Brukes for alle enheter fra Innstillinger. */
export async function updatePushDevice(input: z.input<typeof updateSchema>): Promise<PushResult> {
  const session = await requireFamily();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { id, memberId, prefs } = parsed.data;
  if (memberId && !session.members.some((m) => m.id === memberId)) return { ok: false, message: "Ukjent person" };
  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .update({ member_id: memberId, prefs: prefs as unknown as Json })
    .eq("id", id);
  return error ? { ok: false, message: "Kunne ikke lagre" } : { ok: true };
}

export async function unsubscribePush(endpoint: string): Promise<PushResult> {
  await requireFamily();
  if (!z.url().safeParse(endpoint).success) return { ok: false, message: "Ugyldig enhet" };
  await createAdminClient().from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true, message: "Varsler er slått av på denne enheten" };
}

/** Fjerner en enhet fra listen i Innstillinger. */
export async function removePushDevice(id: string): Promise<PushResult> {
  await requireFamily();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Ugyldig enhet" };
  const { error } = await createAdminClient().from("push_subscriptions").delete().eq("id", id);
  return error ? { ok: false, message: "Kunne ikke fjerne enheten" } : { ok: true, message: "Enheten er fjernet" };
}

/** Sender et testvarsel til en enhet (uansett valg og stille tid). */
export async function sendTestPush(id: string): Promise<PushResult> {
  const session = await requireFamily();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Ugyldig enhet" };
  const db = createAdminClient();
  const { data } = await db.from("push_subscriptions").select(SUB_COLUMNS).eq("id", id).maybeSingle();
  if (!data) return { ok: false, message: "Fant ikke enheten – slå på varsler igjen" };
  const ok = await sendToSubscription(db, toSub(data), {
    title: "🔔 Testvarsel fra Familien",
    body: `Sendt av ${session.activeMember?.name ?? "Familien"}. Varsler virker på denne enheten.`,
    url: "/innstillinger#varsler",
  });
  return ok ? { ok: true, message: "Testvarsel sendt" } : { ok: false, message: "Kunne ikke sende testvarselet" };
}
