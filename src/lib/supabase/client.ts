import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { publicSupabaseEnv } from "@/lib/env";

/** Supabase-klient for klientkomponenter (Realtime, opplasting). */
export function createClient() {
  const { url, key } = publicSupabaseEnv();
  return createBrowserClient<Database>(url, key);
}
