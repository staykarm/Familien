"use client";

import { createUpload } from "@/actions/files";
import { createClient } from "@/lib/supabase/client";

/**
 * Laster en fil rett til Supabase Storage (via signert URL) og registrerer den i «Les inn fil».
 * Brukes av «Les inn fil» og «Si det». Tolkningen startes etterpå med `analyzeUpload`.
 */
export async function uploadForAnalysis(
  file: File,
  opts: { filename?: string; memberIds?: string[] } = {}
): Promise<{ ok: boolean; message?: string; uploadId?: string }> {
  const mime = file.type || (file.name.endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "");
  const created = await createUpload({ filename: opts.filename ?? file.name, mime, size: file.size, memberIds: opts.memberIds ?? [] });
  if (!created.ok || !created.uploadId || !created.path || !created.token) return { ok: false, message: created.message ?? "Kunne ikke laste opp" };
  const { error } = await createClient().storage.from("uploads").uploadToSignedUrl(created.path, created.token, file, { contentType: mime });
  if (error) return { ok: false, message: "Opplastingen feilet. Prøv igjen.", uploadId: created.uploadId };
  return { ok: true, uploadId: created.uploadId };
}

/** Ber Claude tolke en opplastet fil. Svaret er en kort melding til brukeren. */
export async function analyzeUpload(uploadId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`/api/uploads/${uploadId}/analyze`, { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    return { ok: res.ok && body.ok !== false, message: body.message ?? (res.ok ? "Ferdig" : "Tolkningen feilet") };
  } catch {
    return { ok: false, message: "Mistet forbindelsen under tolkningen. Prøv «Tolk på nytt»." };
  }
}
