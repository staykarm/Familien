"use client";

import { browserSupportsWebAuthn, startAuthentication, startRegistration, WebAuthnError } from "@simplewebauthn/browser";
import { passkeyLogin, passkeyLoginOptions, passkeyRegister, passkeyRegisterOptions } from "@/actions/lock";

/** Husker på enheten at Face ID / Touch ID er slått på her (id-en til nøkkelen). */
export const FACE_ID_KEY = "familien.faceid";

export function readFaceIdFlag(): string | null {
  try {
    return localStorage.getItem(FACE_ID_KEY);
  } catch {
    return null;
  }
}

function writeFaceIdFlag(id: string | null) {
  try {
    if (id) localStorage.setItem(FACE_ID_KEY, id);
    else localStorage.removeItem(FACE_ID_KEY);
  } catch {
    // Privat modus: Face ID-knappen vises bare ikke automatisk.
  }
}

export function supportsFaceId(): boolean {
  return typeof window !== "undefined" && browserSupportsWebAuthn();
}

/** «iPhone», «iPad», «Mac» … slik at enhetene kan skilles i Innstillinger. */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows-PC";
  return "Enhet";
}

/** Avbrutt av brukeren («Avbryt» i Face ID-dialogen) gir ingen feilmelding. */
function cancelled(e: unknown): boolean {
  return (e instanceof WebAuthnError && e.code === "ERROR_CEREMONY_ABORTED") || (e instanceof Error && e.name === "NotAllowedError");
}

export async function unlockWithFaceId(): Promise<{ ok: boolean; message?: string }> {
  const start = await passkeyLoginOptions();
  if (!start.ok || !start.options) {
    writeFaceIdFlag(null);
    return { ok: false, message: start.message };
  }
  try {
    const response = await startAuthentication({ optionsJSON: start.options });
    const result = await passkeyLogin(response);
    if (!result.ok) writeFaceIdFlag(null);
    return result;
  } catch (e) {
    return { ok: false, message: cancelled(e) ? undefined : "Face ID virket ikke. Bruk koden." };
  }
}

export async function enableFaceId(): Promise<{ ok: boolean; message?: string }> {
  const start = await passkeyRegisterOptions();
  if (!start.ok || !start.options) return { ok: false, message: start.message };
  try {
    const response = await startRegistration({ optionsJSON: start.options });
    const result = await passkeyRegister(response, deviceLabel());
    if (result.ok && result.id) writeFaceIdFlag(result.id);
    return result;
  } catch (e) {
    if (e instanceof WebAuthnError && e.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
      return { ok: false, message: "Face ID er allerede slått på for denne enheten" };
    }
    return { ok: false, message: cancelled(e) ? undefined : "Face ID ble ikke satt opp. Prøv igjen." };
  }
}

export function forgetFaceId(id: string) {
  if (readFaceIdFlag() === id) writeFaceIdFlag(null);
}
