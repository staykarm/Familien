import "server-only";
import { cookies, headers } from "next/headers";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createLockToken, LOCK_COOKIE, readLockToken, REMEMBER_MS, type RememberMode } from "@/lib/lock/token";

export interface LockState {
  pinHash: string | null;
  version: number;
  remember: RememberMode;
  pinLength: number;
  failedCount: number;
  lockedUntil: string | null;
}

const DEFAULT_STATE: LockState = { pinHash: null, version: 1, remember: "session", pinLength: 4, failedCount: 0, lockedUntil: null };

/** Uten rad (eller før SQL-en er kjørt) gjelder standardkoden 0102. */
export async function getLockState(): Promise<LockState> {
  const { data, error } = await createAdminClient().from("app_lock").select("*").eq("id", 1).maybeSingle();
  if (error) console.error("Kunne ikke lese app_lock", error.message);
  if (!data) return DEFAULT_STATE;
  return {
    pinHash: data.pin_hash,
    version: data.pin_version,
    remember: data.remember,
    pinLength: data.pin_length,
    failedCount: data.failed_count,
    lockedUntil: data.locked_until,
  };
}

export async function saveLockState(patch: Partial<LockState>): Promise<boolean> {
  const row: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString() };
  if (patch.pinHash !== undefined) row.pin_hash = patch.pinHash;
  if (patch.version !== undefined) row.pin_version = patch.version;
  if (patch.remember !== undefined) row.remember = patch.remember;
  if (patch.pinLength !== undefined) row.pin_length = patch.pinLength;
  if (patch.failedCount !== undefined) row.failed_count = patch.failedCount;
  if (patch.lockedUntil !== undefined) row.locked_until = patch.lockedUntil;
  const { error } = await createAdminClient().from("app_lock").upsert(row, { onConflict: "id" });
  if (error) console.error("Kunne ikke lagre app_lock", error.message);
  return !error;
}

function lockSecret(): string {
  return serverEnv("TOKEN_ENCRYPTION_KEY");
}

/** Er denne enheten låst opp med gjeldende kode? */
export async function isUnlocked(state?: LockState): Promise<boolean> {
  const token = (await cookies()).get(LOCK_COOKIE)?.value;
  const version = await readLockToken(lockSecret(), token);
  if (version === null) return false;
  return version === (state ?? (await getLockState())).version;
}

export async function setUnlocked(state: LockState): Promise<void> {
  const exp = Date.now() + REMEMBER_MS[state.remember];
  (await cookies()).set(LOCK_COOKIE, await createLockToken(lockSecret(), state.version, exp), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // «Hver gang appen åpnes» = øktkapsel (forsvinner når appen lukkes). Ellers huskes den.
    ...(state.remember === "session" ? {} : { maxAge: Math.floor(REMEMBER_MS[state.remember] / 1000) }),
  });
}

export async function clearUnlocked(): Promise<void> {
  (await cookies()).delete(LOCK_COOKIE);
}

/** Domenet og adressen passkeys knyttes til. Hver adresse (produksjon, testversjon) får sine egne. */
export async function relyingParty(): Promise<{ rpID: string; origin: string }> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost").split(",")[0].trim();
  const rpID = host.split(":")[0];
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() ?? (rpID === "localhost" ? "http" : "https");
  return { rpID, origin: `${proto}://${host}` };
}
