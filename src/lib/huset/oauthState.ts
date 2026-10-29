import { createHmac, timingSafeEqual } from "node:crypto";

// Signert «state» for Spotify-innloggingen: hvem som kobler til, og når den utløper.
// Signaturen gjør at vi ikke trenger en informasjonskapsel, så innloggingen kan startes fra en
// testversjon og fullføres på hovedadressen (Spotify godtar bare registrerte adresser).

const TTL_MS = 10 * 60_000;

function sign(secret: string, payload: string): string {
  return createHmac("sha256", Buffer.from(secret, "base64")).update(`spotify.${payload}`).digest("base64url");
}

export function createState(secret: string, memberId: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ m: memberId, e: now + TTL_MS })).toString("base64url");
  return `${payload}.${sign(secret, payload)}`;
}

/** Gir medlems-id-en hvis state er ekte og ikke utløpt, ellers null. */
export function readState(secret: string, state: string | null, now = Date.now()): string | null {
  const [payload, sig] = (state ?? "").split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(secret, payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { m, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { m?: unknown; e?: unknown };
    return typeof m === "string" && typeof e === "number" && e > now ? m : null;
  } catch {
    return null;
  }
}
