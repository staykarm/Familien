import { z } from "zod";
import { PIN_PATTERN } from "@/lib/lock/token";

export const pinSchema = z.string().regex(PIN_PATTERN, "Koden må være 4–8 sifre");

export const changePinSchema = z
  .object({ current: z.string().min(1, "Skriv inn koden dere har nå"), next: pinSchema, repeat: z.string() })
  .refine((v) => v.next === v.repeat, { message: "De to nye kodene er ikke like", path: ["repeat"] });

export const rememberSchema = z.enum(["session", "day", "month"], { message: "Ugyldig valg" });

/** Svaret fra Face ID / Touch ID. Selve innholdet sjekkes av @simplewebauthn/server. */
export const webauthnResponseSchema = z.looseObject({
  id: z.string().min(1).max(1024),
  rawId: z.string().min(1).max(1024),
  type: z.literal("public-key"),
  response: z.looseObject({ clientDataJSON: z.string() }),
});

export const passkeyLabelSchema = z.string().trim().min(1).max(60);
