import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { AUTH_ENABLED, publicSupabaseEnv } from "@/lib/env";

/** Stier som skal virke uten innlogging. API-ruter har egen autentisering (webhook-hemmelighet, CRON_SECRET, sesjon). */
const PUBLIC_PREFIXES = ["/logg-inn", "/auth/", "/api/", "/manifest.webmanifest", "/icon", "/apple-icon", "/weather/", "/sw.js"];

export async function updateSession(request: NextRequest) {
  if (!AUTH_ENABLED) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const { url, key } = publicSupabaseEnv();

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Må kalles rett etter at klienten er laget: validerer JWT-en og fornyer sesjonen ved behov.
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;

  if (!isLoggedIn && !PUBLIC_PREFIXES.some((p) => path.startsWith(p))) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/logg-inn";
    loginUrl.search = "";
    if (path !== "/") loginUrl.searchParams.set("neste", path);
    const redirect = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}
