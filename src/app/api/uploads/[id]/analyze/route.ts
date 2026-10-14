import { NextResponse } from "next/server";
import { z } from "zod";
import type { Json } from "@/lib/database.types";
import { ExtractionError, extractSuggestions } from "@/lib/ai/extract";
import { loadLearning } from "@/lib/ai/learningDb";
import { requireFamily } from "@/lib/session";
import { getDb } from "@/lib/supabase/db";
import { parseDetails } from "@/lib/validation/profile";

// Tolkning av store PDF-er kan ta litt tid.
export const maxDuration = 300;

/** Steg 2: Claude leser filen og lager forslag som venter på godkjenning. */
export async function POST(_req: Request, ctx: RouteContext<"/api/uploads/[id]/analyze">) {
  const session = await requireFamily();
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ ok: false, message: "Ugyldig fil" }, { status: 400 });

  const db = await getDb();
  const { data: upload } = await db
    .from("uploads")
    .select("id, storage_path, filename, mime, status, analyzed_at")
    .eq("id", id)
    .maybeSingle();
  if (!upload) return NextResponse.json({ ok: false, message: "Fant ikke filen" }, { status: 404 });
  // analyzed_at settes når tolkningen starter. Er den eldre enn 6 min, ble den trolig avbrutt – da kan man prøve igjen.
  const startedRecently = upload.analyzed_at && Date.now() - new Date(upload.analyzed_at).getTime() < 6 * 60_000;
  if (upload.status === "analyzing" && startedRecently) {
    return NextResponse.json({ ok: false, message: "Filen tolkes allerede" }, { status: 409 });
  }

  await db.from("uploads").update({ status: "analyzing", error: null, analyzed_at: new Date().toISOString() }).eq("id", id);

  const fail = async (message: string) => {
    await db.from("uploads").update({ status: "failed", error: message }).eq("id", id);
    return NextResponse.json({ ok: false, message }, { status: 200 });
  };

  try {
    const { data: blob, error } = await db.storage.from("uploads").download(upload.storage_path);
    if (error || !blob) return fail("Fant ikke filen i lagringen. Prøv å laste den opp på nytt.");

    const [{ data: categories }, learning] = await Promise.all([
      db.from("categories").select("name").eq("scope", "event").order("sort_order"),
      loadLearning(db, session.members),
    ]);
    const result = await extractSuggestions(
      { data: Buffer.from(await blob.arrayBuffer()), mime: upload.mime, filename: upload.filename },
      {
        members: session.members.map((m) => ({ name: m.name, isShared: m.is_shared, details: parseDetails(m.details) })),
        eventCategories: (categories ?? []).map((c) => c.name),
        learning,
      }
    );

    // Tolk på nytt = erstatt ventende forslag; godkjente/avviste beholdes.
    await db.from("suggestions").delete().eq("upload_id", id).eq("status", "pending");
    const rows = [
      ...result.events.map((p) => ({ upload_id: id, kind: "event" as const, payload: p as unknown as Json })),
      ...result.tasks.map((p) => ({ upload_id: id, kind: "task" as const, payload: p as unknown as Json })),
      ...result.shopping.map((p) => ({ upload_id: id, kind: "shopping" as const, payload: p as unknown as Json })),
    ];
    if (rows.length) await db.from("suggestions").insert(rows);
    await db
      .from("uploads")
      .update({ status: "done", summary: result.summary, analyzed_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ ok: true, message: rows.length ? `${rows.length} forslag klare` : "Fant ingenting å legge inn" });
  } catch (err) {
    if (err instanceof ExtractionError) return fail(err.message);
    if (err instanceof Error && err.message.includes("ANTHROPIC_API_KEY")) {
      return fail("ANTHROPIC_API_KEY mangler i Vercel.");
    }
    console.error("Tolkning feilet", err);
    return fail("Noe gikk galt under tolkningen. Prøv igjen.");
  }
}
