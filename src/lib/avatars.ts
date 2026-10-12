import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const SIGNED_URL_SECONDS = 60 * 60;

/** Lager signerte URL-er for profilbilder (privat bucket). Returnerer map fra avatar_path til URL. */
export async function signAvatarUrls(
  supabase: SupabaseClient<Database>,
  paths: (string | null)[]
): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (unique.length === 0) return {};
  const { data } = await supabase.storage.from("avatars").createSignedUrls(unique, SIGNED_URL_SECONDS);
  const out: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
  }
  return out;
}
