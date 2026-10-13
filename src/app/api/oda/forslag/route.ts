import { NextResponse } from "next/server";
import { z } from "zod";
import { AgentError, proposeOdaCart, type WantedItem } from "@/lib/oda/agent";
import { OdaError } from "@/lib/oda/client";
import { loadOdaClient, saveOdaSession } from "@/lib/oda/session";
import { requireFamily } from "@/lib/session";
import { getDb } from "@/lib/supabase/db";

// Søk hos Oda + agenten kan ta litt tid for lange lister.
export const maxDuration = 300;

const bodySchema = z.union([z.object({ source: z.literal("list") }), z.object({ source: z.literal("template"), templateId: z.uuid() })]);

/** Lager et forslag til Oda-handlekurv fra handlelisten eller en fast liste. Legger ingenting i kurven. */
export async function POST(req: Request) {
  await requireFamily();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Ugyldig forespørsel" }, { status: 400 });

  const db = await getDb();
  let items: (WantedItem & { id?: string })[];
  if (parsed.data.source === "list") {
    const { data } = await db.from("shopping_items").select("id, name, quantity").eq("checked", false).order("created_at");
    items = (data ?? []).map((i) => ({ id: i.id, name: i.name, quantity: i.quantity }));
  } else {
    const { data } = await db
      .from("shopping_template_items")
      .select("name, quantity")
      .eq("template_id", parsed.data.templateId)
      .order("sort_order");
    items = (data ?? []).map((i) => ({ name: i.name, quantity: i.quantity }));
  }
  if (items.length === 0) return NextResponse.json({ ok: false, message: "Listen er tom." });
  if (items.length > 60) return NextResponse.json({ ok: false, message: "Maks 60 varer om gangen." });

  try {
    const session = await loadOdaClient();
    if (!session) return NextResponse.json({ ok: false, needsLogin: true, message: "Koble til Oda først." });
    const proposal = await proposeOdaCart(
      session.client,
      items.map(({ name, quantity }) => ({ name, quantity }))
    );
    await saveOdaSession(session.client, session.email);
    return NextResponse.json({ ok: true, proposal, itemIds: items.map((i) => i.id ?? null) });
  } catch (e) {
    if (e instanceof OdaError) return NextResponse.json({ ok: false, needsLogin: e.kind === "auth", message: e.message });
    if (e instanceof AgentError) return NextResponse.json({ ok: false, message: e.message });
    if (e instanceof Error && e.message.includes("ANTHROPIC_API_KEY")) {
      return NextResponse.json({ ok: false, message: "ANTHROPIC_API_KEY mangler i Vercel." });
    }
    console.error("Oda-forslag feilet", e);
    return NextResponse.json({ ok: false, message: "Noe gikk galt. Prøv igjen." }, { status: 500 });
  }
}
