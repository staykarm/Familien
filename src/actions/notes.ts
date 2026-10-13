"use server";

import { z } from "zod";
import type { Json } from "@/lib/database.types";
import { checklistStats, docToPlainText, titleAndPreview, type DocNode } from "@/lib/notes/text";
import type { NoteFull, NoteSummary } from "@/lib/notes/types";
import { broadcastChange, NOTES_TOPIC } from "@/lib/realtime";
import { requireFamily } from "@/lib/session";
import { getDb } from "@/lib/supabase/db";
import { saveNoteSchema } from "@/lib/validation/note";

const TRASH_DAYS = 30;

interface NoteRow {
  id: string;
  owner_id: string | null;
  title: string;
  plain_text: string;
  pinned: boolean;
  updated_at: string;
  deleted_at: string | null;
  content: Json;
  version: number;
}

function toSummary(r: NoteRow): NoteSummary {
  const { preview } = titleAndPreview(r.plain_text);
  return {
    id: r.id,
    title: r.title,
    preview,
    ownerId: r.owner_id,
    pinned: r.pinned,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    checklist: checklistStats(r.content as unknown as DocNode),
  };
}

export interface NoteResult {
  ok: boolean;
  message?: string;
  conflict?: boolean;
  note?: NoteFull;
}

const uuid = z.uuid();

/** Alle notater (uten fullt innhold i svaret) inkludert «Nylig slettet» de siste 30 dagene. */
export async function listNotes(): Promise<NoteSummary[]> {
  await requireFamily();
  const db = await getDb();
  const since = new Date(Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await db
    .from("notes")
    .select("id, owner_id, title, plain_text, pinned, updated_at, deleted_at, content, version")
    .or(`deleted_at.is.null,deleted_at.gte.${since}`)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });
  return (data ?? []).map(toSummary);
}

export async function getNote(id: string): Promise<NoteFull | null> {
  await requireFamily();
  if (!uuid.safeParse(id).success) return null;
  const db = await getDb();
  const { data } = await db
    .from("notes")
    .select("id, owner_id, title, plain_text, pinned, updated_at, deleted_at, content, version")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return { ...toSummary(data), content: data.content as unknown as DocNode, version: data.version };
}

export async function createNote(ownerId: string | null): Promise<NoteResult> {
  const session = await requireFamily();
  const owner = ownerId && uuid.safeParse(ownerId).success ? ownerId : (session.activeMember?.id ?? null);
  const db = await getDb();
  const { data, error } = await db.from("notes").insert({ owner_id: owner }).select("id").maybeSingle();
  if (error || !data) return { ok: false, message: "Kunne ikke lage notat" };
  await broadcastChange(NOTES_TOPIC, { id: data.id });
  const note = await getNote(data.id);
  return { ok: true, note: note ?? undefined };
}

/**
 * Lagrer innholdet hvis ingen andre har endret notatet siden `version`.
 * Ellers returneres conflict, og klienten viser den nyeste versjonen.
 */
export async function saveNote(input: z.input<typeof saveNoteSchema>): Promise<NoteResult> {
  await requireFamily();
  const parsed = saveNoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { id, version, content } = parsed.data;

  const plain = docToPlainText(content as DocNode);
  const { title } = titleAndPreview(plain);
  const db = await getDb();
  const { data, error } = await db
    .from("notes")
    .update({ content: content as unknown as Json, plain_text: plain, title, version: version + 1 })
    .eq("id", id)
    .eq("version", version)
    .select("id, owner_id, title, plain_text, pinned, updated_at, deleted_at, content, version")
    .maybeSingle();
  if (error) return { ok: false, message: "Kunne ikke lagre notatet" };
  if (!data) return { ok: false, conflict: true, message: "Notatet ble endret på en annen skjerm" };

  await broadcastChange(NOTES_TOPIC, { id, version: data.version });
  return { ok: true, note: { ...toSummary(data), content: data.content as unknown as DocNode, version: data.version } };
}

async function patch(id: string, fields: { pinned?: boolean; owner_id?: string | null; deleted_at?: string | null }) {
  await requireFamily();
  if (!uuid.safeParse(id).success) return { ok: false, message: "Ugyldig notat" };
  const db = await getDb();
  const { error } = await db.from("notes").update(fields).eq("id", id);
  if (error) return { ok: false, message: "Kunne ikke oppdatere notatet" };
  await broadcastChange(NOTES_TOPIC, { id });
  return { ok: true };
}

export async function setNotePinned(id: string, pinned: boolean): Promise<NoteResult> {
  return patch(id, { pinned });
}

export async function setNoteOwner(id: string, ownerId: string | null): Promise<NoteResult> {
  if (ownerId && !uuid.safeParse(ownerId).success) return { ok: false, message: "Ugyldig person" };
  return patch(id, { owner_id: ownerId });
}

export async function trashNote(id: string): Promise<NoteResult> {
  const res = await patch(id, { deleted_at: new Date().toISOString(), pinned: false });
  return { ...res, message: res.ok ? "Flyttet til Nylig slettet" : res.message };
}

export async function restoreNote(id: string): Promise<NoteResult> {
  const res = await patch(id, { deleted_at: null });
  return { ...res, message: res.ok ? "Notatet er gjenopprettet" : res.message };
}

export async function deleteNoteForever(id: string): Promise<NoteResult> {
  await requireFamily();
  if (!uuid.safeParse(id).success) return { ok: false, message: "Ugyldig notat" };
  const db = await getDb();
  // Bare notater som allerede ligger i «Nylig slettet» kan slettes for godt.
  const { error } = await db.from("notes").delete().eq("id", id).not("deleted_at", "is", null);
  if (error) return { ok: false, message: "Kunne ikke slette notatet" };
  await broadcastChange(NOTES_TOPIC, { id });
  return { ok: true, message: "Slettet for godt" };
}
