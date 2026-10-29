import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { createState } from "@/lib/huset/oauthState";
import { authorizeUrl, spotifyConfigured } from "@/lib/huset/spotify";
import { requireFamily } from "@/lib/session";

/** Starter Spotify-innloggingen for ett medlem (`?medlem=<id>`). */
export async function GET(req: Request) {
  const session = await requireFamily();
  const url = new URL(req.url);
  const memberId = url.searchParams.get("medlem");
  if (!spotifyConfigured()) return NextResponse.redirect(`${url.origin}/huset?spotify=mangler-oppsett`);
  if (!memberId || !session.members.some((m) => m.id === memberId && !m.is_shared)) {
    return NextResponse.redirect(`${url.origin}/huset?spotify=ugyldig`);
  }
  return NextResponse.redirect(authorizeUrl(url.origin, createState(serverEnv("TOKEN_ENCRYPTION_KEY"), memberId)));
}
