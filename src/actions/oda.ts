"use server";

import { z } from "zod";
import { broadcastChange, SHOPPING_TOPIC } from "@/lib/realtime";
import { OdaClient, OdaError } from "@/lib/oda/client";
import { deleteOdaSession, odaStatus, saveOdaSession, withOda } from "@/lib/oda/session";
import { requireFamily } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDb } from "@/lib/supabase/db";

export interface OdaResult {
  ok: boolean;
  message?: string;
  needsLogin?: boolean;
}

export async function getOdaStatus() {
  await requireFamily();
  return odaStatus();
}

const connectSchema = z.object({
  email: z.email("Skriv inn e-posten du bruker hos Oda"),
  password: z.string().min(1, "Skriv inn passordet").max(200),
  remember: z.boolean(),
});

/**
 * Logger inn hos Oda. Økten lagres kryptert og deles av hele familien. Med «Husk passordet» lagres også
 * passordet kryptert, slik at appen kan logge inn på nytt av seg selv når Oda avslutter økten.
 */
export async function connectOda(input: z.input<typeof connectSchema>): Promise<OdaResult> {
  await requireFamily();
  const parsed = connectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  try {
    const client = new OdaClient();
    await client.login(parsed.data.email, parsed.data.password);
    await client.cart(); // bekrefter at økten virker
    await saveOdaSession(client, parsed.data.email, parsed.data.remember ? parsed.data.password : null);
    return { ok: true, message: "Koblet til Oda 🎉" };
  } catch (e) {
    if (e instanceof OdaError) return { ok: false, message: e.message };
    if (e instanceof Error && e.message.includes("TOKEN_ENCRYPTION_KEY")) {
      return { ok: false, message: "TOKEN_ENCRYPTION_KEY mangler i Vercel – se README." };
    }
    return { ok: false, message: "Noe gikk galt under innloggingen hos Oda." };
  }
}

/** Slår «Husk passordet» av (glemmer passordet). Å slå det på krever ny innlogging med passord. */
export async function forgetOdaPassword(): Promise<OdaResult> {
  await requireFamily();
  const db = createAdminClient();
  await db.from("oda_connection").update({ password_encrypted: null }).eq("id", 1);
  return { ok: true, message: "Passordet er glemt" };
}

export async function disconnectOda(): Promise<OdaResult> {
  await requireFamily();
  await deleteOdaSession();
  return { ok: true, message: "Koblet fra Oda" };
}

const addSchema = z.object({
  lines: z
    .array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(50) }))
    .min(1, "Velg minst én vare")
    .max(150),
  checkItemIds: z.array(z.uuid()).max(300),
});

/**
 * Legger de godkjente varene i Oda-handlekurven – aldri en bestilling. Familien fullfører i Oda.
 * Valgfritt: huker av de tilsvarende varene på handlelisten.
 */
export async function addToOdaCart(input: z.input<typeof addSchema>): Promise<OdaResult & { itemCount?: number; total?: string | null }> {
  await requireFamily();
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  try {
    // Samme produkt flere ganger slås sammen.
    const merged = new Map<number, number>();
    for (const l of parsed.data.lines) merged.set(l.productId, (merged.get(l.productId) ?? 0) + l.quantity);
    const cart = await withOda((oda) => oda.addToCart([...merged].map(([productId, quantity]) => ({ productId, quantity }))));

    if (parsed.data.checkItemIds.length) {
      const db = await getDb();
      await db
        .from("shopping_items")
        .update({ checked: true, checked_at: new Date().toISOString() })
        .in("id", parsed.data.checkItemIds);
      await broadcastChange(SHOPPING_TOPIC);
    }
    return {
      ok: true,
      itemCount: cart.itemCount,
      total: cart.total,
      message: `Lagt i Oda-handlekurven 🛒 (${cart.itemCount} varer${cart.total ? `, ${cart.total} kr` : ""})`,
    };
  } catch (e) {
    if (e instanceof OdaError) return { ok: false, needsLogin: e.kind === "auth", message: e.message };
    return { ok: false, message: "Noe gikk galt hos Oda. Ingenting ble bestilt." };
  }
}
