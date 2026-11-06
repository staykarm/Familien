// Koden som må til for å slå på brytere i huset (varmekablene). Å slå av krever ingen kode.
// Koden står i miljøvariabelen HOUSE_SWITCH_PIN (Vercel), aldri i koden. Rene funksjoner, slik at de kan testes.

import { createHash, timingSafeEqual } from "node:crypto";

/** Fire til åtte sifre. */
export const SWITCH_PIN = /^\d{4,8}$/;

/** Sammenligner koden med den riktige på konstant tid. Uten riktig kode (ikke satt opp) godtas ingenting. */
export function pinMatches(pin: string | undefined, expected: string | undefined): boolean {
  if (!pin || !expected || !SWITCH_PIN.test(expected)) return false;
  const a = createHash("sha256").update(pin).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
