import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, OutlookAuthError } from "@/lib/outlook/auth";
import { encryptTokens, loadConnection, syncLog } from "@/lib/outlook/connection";
import { GraphClient } from "@/lib/outlook/graph";
import { requireFamily } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

const STATE_COOKIE = "outlook_oauth_state";

/** Microsoft sender brukeren hit etter innlogging. Vi lagrer tokens kryptert og sender videre til kalendervalget. */
export async function GET(req: NextRequest) {
  await requireFamily();
  const url = new URL(req.url);
  const back = (status: string) => {
    const res = NextResponse.redirect(`${url.origin}/innstillinger?outlook=${status}#outlook`);
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/outlook" });
    return res;
  };

  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error")) return back("avbrutt");
  if (!code || !state || state !== req.cookies.get(STATE_COOKIE)?.value) return back("ugyldig");

  try {
    const tokens = await exchangeCode(code, `${url.origin}/api/outlook/callback`);
    const me = await new GraphClient(async () => tokens.accessToken).json<{ mail?: string; userPrincipalName?: string; displayName?: string }>(
      "/me?$select=mail,userPrincipalName,displayName"
    );
    const email = me.mail || me.userPrincipalName || "ukjent";

    const previous = await loadConnection();
    const sameAccount = previous?.account_email.toLowerCase() === email.toLowerCase();
    const db = createAdminClient();
    await db.from("outlook_connection").upsert({
      id: 1,
      account_email: email,
      account_name: me.displayName ?? null,
      tokens_encrypted: encryptTokens(tokens),
      site_url: url.origin,
      last_error: null,
      // Ny konto: start på nytt med kalendervalg og full synk.
      ...(sameAccount
        ? {}
        : { calendar_id: null, calendar_name: null, delta_link: null, delta_window_start: null, subscription_id: null, subscription_expires_at: null }),
    });
    await syncLog("system", `Koblet til Outlook som ${email}`);
    return back(sameAccount && previous?.calendar_id ? "koblet" : "velg");
  } catch (e) {
    console.error("Outlook-innlogging feilet", e);
    return back(e instanceof OutlookAuthError ? "feil-nokkel" : "feil");
  }
}
