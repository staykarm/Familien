import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { publicSupabaseEnv, supabaseSecretKey } from "@/lib/env";

/**
 * Service role-klient som omgår RLS. Bare for serverkode som ikke har en innlogget
 * bruker (webhooks, cron) eller som trenger hemmelige tabeller. Aldri importer i klientkode.
 */
export function createAdminClient() {
  const { url } = publicSupabaseEnv();
  return createClient<Database>(url, supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
