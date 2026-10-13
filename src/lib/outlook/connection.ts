import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import type { Database } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { OutlookAuthError, refreshTokens, type OutlookTokens } from "./auth";
import { GraphClient } from "./graph";

export type OutlookConnection = Database["public"]["Tables"]["outlook_connection"]["Row"];
type ConnectionUpdate = Database["public"]["Tables"]["outlook_connection"]["Update"];

export async function loadConnection(): Promise<OutlookConnection | null> {
  const db = createAdminClient();
  const { data } = await db.from("outlook_connection").select("*").eq("id", 1).maybeSingle();
  return data;
}

export async function updateConnection(patch: ConnectionUpdate): Promise<void> {
  const db = createAdminClient();
  await db.from("outlook_connection").update(patch).eq("id", 1);
}

export function encryptTokens(tokens: OutlookTokens): string {
  return encryptSecret(JSON.stringify(tokens));
}

/** Graph-klient for den lagrede koblingen. Fornyer og lagrer tokens automatisk. */
export function graphFor(conn: OutlookConnection): GraphClient {
  let tokens: OutlookTokens;
  try {
    tokens = JSON.parse(decryptSecret(conn.tokens_encrypted)) as OutlookTokens;
  } catch {
    throw new OutlookAuthError("Kunne ikke lese Outlook-innloggingen. Koble til Outlook på nytt.");
  }
  return new GraphClient(async (force) => {
    if (force || tokens.expiresAt - Date.now() < 5 * 60_000) {
      tokens = await refreshTokens(tokens.refreshToken);
      await updateConnection({ tokens_encrypted: encryptTokens(tokens) });
    }
    return tokens.accessToken;
  });
}

export async function syncLog(direction: "in" | "out" | "system", message: string, ok = true, eventId: string | null = null) {
  const db = createAdminClient();
  await db.from("sync_log").insert({ direction, message: message.slice(0, 500), ok, event_id: eventId });
}

/**
 * Enkel lås så to synker ikke kjører samtidig (f.eks. to varsler fra Outlook rett etter hverandre).
 * Er låsen tatt, ber vi i stedet den som kjører om å ta én runde til.
 */
export async function acquireSyncLock(seconds = 240): Promise<boolean> {
  const db = createAdminClient();
  const now = new Date().toISOString();
  const { data } = await db
    .from("outlook_connection")
    .update({ sync_lock_until: new Date(Date.now() + seconds * 1000).toISOString(), resync_requested: false })
    .eq("id", 1)
    .or(`sync_lock_until.is.null,sync_lock_until.lt.${now}`)
    .select("id");
  if (data?.length) return true;
  await db.from("outlook_connection").update({ resync_requested: true }).eq("id", 1);
  return false;
}

export async function releaseSyncLock(): Promise<boolean> {
  const db = createAdminClient();
  const { data } = await db.from("outlook_connection").update({ sync_lock_until: null }).eq("id", 1).select("resync_requested").maybeSingle();
  return data?.resync_requested ?? false;
}
