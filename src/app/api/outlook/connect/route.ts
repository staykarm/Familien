import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeUrl, outlookConfigured } from "@/lib/outlook/auth";
import { requireFamily } from "@/lib/session";

const STATE_COOKIE = "outlook_oauth_state";

/** Starter innloggingen hos Microsoft. Eieren av den delte kalenderen logger inn én gang. */
export async function GET(req: Request) {
  await requireFamily();
  const origin = new URL(req.url).origin;
  if (!outlookConfigured()) {
    return NextResponse.redirect(`${origin}/innstillinger?outlook=mangler-oppsett#outlook`);
  }
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authorizeUrl(`${origin}/api/outlook/callback`, state));
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax", path: "/api/outlook", maxAge: 600 });
  return res;
}
