"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveEvent } from "@/actions/events";
import { addItem } from "@/actions/shopping";
import { saveTask } from "@/actions/tasks";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "@/lib/ai/extract";
import { applyPeople, eventSuggestionToForm, taskSuggestionToForm } from "@/lib/ai/map";
import { eventSuggestionSchema, shoppingSuggestionSchema, taskSuggestionSchema } from "@/lib/ai/schema";
import type { Json } from "@/lib/database.types";
import type { Suggestion, UploadWithSuggestions } from "@/lib/ai/types";
import { storagePath } from "@/lib/files/names";
import { requireFamily } from "@/lib/session";
import { getDb } from "@/lib/supabase/db";

export interface FileResult {
  ok: boolean;
  message?: string;
}

const uuid = z.uuid();

/**
 * Steg 1: registrer opplastingen og gi nettleseren en signert URL, slik at filen lastes rett til
 * Supabase Storage (Vercel tillater ikke store filer gjennom serveren).
 */
export async function createUpload(input: { filename: string; mime: string; size: number; memberIds?: string[] }): Promise<
  FileResult & { uploadId?: string; path?: string; token?: string }
> {
  const session = await requireFamily();
  const parsed = z
    .object({
      filename: z.string().trim().min(1).max(200),
      mime: z.string().refine((m) => ALLOWED_UPLOAD_TYPES.includes(m), "Filtypen støttes ikke. Bruk PDF, bilde, Word eller tekst."),
      size: z.number().int().positive().max(MAX_UPLOAD_BYTES, "Filen er større enn 20 MB"),
      memberIds: z.array(z.uuid()).max(20).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const { filename, mime, size } = parsed.data;
  const memberIds = (parsed.data.memberIds ?? []).filter((id) => session.members.some((m) => m.id === id));
  const path = storagePath(filename);
  const db = await getDb();
  const { data: signed, error: signError } = await db.storage.from("uploads").createSignedUploadUrl(path);
  if (signError || !signed) return { ok: false, message: "Kunne ikke starte opplastingen" };

  const { data, error } = await db
    .from("uploads")
    .insert({ storage_path: path, filename, mime, size_bytes: size, uploaded_by: session.activeMember?.id ?? null, member_ids: memberIds })
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, message: "Kunne ikke registrere filen" };
  return { ok: true, uploadId: data.id, path, token: signed.token };
}

export async function listUploads(): Promise<UploadWithSuggestions[]> {
  await requireFamily();
  const db = await getDb();
  const { data: uploads } = await db
    .from("uploads")
    .select("id, filename, mime, size_bytes, status, error, summary, created_at, member_ids")
    .order("created_at", { ascending: false })
    .limit(30);
  if (!uploads?.length) return [];
  const { data: suggestions } = await db
    .from("suggestions")
    .select("id, upload_id, kind, payload, status")
    .in(
      "upload_id",
      uploads.map((u) => u.id)
    )
    .order("created_at");

  return uploads.map((u) => ({
    id: u.id,
    filename: u.filename,
    mime: u.mime,
    sizeBytes: u.size_bytes,
    status: u.status,
    error: u.error,
    summary: u.summary,
    createdAt: u.created_at,
    memberIds: u.member_ids ?? [],
    suggestions: (suggestions ?? [])
      .filter((s) => s.upload_id === u.id)
      .flatMap((s): Suggestion[] => {
        const schema = s.kind === "event" ? eventSuggestionSchema : s.kind === "task" ? taskSuggestionSchema : shoppingSuggestionSchema;
        const payload = schema.safeParse(s.payload);
        return payload.success ? [{ id: s.id, kind: s.kind, status: s.status, payload: payload.data } as Suggestion] : [];
      }),
  }));
}

/**
 * «Alt i filen gjelder …»: lagrer valget og setter personene på alle forslag som ikke er behandlet ennå.
 * Tom liste fjerner bare valget; forslagene beholder personene de har.
 */
export async function setUploadPeople(uploadId: string, memberIds: string[]): Promise<FileResult> {
  const session = await requireFamily();
  const parsed = z.object({ uploadId: z.uuid(), memberIds: z.array(z.uuid()).max(20) }).safeParse({ uploadId, memberIds });
  if (!parsed.success) return { ok: false, message: "Ugyldig valg" };
  const chosen = session.members.filter((m) => parsed.data.memberIds.includes(m.id));

  const db = await getDb();
  const { error } = await db.from("uploads").update({ member_ids: chosen.map((m) => m.id) }).eq("id", uploadId);
  if (error) return { ok: false, message: "Kunne ikke lagre valget" };
  if (!chosen.length) return { ok: true };

  const names = chosen.map((m) => m.name);
  const { data: rows } = await db.from("suggestions").select("id, kind, payload").eq("upload_id", uploadId).eq("status", "pending");
  for (const row of rows ?? []) {
    if (row.kind === "shopping") continue;
    const p = row.payload as { participants?: string[]; assignee?: string | null };
    const next =
      row.kind === "event"
        ? applyPeople({ events: [{ participants: p.participants ?? [] }], tasks: [] }, names).events[0]
        : applyPeople({ events: [], tasks: [{ assignee: p.assignee ?? null }] }, names).tasks[0];
    await db
      .from("suggestions")
      .update({ payload: { ...(row.payload as object), ...next } as unknown as Json })
      .eq("id", row.id);
  }
  revalidatePath("/filer");
  return { ok: true, message: `Gjelder ${names.join(" og ")}` };
}

/** Signert lenke til originalfilen (gyldig i 10 minutter). */
export async function getUploadUrl(uploadId: string): Promise<string | null> {
  await requireFamily();
  if (!uuid.safeParse(uploadId).success) return null;
  const db = await getDb();
  const { data: upload } = await db.from("uploads").select("storage_path").eq("id", uploadId).maybeSingle();
  if (!upload) return null;
  const { data } = await db.storage.from("uploads").createSignedUrl(upload.storage_path, 600);
  return data?.signedUrl ?? null;
}

async function loadSuggestion(id: string) {
  const db = await getDb();
  const { data } = await db.from("suggestions").select("id, kind, payload, status").eq("id", id).maybeSingle();
  return data;
}

async function decide(id: string, status: "approved" | "rejected", createdRef: string | null = null) {
  const db = await getDb();
  await db.from("suggestions").update({ status, created_ref: createdRef, decided_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/filer");
}

/** Godkjenn et forslag slik det er: lager aktiviteten/oppgaven/varen. */
export async function approveSuggestion(id: string): Promise<FileResult> {
  const session = await requireFamily();
  if (!uuid.safeParse(id).success) return { ok: false, message: "Ugyldig forslag" };
  const s = await loadSuggestion(id);
  if (!s) return { ok: false, message: "Fant ikke forslaget" };
  if (s.status !== "pending") return { ok: false, message: "Forslaget er allerede behandlet" };

  const members = session.members.map((m) => ({ id: m.id, name: m.name }));
  const fellesId = session.members.find((m) => m.is_shared)?.id ?? null;

  if (s.kind === "event") {
    const payload = eventSuggestionSchema.safeParse(s.payload);
    if (!payload.success) return { ok: false, message: "Forslaget er ugyldig" };
    const db = await getDb();
    const { data: cats } = await db.from("categories").select("id, name").eq("scope", "event");
    const res = await saveEvent(eventSuggestionToForm(payload.data, members, cats ?? [], fellesId));
    if (!res.ok) return { ok: false, message: `${res.message ?? "Kunne ikke lage aktiviteten"} – trykk «Endre» for å rette.` };
    await decide(id, "approved", res.id ?? null);
    return { ok: true, message: "Lagt i kalenderen" };
  }

  if (s.kind === "task") {
    const payload = taskSuggestionSchema.safeParse(s.payload);
    if (!payload.success) return { ok: false, message: "Forslaget er ugyldig" };
    const res = await saveTask(taskSuggestionToForm(payload.data, members));
    if (!res.ok) return { ok: false, message: res.message };
    await decide(id, "approved", res.task?.id ?? null);
    return { ok: true, message: "Lagt til i oppgaver" };
  }

  const payload = shoppingSuggestionSchema.safeParse(s.payload);
  if (!payload.success) return { ok: false, message: "Forslaget er ugyldig" };
  const res = await addItem({ name: payload.data.name, quantity: payload.data.quantity, categoryId: null });
  // Står varen allerede på listen, er forslaget likevel ivaretatt.
  await decide(id, "approved");
  return { ok: true, message: res.ok ? "Lagt på handlelisten" : res.message };
}

/** Når forslaget er endret og lagret via en dialog (aktivitet/oppgave), eller varen er endret før godkjenning. */
export async function markSuggestionApproved(id: string, createdRef: string | null): Promise<FileResult> {
  await requireFamily();
  if (!uuid.safeParse(id).success) return { ok: false, message: "Ugyldig forslag" };
  await decide(id, "approved", createdRef && uuid.safeParse(createdRef).success ? createdRef : null);
  return { ok: true };
}

export async function rejectSuggestion(id: string): Promise<FileResult> {
  await requireFamily();
  if (!uuid.safeParse(id).success) return { ok: false, message: "Ugyldig forslag" };
  await decide(id, "rejected");
  return { ok: true };
}

/** Godkjenn alle ventende forslag fra én fil. */
export async function approveAll(uploadId: string): Promise<FileResult> {
  await requireFamily();
  if (!uuid.safeParse(uploadId).success) return { ok: false, message: "Ugyldig fil" };
  const db = await getDb();
  const { data } = await db.from("suggestions").select("id").eq("upload_id", uploadId).eq("status", "pending");
  let ok = 0;
  const failed: string[] = [];
  for (const s of data ?? []) {
    const res = await approveSuggestion(s.id);
    if (res.ok) ok++;
    else if (res.message) failed.push(res.message);
  }
  return {
    ok: failed.length === 0,
    message: failed.length ? `${ok} lagt til, ${failed.length} trenger en titt` : `${ok} forslag lagt til`,
  };
}

export async function deleteUpload(uploadId: string): Promise<FileResult> {
  await requireFamily();
  if (!uuid.safeParse(uploadId).success) return { ok: false, message: "Ugyldig fil" };
  const db = await getDb();
  const { data: upload } = await db.from("uploads").select("storage_path").eq("id", uploadId).maybeSingle();
  if (!upload) return { ok: false, message: "Fant ikke filen" };
  await db.storage.from("uploads").remove([upload.storage_path]);
  await db.from("uploads").delete().eq("id", uploadId);
  revalidatePath("/filer");
  return { ok: true, message: "Filen er slettet" };
}
