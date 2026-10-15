"use server";

import { z } from "zod";
import { pushSettingsSchema, type PushSettings } from "@/lib/push/settings";
import { loadPushSettings, savePushSettingsValue, sendToSubscription } from "@/lib/push/send";
import { requireFamily } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushSubscriptionSchema, type PushSubscriptionInput } from "@/lib/validation/push";

// Enhetene ligger i en hemmelig tabell (ingen RLS-policyer), så handlingene bruker admin-klienten etter requireFamily.

export interface PushResult {
  ok: boolean;
  message?: string;
}

export interface PushDevice {
  id: string;
  memberId: string | null;
  device: string | null;
  createdAt: string;
  lastSentAt: string | null;
}

/** Slår på varsler for denne enheten (eller oppdaterer hvem den tilhører). */
export async function subscribePush(input: PushSubscriptionInput): Promise<PushResult & { id?: string }> {
  const session = await requireFamily();
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { endpoint, keys, memberId, device } = parsed.data;
  if (memberId && !session.members.some((m) => m.id === memberId)) return { ok: false, message: "Ukjent person" };
  const db = createAdminClient();
  const { data, error } = await db
    .from("push_subscriptions")
    .upsert({ endpoint, p256dh: keys.p256dh, auth: keys.auth, member_id: memberId, device }, { onConflict: "endpoint" })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: "Kunne ikke slå på varsler. Er SQL-en for pushvarsler kjørt?" };
  return { ok: true, message: "Varsler er slått på", id: data.id };
}

/** Denne enheten, slik den er lagret (null hvis den ikke har varsler på serveren). */
export async function getPushDevice(endpoint: string): Promise<{ id: string; memberId: string | null } | null> {
  await requireFamily();
  if (!z.url().safeParse(endpoint).success) return null;
  const { data } = await createAdminClient().from("push_subscriptions").select("id, member_id").eq("endpoint", endpoint).maybeSingle();
  return data ? { id: data.id, memberId: data.member_id } : null;
}

/** Bytter hvem enheten får varsler for. */
export async function setPushMember(endpoint: string, memberId: string | null): Promise<PushResult> {
  const session = await requireFamily();
  if (!z.url().safeParse(endpoint).success || (memberId && !session.members.some((m) => m.id === memberId))) {
    return { ok: false, message: "Ugyldig valg" };
  }
  const { error } = await createAdminClient().from("push_subscriptions").update({ member_id: memberId }).eq("endpoint", endpoint);
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

export async function listPushDevices(): Promise<PushDevice[]> {
  await requireFamily();
  const { data, error } = await createAdminClient()
    .from("push_subscriptions")
    .select("id, member_id, device, created_at, last_sent_at")
    .order("created_at");
  if (error) return [];
  return (data ?? []).map((d) => ({ id: d.id, memberId: d.member_id, device: d.device, createdAt: d.created_at, lastSentAt: d.last_sent_at }));
}

/** Sender et testvarsel til denne enheten. */
export async function sendTestPush(endpoint: string): Promise<PushResult> {
  const session = await requireFamily();
  if (!z.url().safeParse(endpoint).success) return { ok: false, message: "Ugyldig enhet" };
  const db = createAdminClient();
  const { data: sub } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth, member_id").eq("endpoint", endpoint).maybeSingle();
  if (!sub) return { ok: false, message: "Fant ikke enheten – slå på varsler igjen" };
  const ok = await sendToSubscription(
    db,
    { id: sub.id, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, memberId: sub.member_id },
    { title: "🔔 Testvarsel fra Familien", body: `Hei${session.activeMember ? ` ${session.activeMember.name}` : ""}! Varsler virker på denne enheten.`, url: "/innstillinger#varsler" }
  );
  return ok ? { ok: true, message: "Testvarsel sendt" } : { ok: false, message: "Kunne ikke sende testvarselet" };
}

export async function getPushSettings(): Promise<PushSettings> {
  await requireFamily();
  return loadPushSettings();
}

/** «Hva sendes» i Innstillinger. Lagres automatisk. */
export async function savePushSettings(input: PushSettings): Promise<PushResult> {
  const session = await requireFamily();
  const parsed = pushSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const ids = new Set(session.members.map((m) => m.id));
  if (Object.values(parsed.data.types).some((t) => t.members.some((id) => !ids.has(id)))) return { ok: false, message: "Ukjent person" };
  const ok = await savePushSettingsValue(createAdminClient(), parsed.data);
  return ok ? { ok: true } : { ok: false, message: "Kunne ikke lagre innstillingene" };
}
