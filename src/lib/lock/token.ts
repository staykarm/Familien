// Opplåsingen huskes i en signert informasjonskapsel: «versjon.utløp.signatur».
// Bruker Web Crypto, slik at det samme virker i proxy-en og på serveren.

export const LOCK_COOKIE = "familien_las";
export const LOCK_PATH = "/las";

export type RememberMode = "session" | "day" | "month";

export const REMEMBER_LABEL: Record<RememberMode, string> = {
  session: "Hver gang appen åpnes",
  day: "Én gang i døgnet",
  month: "Én gang i måneden",
};

const HOUR = 60 * 60 * 1000;
/** Hvor lenge en opplåsing varer. «Hver gang» er en øktkapsel, men med et tak i tilfelle appen aldri lukkes. */
export const REMEMBER_MS: Record<RememberMode, number> = {
  session: 12 * HOUR,
  day: 24 * HOUR,
  month: 30 * 24 * HOUR,
};

function toB64url(bytes: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secretB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", fromB64(secretB64), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function sign(secretB64: string, version: number, exp: number): Promise<string> {
  const data = new TextEncoder().encode(`las.${version}.${exp}`);
  return toB64url(await crypto.subtle.sign("HMAC", await hmacKey(secretB64), data));
}

export async function createLockToken(secretB64: string, version: number, exp: number): Promise<string> {
  return `${version}.${exp}.${await sign(secretB64, version, exp)}`;
}

/** Gir versjonen hvis kapselen er ekte og ikke utløpt, ellers null. */
export async function readLockToken(secretB64: string, token: string | undefined, now = Date.now()): Promise<number | null> {
  if (!token) return null;
  const [v, e, sig] = token.split(".");
  const version = Number(v);
  const exp = Number(e);
  if (!Number.isInteger(version) || !Number.isInteger(exp) || !sig || exp <= now) return null;
  const expected = await sign(secretB64, version, exp);
  // Lik lengde og sammenligning uten tidlig avbrudd.
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? version : null;
}

/** Stier som virker uten opplåsing. API-ruter har egen sjekk (CRON_SECRET, webhook, eller requireFamily). */
const OPEN_PREFIXES = [LOCK_PATH, "/api/", "/auth/", "/logg-inn", "/manifest.webmanifest", "/icon", "/apple-icon", "/weather/", "/sw.js"];

export function isOpenPath(path: string): boolean {
  return OPEN_PREFIXES.some((p) => path.startsWith(p));
}

/** Ventetid etter for mange feil: 30 s etter fem feil, dobles for hver nye, maks 15 min. */
export function lockoutMs(failedCount: number): number {
  if (failedCount < 5) return 0;
  return Math.min(30_000 * 2 ** (failedCount - 5), 15 * 60_000);
}

export const PIN_PATTERN = /^\d{4,8}$/;
export const DEFAULT_PIN = "0102";
