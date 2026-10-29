import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { toPlaylists, toSavedTracks, toSearchResult, type MusicItem, type SearchResult } from "./music";

// Spotify Web API: søk (appens egen nøkkel) og spillelister/likte sanger (hver persons innlogging).
// Selve avspillingen skjer i Sonos via Home Assistant, ikke her.

const ACCOUNTS = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";
const TIMEOUT_MS = 8_000;
export const SPOTIFY_SCOPES = ["playlist-read-private", "playlist-read-collaborative", "user-library-read"];
export const SPOTIFY_CALLBACK = "/api/huset/spotify/callback";

export class SpotifyError extends Error {}

interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** Millisekunder siden 1970. */
  expiresAt: number;
}

export function spotifyConfigured(): boolean {
  return !!process.env.SPOTIFY_CLIENT_ID && !!process.env.SPOTIFY_CLIENT_SECRET;
}

/**
 * Adressen Spotify sender brukeren tilbake til. Spotify godtar bare adresser som er registrert i appen,
 * så vi bruker hovedadressen (NEXT_PUBLIC_SITE_URL) også når innloggingen startes fra en testversjon.
 */
export function redirectUri(origin: string): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || origin) + SPOTIFY_CALLBACK;
}

export function authorizeUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: serverEnv("SPOTIFY_CLIENT_ID"),
    response_type: "code",
    redirect_uri: redirectUri(origin),
    scope: SPOTIFY_SCOPES.join(" "),
    state,
    show_dialog: "true",
  });
  return `${ACCOUNTS}/authorize?${params}`;
}

async function tokenRequest(params: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const basic = Buffer.from(`${serverEnv("SPOTIFY_CLIENT_ID")}:${serverEnv("SPOTIFY_CLIENT_SECRET")}`).toString("base64");
  let res: Response;
  try {
    res = await fetch(`${ACCOUNTS}/api/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SpotifyError("Får ikke kontakt med Spotify");
  }
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) {
    console.error("Spotify-token feilet", res.status, json.error);
    throw new SpotifyError(
      json.error === "invalid_grant"
        ? "Spotify-innloggingen er utløpt. Koble til Spotify på nytt."
        : json.error === "invalid_client"
          ? "SPOTIFY_CLIENT_ID eller SPOTIFY_CLIENT_SECRET er feil."
          : "Spotify avviste innloggingen"
    );
  }
  return json as { access_token: string; refresh_token?: string; expires_in?: number };
}

// Appens egen nøkkel (Client Credentials) brukes til søk. Holdes i minnet til den utløper.
let appToken: { token: string; expiresAt: number } | null = null;

async function appAccessToken(): Promise<string> {
  if (appToken && appToken.expiresAt > Date.now() + 60_000) return appToken.token;
  const json = await tokenRequest({ grant_type: "client_credentials" });
  appToken = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return appToken.token;
}

async function api(path: string, token: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new SpotifyError("Får ikke kontakt med Spotify");
  }
  if (res.status === 429) throw new SpotifyError("Spotify ber oss vente litt. Prøv igjen om et øyeblikk.");
  if (res.status === 403) throw new SpotifyError("Spotify nekter tilgang. Er personen lagt til under «User Management» i Spotify-appen?");
  if (!res.ok) throw new SpotifyError(`Spotify svarte med feil ${res.status}`);
  return res.json();
}

export async function searchSpotify(query: string): Promise<SearchResult> {
  const params = new URLSearchParams({ q: query, type: "track,playlist,album", limit: "8", market: "NO" });
  return toSearchResult(await api(`/search?${params}`, await appAccessToken()));
}

// --- Innlogging per person ----------------------------------------------------

/** Bytter koden fra Spotify mot tokens, og lagrer dem kryptert for medlemmet. */
export async function connectAccount(memberId: string, code: string, origin: string): Promise<string> {
  const json = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri(origin) });
  if (!json.refresh_token) throw new SpotifyError("Spotify ga ikke noe refresh-token");
  const tokens: Tokens = { accessToken: json.access_token, refreshToken: json.refresh_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  const me = (await api("/me", tokens.accessToken)) as { id?: string; display_name?: string };
  if (!me.id) throw new SpotifyError("Fant ikke Spotify-kontoen");
  const { error } = await createAdminClient()
    .from("spotify_accounts")
    .upsert({ member_id: memberId, spotify_user_id: me.id, display_name: me.display_name ?? null, tokens_encrypted: encryptSecret(JSON.stringify(tokens)), updated_at: new Date().toISOString() });
  if (error) throw new SpotifyError("Kunne ikke lagre Spotify-kontoen");
  return me.display_name ?? me.id;
}

export async function disconnectAccount(memberId: string): Promise<void> {
  await createAdminClient().from("spotify_accounts").delete().eq("member_id", memberId);
}

/** Hvem som har koblet til Spotify (medlems-id → Spotify-navn). */
export async function connectedAccounts(): Promise<Record<string, string>> {
  const { data } = await createAdminClient().from("spotify_accounts").select("member_id, spotify_user_id, display_name");
  return Object.fromEntries((data ?? []).map((a) => [a.member_id, a.display_name ?? a.spotify_user_id]));
}

/** Gyldig tilgangstoken for medlemmet; fornyes og lagres ved behov. */
async function userAccessToken(memberId: string): Promise<string> {
  const db = createAdminClient();
  const { data } = await db.from("spotify_accounts").select("tokens_encrypted").eq("member_id", memberId).maybeSingle();
  if (!data) throw new SpotifyError("Spotify er ikke koblet til for denne personen");
  const tokens = JSON.parse(decryptSecret(data.tokens_encrypted)) as Tokens;
  if (tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken;
  const json = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refreshToken });
  const fresh: Tokens = {
    accessToken: json.access_token,
    // Spotify gir av og til et nytt refresh-token; ellers gjelder det gamle.
    refreshToken: json.refresh_token ?? tokens.refreshToken,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  await db.from("spotify_accounts").update({ tokens_encrypted: encryptSecret(JSON.stringify(fresh)), updated_at: new Date().toISOString() }).eq("member_id", memberId);
  return fresh.accessToken;
}

export async function userPlaylists(memberId: string): Promise<MusicItem[]> {
  return toPlaylists(await api("/me/playlists?limit=50", await userAccessToken(memberId)));
}

export async function userSavedTracks(memberId: string): Promise<MusicItem[]> {
  return toSavedTracks(await api("/me/tracks?limit=50&market=NO", await userAccessToken(memberId)));
}
