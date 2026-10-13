import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * OAuth mot Microsoft (autorisasjonskode-flyt) for en personlig Microsoft-konto.
 * Vi trenger offline_access for å få et refresh-token, slik at synken virker uten at noen er logget inn.
 */
export const SCOPES = ["offline_access", "User.Read", "Calendars.ReadWrite", "MailboxSettings.ReadWrite"];

export interface OutlookTokens {
  accessToken: string;
  refreshToken: string;
  /** Millisekunder siden 1970. */
  expiresAt: number;
}

export class OutlookAuthError extends Error {}

function authority(): string {
  return (process.env.MS_AUTHORITY || "https://login.microsoftonline.com/consumers").replace(/\/$/, "");
}

export function outlookConfigured(): boolean {
  return Boolean(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);
}

export function authorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: serverEnv("MS_CLIENT_ID"),
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: SCOPES.join(" "),
    state,
    prompt: "select_account",
  });
  return `${authority()}/oauth2/v2.0/authorize?${params}`;
}

async function tokenRequest(params: Record<string, string>): Promise<OutlookTokens> {
  const res = await fetch(`${authority()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: serverEnv("MS_CLIENT_ID"),
      client_secret: serverEnv("MS_CLIENT_SECRET"),
      scope: SCOPES.join(" "),
      ...params,
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    console.error("Microsoft-token feilet", json.error, json.error_description);
    throw new OutlookAuthError(
      json.error === "invalid_grant"
        ? "Outlook-innloggingen er utløpt eller trukket tilbake. Koble til Outlook på nytt."
        : json.error === "invalid_client"
          ? "MS_CLIENT_SECRET er feil eller utløpt. Lag en ny i Entra og oppdater Vercel."
          : `Microsoft avviste innloggingen (${json.error ?? res.status}).`
    );
  }
  return {
    accessToken: json.access_token,
    // Microsoft gir ofte et nytt refresh-token; ellers gjelder det gamle fortsatt.
    refreshToken: json.refresh_token ?? params.refresh_token ?? "",
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
}

export function exchangeCode(code: string, redirectUri: string): Promise<OutlookTokens> {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

export function refreshTokens(refreshToken: string): Promise<OutlookTokens> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}
