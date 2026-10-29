import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { readState } from "@/lib/huset/oauthState";
import { connectAccount, SpotifyError } from "@/lib/huset/spotify";
import { requireFamily } from "@/lib/session";

/** Spotify sender brukeren hit etter innlogging. Tokens lagres kryptert for medlemmet i state. */
export async function GET(req: Request) {
  const session = await requireFamily();
  const url = new URL(req.url);
  const back = (status: string) => NextResponse.redirect(`${url.origin}/huset?spotify=${status}`);

  if (url.searchParams.get("error")) return back("avbrutt");
  const code = url.searchParams.get("code");
  const memberId = readState(serverEnv("TOKEN_ENCRYPTION_KEY"), url.searchParams.get("state"));
  if (!code || !memberId || !session.members.some((m) => m.id === memberId)) return back("ugyldig");

  try {
    await connectAccount(memberId, code, url.origin);
    return back("koblet");
  } catch (e) {
    console.error("Spotify-innlogging feilet", e);
    return back(e instanceof SpotifyError && e.message.includes("SPOTIFY_CLIENT") ? "feil-nokkel" : "feil");
  }
}
