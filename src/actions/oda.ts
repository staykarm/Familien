"use server";

import { z } from "zod";
import { broadcastChange, SHOPPING_TOPIC } from "@/lib/realtime";
import { OdaClient, OdaError } from "@/lib/oda/client";
import { deleteOdaSession, loadOdaClient, odaStatus, saveOdaSession } from "@/lib/oda/session";
import { requireFamily } from "@/lib/session";
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

/** Logger inn hos Oda én gang. Passordet brukes bare til innloggingen; vi lagrer kun den krypterte økten. */
export async function connectOda(input: { email: string; password: string }): Promise<OdaResult> {
  await requireFamily();
  const parsed = z
    .object({ email: z.email("Skriv inn e-posten du bruker hos Oda"), password: z.string().min(1, "Skriv inn passordet") })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  try {
    const client = new OdaClient();
    await client.login(parsed.data.email, parsed.data.password);
    await client.cart(); // bekrefter at økten virker
    await saveOdaSession(client, parsed.data.email);
    return { ok: true, message: "Koblet til Oda 🎉" };
  } catch (e) {
    if (e instanceof OdaError) return { ok: false, message: e.message };
    if (e instanceof Error && e.message.includes("TOKEN_ENCRYPTION_KEY")) {
      return { ok: false, message: "TOKEN_ENCRYPTION_KEY mangler i Vercel – se README." };
    }
    return { ok: false, message: "Noe gikk galt under innloggingen hos Oda." };
  }
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
    const session = await loadOdaClient();
    if (!session) return { ok: false, needsLogin: true, message: "Koble til Oda først." };
    // Samme produkt flere ganger slås sammen.
    const merged = new Map<number, number>();
    for (const l of parsed.data.lines) merged.set(l.productId, (merged.get(l.productId) ?? 0) + l.quantity);
    const cart = await session.client.addToCart([...merged].map(([productId, quantity]) => ({ productId, quantity })));
    await saveOdaSession(session.client, session.email);

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
