import "server-only";
import { publicSupabaseEnv, supabaseSecretKey } from "@/lib/env";

/**
 * Sender et «noe er endret»-signal på en Supabase Realtime-kanal, så andre åpne skjermer henter på nytt.
 * Selve dataene sendes aldri over kanalen – de hentes via server actions som sjekker tilgang.
 * Feil her skal aldri stoppe lagringen; i verste fall oppdateres andre skjermer ved neste henting.
 */
export async function broadcastChange(topic: string, payload: Record<string, unknown> = {}): Promise<void> {
  try {
    const { url } = publicSupabaseEnv();
    const key = supabaseSecretKey();
    const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
    // Eldre service_role-nøkler er JWT-er og må også sendes som Bearer.
    if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages: [{ topic, event: "changed", payload: { ...payload, at: Date.now() } }] }),
      cache: "no-store",
    });
  } catch (err) {
    console.warn("Kunne ikke sende sanntidssignal", err);
  }
}

export { NOTES_TOPIC, SHOPPING_TOPIC } from "@/lib/realtimeTopics";
