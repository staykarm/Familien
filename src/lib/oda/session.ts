import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { OdaClient, OdaError } from "./client";

/** Henter lagret Oda-økt, eller null hvis familien ikke har koblet til Oda. */
export async function loadOdaClient(): Promise<{ client: OdaClient; email: string } | null> {
  const db = createAdminClient();
  const { data } = await db.from("oda_connection").select("email, cookies_encrypted").eq("id", 1).maybeSingle();
  if (!data) return null;
  try {
    return { client: new OdaClient(JSON.parse(decryptSecret(data.cookies_encrypted))), email: data.email };
  } catch {
    throw new OdaError("Kunne ikke lese Oda-økten. Koble til Oda på nytt.", "auth");
  }
}

/** Lagrer (oppdaterte) cookies kryptert. Kalles etter hver bruk, siden Oda fornyer økten underveis. */
export async function saveOdaSession(client: OdaClient, email: string): Promise<void> {
  const db = createAdminClient();
  await db.from("oda_connection").upsert({
    id: 1,
    email,
    cookies_encrypted: encryptSecret(JSON.stringify(client.jar)),
    last_used_at: new Date().toISOString(),
  });
}

export async function deleteOdaSession(): Promise<void> {
  const db = createAdminClient();
  await db.from("oda_connection").delete().eq("id", 1);
}

export async function odaStatus(): Promise<{ connected: boolean; email: string | null }> {
  const db = createAdminClient();
  const { data } = await db.from("oda_connection").select("email").eq("id", 1).maybeSingle();
  return { connected: !!data, email: data?.email ?? null };
}
