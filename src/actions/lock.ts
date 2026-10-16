"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { hashPin, verifyPin } from "@/lib/lock/pin";
import { clearUnlocked, getLockState, relyingParty, saveLockState, setUnlocked } from "@/lib/lock/state";
import { LOCK_PATH, lockoutMs, type RememberMode } from "@/lib/lock/token";
import { requireFamily } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { changePinSchema, passkeyLabelSchema, pinSchema, rememberSchema, webauthnResponseSchema } from "@/lib/validation/lock";

// Låsen er felles for familien: én kode, og Face ID / Touch ID (passkeys) per enhet.
// Tabellene er hemmelige (ingen RLS-policyer), så alt går via admin-klienten.

export interface LockResult {
  ok: boolean;
  message?: string;
}

const CHALLENGE_COOKIE = "familien_las_utfordring";

async function storeChallenge(challenge: string) {
  (await cookies()).set(CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 300,
  });
}

async function takeChallenge(): Promise<string | null> {
  const store = await cookies();
  const challenge = store.get(CHALLENGE_COOKIE)?.value ?? null;
  store.delete(CHALLENGE_COOKIE);
  return challenge;
}

function waitMessage(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return s < 60 ? `For mange forsøk. Vent ${s} sekunder.` : `For mange forsøk. Vent ${Math.ceil(s / 60)} minutter.`;
}

/** Låser opp med den felles koden. Etter fem feil må man vente litt (dobles for hver ny feil). */
export async function unlockWithPin(pin: string): Promise<LockResult> {
  const parsed = pinSchema.safeParse(pin);
  const state = await getLockState();
  const waitMs = state.lockedUntil ? new Date(state.lockedUntil).getTime() - Date.now() : 0;
  if (waitMs > 0) return { ok: false, message: waitMessage(waitMs) };

  if (!parsed.success || !verifyPin(parsed.data, state.pinHash)) {
    const failedCount = state.failedCount + 1;
    const lockMs = lockoutMs(failedCount);
    await saveLockState({ failedCount, lockedUntil: lockMs ? new Date(Date.now() + lockMs).toISOString() : null });
    return { ok: false, message: lockMs ? waitMessage(lockMs) : "Feil kode" };
  }

  if (state.failedCount > 0 || state.lockedUntil) await saveLockState({ failedCount: 0, lockedUntil: null });
  await setUnlocked(state);
  return { ok: true };
}

export async function lockNow(): Promise<void> {
  await clearUnlocked();
  redirect(LOCK_PATH);
}

export interface LockSettings {
  remember: RememberMode;
  isDefaultPin: boolean;
  passkeys: { id: string; label: string; createdAt: string; lastUsedAt: string | null; thisSite: boolean }[];
}

export async function getLockSettings(): Promise<LockSettings> {
  await requireFamily();
  const [state, { rpID }, { data }] = await Promise.all([
    getLockState(),
    relyingParty(),
    createAdminClient().from("passkeys").select("id, label, rp_id, created_at, last_used_at").order("created_at"),
  ]);
  return {
    remember: state.remember,
    isDefaultPin: !state.pinHash,
    passkeys: (data ?? []).map((p) => ({ id: p.id, label: p.label, createdAt: p.created_at, lastUsedAt: p.last_used_at, thisSite: p.rp_id === rpID })),
  };
}

/** Ny kode. Alle andre enheter må taste den nye koden (eller bruke Face ID) neste gang. */
export async function changePin(input: { current: string; next: string; repeat: string }): Promise<LockResult> {
  await requireFamily();
  const parsed = changePinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const state = await getLockState();
  if (!verifyPin(parsed.data.current, state.pinHash)) return { ok: false, message: "Koden dere har nå, er feil" };
  const next = { ...state, pinHash: hashPin(parsed.data.next), pinLength: parsed.data.next.length, version: state.version + 1, failedCount: 0, lockedUntil: null };
  if (!(await saveLockState(next))) return { ok: false, message: "Kunne ikke lagre koden. Er SQL-en for låsen kjørt?" };
  await setUnlocked(next);
  return { ok: true, message: "Ny kode er lagret" };
}

export async function setRemember(mode: RememberMode): Promise<LockResult> {
  await requireFamily();
  const parsed = rememberSchema.safeParse(mode);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const state = { ...(await getLockState()), remember: parsed.data };
  if (!(await saveLockState({ remember: parsed.data }))) return { ok: false, message: "Kunne ikke lagre. Er SQL-en for låsen kjørt?" };
  await setUnlocked(state);
  return { ok: true, message: "Lagret" };
}

// ---------- Face ID / Touch ID (passkeys) ----------

export async function passkeyRegisterOptions(): Promise<{ ok: boolean; message?: string; options?: PublicKeyCredentialCreationOptionsJSON }> {
  await requireFamily();
  const { rpID } = await relyingParty();
  const { data: existing } = await createAdminClient().from("passkeys").select("id, transports").eq("rp_id", rpID);
  const options = await generateRegistrationOptions({
    rpName: "Familien",
    rpID,
    userName: "Familien",
    userDisplayName: "Familien",
    attestationType: "none",
    excludeCredentials: (existing ?? []).map((c) => ({ id: c.id, transports: c.transports })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required", authenticatorAttachment: "platform" },
  });
  await storeChallenge(options.challenge);
  return { ok: true, options };
}

export async function passkeyRegister(response: RegistrationResponseJSON, label: string): Promise<LockResult & { id?: string }> {
  await requireFamily();
  const parsed = webauthnResponseSchema.safeParse(response);
  const parsedLabel = passkeyLabelSchema.safeParse(label);
  const challenge = await takeChallenge();
  if (!parsed.success || !challenge) return { ok: false, message: "Face ID ble ikke satt opp. Prøv igjen." };
  const { rpID, origin } = await relyingParty();
  try {
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!result.verified) return { ok: false, message: "Face ID ble ikke godkjent" };
    const { credential } = result.registrationInfo;
    const { error } = await createAdminClient()
      .from("passkeys")
      .upsert({
        id: credential.id,
        public_key: Buffer.from(credential.publicKey).toString("base64url"),
        counter: credential.counter,
        transports: credential.transports ?? [],
        label: parsedLabel.success ? parsedLabel.data : "Enhet",
        rp_id: rpID,
      });
    if (error) return { ok: false, message: "Kunne ikke lagre. Er SQL-en for låsen kjørt?" };
    return { ok: true, message: "Face ID er slått på for denne enheten", id: credential.id };
  } catch (e) {
    console.error("Passkey-registrering feilet", e);
    return { ok: false, message: "Face ID ble ikke satt opp. Prøv igjen." };
  }
}

export async function removePasskey(id: string): Promise<LockResult> {
  await requireFamily();
  const { error } = await createAdminClient().from("passkeys").delete().eq("id", id);
  return error ? { ok: false, message: "Kunne ikke fjerne enheten" } : { ok: true };
}

/** Kalles fra låsesiden, altså før opplåsing. Gir bare utfordringen og hvilke nøkler som finnes her. */
export async function passkeyLoginOptions(): Promise<{ ok: boolean; message?: string; options?: PublicKeyCredentialRequestOptionsJSON }> {
  const { rpID } = await relyingParty();
  const { data } = await createAdminClient().from("passkeys").select("id, transports").eq("rp_id", rpID);
  if (!data?.length) return { ok: false, message: "Face ID er ikke slått på ennå. Bruk koden, og slå det på i Innstillinger." };
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: data.map((c) => ({ id: c.id, transports: c.transports })),
    userVerification: "required",
  });
  await storeChallenge(options.challenge);
  return { ok: true, options };
}

export async function passkeyLogin(response: AuthenticationResponseJSON): Promise<LockResult> {
  const parsed = webauthnResponseSchema.safeParse(response);
  const challenge = await takeChallenge();
  if (!parsed.success || !challenge) return { ok: false, message: "Face ID virket ikke. Bruk koden." };
  const { rpID, origin } = await relyingParty();
  const admin = createAdminClient();
  const { data: key } = await admin.from("passkeys").select("*").eq("id", parsed.data.id).eq("rp_id", rpID).maybeSingle();
  if (!key) return { ok: false, message: "Denne enheten er fjernet. Bruk koden, og slå på Face ID igjen." };
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: { id: key.id, publicKey: Buffer.from(key.public_key, "base64url"), counter: Number(key.counter), transports: key.transports },
      requireUserVerification: true,
    });
    if (!result.verified) return { ok: false, message: "Face ID ble ikke godkjent" };
    await admin
      .from("passkeys")
      .update({ counter: result.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
      .eq("id", key.id);
    await setUnlocked(await getLockState());
    return { ok: true };
  } catch (e) {
    console.error("Passkey-innlogging feilet", e);
    return { ok: false, message: "Face ID virket ikke. Bruk koden." };
  }
}
