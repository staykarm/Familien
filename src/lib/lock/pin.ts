import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { DEFAULT_PIN } from "@/lib/lock/token";

/** Lagres som «scrypt.salt.hash» (base64url). */
export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return ["scrypt", salt.toString("base64url"), hash.toString("base64url")].join(".");
}

/** Uten lagret kode gjelder standardkoden. */
export function verifyPin(pin: string, stored: string | null): boolean {
  if (!stored) {
    const a = Buffer.from(pin);
    const b = Buffer.from(DEFAULT_PIN);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  const [kind, salt, hash] = stored.split(".");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(pin, Buffer.from(salt, "base64url"), expected.length);
  return timingSafeEqual(actual, expected);
}
