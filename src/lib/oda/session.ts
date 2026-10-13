import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { OdaClient, OdaError } from "./client";

export const NOT_CONNECTED = "Oda er ikke koblet til. Koble til under Innstillinger.";
const EXPIRED = "Oda-innloggingen har gått ut. Koble til på nytt under Innstillinger.";

interface StoredSession {
  client: OdaClient | null;
  email: string;
  password: string | null;
}

async function loadSession(): Promise<StoredSession | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("oda_connection")
    .select("email, cookies_encrypted, password_encrypted")
    .eq("id", 1)
    .maybeSingle();
  if (!data) return null;
  let client: OdaClient | null = null;
  let password: string | null = null;
  try {
    client = new OdaClient(JSON.parse(decryptSecret(data.cookies_encrypted)));
  } catch {
    // Uleselig økt (f.eks. byttet nøkkel) – vi kan fortsatt logge inn på nytt hvis passordet er husket.
  }
  try {
    password = data.password_encrypted ? decryptSecret(data.password_encrypted) : null;
  } catch {
    password = null;
  }
  return { client, email: data.email, password };
}

/**
 * Lagrer (oppdaterte) cookies kryptert. Kalles etter hver bruk, siden Oda fornyer økten underveis.
 * `password`: en streng husker passordet (kryptert), `null` glemmer det, `undefined` lar det være som det er.
 */
export async function saveOdaSession(client: OdaClient, email: string, password?: string | null): Promise<void> {
  const db = createAdminClient();
  await db.from("oda_connection").upsert({
    id: 1,
    email,
    cookies_encrypted: encryptSecret(JSON.stringify(client.jar)),
    ...(password === undefined ? {} : { password_encrypted: password ? encryptSecret(password) : null }),
    last_used_at: new Date().toISOString(),
  });
}

export async function deleteOdaSession(): Promise<void> {
  const db = createAdminClient();
  await db.from("oda_connection").delete().eq("id", 1);
}

export interface OdaStatus {
  connected: boolean;
  email: string | null;
  rememberPassword: boolean;
  lastUsedAt: string | null;
}

export async function odaStatus(): Promise<OdaStatus> {
  const db = createAdminClient();
  const { data } = await db.from("oda_connection").select("email, password_encrypted, last_used_at").eq("id", 1).maybeSingle();
  return {
    connected: !!data,
    email: data?.email ?? null,
    rememberPassword: !!data?.password_encrypted,
    lastUsedAt: data?.last_used_at ?? null,
  };
}

/**
 * Kjører `fn` med den lagrede Oda-økten. Sjekker først at økten fortsatt er innlogget (Oda gir ellers
 * en tom gjestekurv i stillhet). Har økten gått ut og passordet er husket, logger vi inn på nytt av oss selv.
 * Feiler `fn` med en innloggingsfeil, prøves den én gang til etter ny innlogging.
 */
export async function withOda<T>(fn: (client: OdaClient) => Promise<T>): Promise<T> {
  const stored = await loadSession();
  if (!stored) throw new OdaError(NOT_CONNECTED, "auth");

  const relogin = async () => {
    if (!stored.password) throw new OdaError(EXPIRED, "auth");
    const fresh = new OdaClient();
    await fresh.login(stored.email, stored.password).catch((e) => {
      // Passordet er endret hos Oda: glem det, så vi ikke prøver igjen og igjen.
      if (e instanceof OdaError && e.kind === "auth") {
        void saveOdaSession(fresh, stored.email, null);
        throw new OdaError("Oda godtok ikke det lagrede passordet. Koble til på nytt under Innstillinger.", "auth");
      }
      throw e;
    });
    return fresh;
  };

  let client = stored.client && (await stored.client.isLoggedIn()) !== false ? stored.client : await relogin();
  try {
    const result = await fn(client);
    await saveOdaSession(client, stored.email);
    return result;
  } catch (e) {
    if (!(e instanceof OdaError && e.kind === "auth") || !stored.password) throw e;
    client = await relogin();
    const result = await fn(client);
    await saveOdaSession(client, stored.email);
    return result;
  }
}
