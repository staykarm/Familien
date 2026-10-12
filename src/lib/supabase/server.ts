import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { publicSupabaseEnv } from "@/lib/env";

/** Supabase-klient for Server Components, server actions og route handlers – kjører som innlogget bruker (RLS gjelder). */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = publicSupabaseEnv();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Kalt fra en Server Component, der cookies er skrivebeskyttet. Proxy-en fornyer sesjonen.
        }
      },
    },
  });
}
