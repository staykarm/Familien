import "server-only";
import { AUTH_ENABLED } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Databaseklienten sidene og server actions skal bruke.
 * Med innlogging: innlogget bruker (RLS gjelder). Uten innlogging: service role på serveren,
 * slik at databasen fortsatt er stengt for den offentlige nøkkelen.
 */
export async function getDb() {
  return AUTH_ENABLED ? createClient() : createAdminClient();
}
