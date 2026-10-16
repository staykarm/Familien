import { NextResponse, type NextRequest } from "next/server";
import { AUTH_ENABLED } from "@/lib/env";
import { isOpenPath, LOCK_COOKIE, LOCK_PATH, readLockToken } from "@/lib/lock/token";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  if (!AUTH_ENABLED) return checkLock(request);
  return updateSession(request);
}

/** Uten innlogging: send til låsesiden hvis enheten ikke er låst opp med koden eller Face ID. */
async function checkLock(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret || isOpenPath(path)) return NextResponse.next({ request });
  if ((await readLockToken(secret, request.cookies.get(LOCK_COOKIE)?.value)) !== null) return NextResponse.next({ request });
  const url = request.nextUrl.clone();
  url.pathname = LOCK_PATH;
  url.search = "";
  if (path !== "/") url.searchParams.set("neste", path + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Alt unntatt statiske filer og bilder.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
