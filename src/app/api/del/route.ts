import { NextResponse } from "next/server";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "@/lib/ai/extract";
import { guessMime, storagePath } from "@/lib/files/names";
import { requireFamily } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDb } from "@/lib/supabase/db";

export const maxDuration = 60;

/**
 * Mottar filer og tekst som deles til appen:
 * - fra delingsmenyen på Android/PC når appen er installert (PWA «share_target» i manifest.ts), og
 * - fra en iPhone-snarvei (Snarveier → «Hent innholdet i URL»), siden iOS ikke støtter share_target.
 * Filene lagres som opplastinger, og brukeren sendes til «Les inn fil», som tolker dem med Claude.
 *
 * Snarveier har ingen innlogging. Med AUTH_ENABLED må de sende `Authorization: Bearer <SHARE_TOKEN>`.
 * Svar: omdirigering til /filer, eller JSON `{ ok, url, message }` når `Accept: application/json`.
 */
export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  const wantsJson = (req.headers.get("accept") ?? "").includes("application/json");
  const token = process.env.SHARE_TOKEN;
  const viaToken = !!token && req.headers.get("authorization") === `Bearer ${token}`;
  const session = viaToken ? null : await requireFamily();
  const db = viaToken ? createAdminClient() : await getDb();

  const reply = (ids: string[], message?: string) => {
    const url = ids.length ? `${origin}/filer?tolk=${ids.join(",")}` : `${origin}/filer?delt=${encodeURIComponent(message ?? "feil")}`;
    return wantsJson ? NextResponse.json({ ok: ids.length > 0, url, message }) : NextResponse.redirect(url, 303);
  };

  const form = await req.formData().catch(() => null);
  if (!form) return reply([], "Fant ikke noe å lese i det som ble delt.");

  const files = form.getAll("filer").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f && f.size > 0);
  const text = ["title", "text", "url"]
    .map((k) => form.get(k))
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .join("\n")
    .trim();

  const items: { name: string; mime: string; body: Blob }[] = files.slice(0, 5).map((f) => ({
    name: f.name || "Delt fil",
    // Uten kjent type sendes filen som «application/octet-stream»; da gjetter vi ut fra navnet.
    mime: f.type && f.type !== "application/octet-stream" ? f.type : guessMime(f.name),
    body: f,
  }));
  // Bare tekst (f.eks. en e-post eller melding): lagres som tekstfil og tolkes på samme måte.
  if (items.length === 0 && text) items.push({ name: "Delt tekst.txt", mime: "text/plain", body: new Blob([text], { type: "text/plain" }) });
  if (items.length === 0) return reply([], "Fant ingen fil i det som ble delt.");

  const ids: string[] = [];
  let skipped = 0;
  for (const item of items) {
    if (!ALLOWED_UPLOAD_TYPES.includes(item.mime) || item.body.size > MAX_UPLOAD_BYTES) {
      skipped++;
      continue;
    }
    const path = storagePath(item.name);
    const { error: upErr } = await db.storage.from("uploads").upload(path, item.body, { contentType: item.mime });
    if (upErr) {
      skipped++;
      continue;
    }
    const { data } = await db
      .from("uploads")
      .insert({
        storage_path: path,
        filename: item.name.slice(0, 200),
        mime: item.mime,
        size_bytes: item.body.size,
        uploaded_by: session?.activeMember?.id ?? null,
      })
      .select("id")
      .maybeSingle();
    if (data) ids.push(data.id);
    else skipped++;
  }

  return reply(ids, skipped ? `${skipped} fil(er) kunne ikke leses. Bruk bilde, PDF, Word eller tekst.` : undefined);
}
