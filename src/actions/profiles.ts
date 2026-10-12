"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/supabase/db";
import { requireFamily } from "@/lib/session";
import { isAllowedAvatar, profileSchema } from "@/lib/validation/profile";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export async function updateProfile(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireFamily();
  let details: unknown;
  try {
    details = JSON.parse(String(formData.get("details") ?? "[]"));
  } catch {
    return { ok: false, message: "Ugyldige detaljer" };
  }
  const parsed = profileSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    color: formData.get("color"),
    icon: formData.get("icon"),
    details,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const { id, ...fields } = parsed.data;
  const supabase = await getDb();
  const { error, count } = await supabase.from("members").update(fields, { count: "exact" }).eq("id", id);
  if (error || count === 0) return { ok: false, message: "Kunne ikke lagre profilen" };

  revalidatePath("/", "layout");
  return { ok: true, message: "Lagret!" };
}

export async function uploadAvatar(memberId: string, formData: FormData): Promise<ActionResult> {
  await requireFamily();
  const file = formData.get("avatar");
  if (!(file instanceof File)) return { ok: false, message: "Mangler bilde" };
  const problem = isAllowedAvatar(file);
  if (problem) return { ok: false, message: problem };

  const supabase = await getDb();
  const { data: member } = await supabase.from("members").select("id, avatar_path").eq("id", memberId).maybeSingle();
  if (!member) return { ok: false, message: "Fant ikke medlemmet" };

  // Ny sti for hvert bilde, så gamle signerte URL-er og nettleserbuffer ikke viser forrige bilde.
  const ext = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "webp";
  const path = `${member.id}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return { ok: false, message: "Opplastingen feilet" };

  const { error } = await supabase.from("members").update({ avatar_path: path }).eq("id", member.id);
  if (error) return { ok: false, message: "Kunne ikke lagre bildet" };
  if (member.avatar_path) await supabase.storage.from("avatars").remove([member.avatar_path]);

  revalidatePath("/", "layout");
  return { ok: true, message: "Nytt bilde lagret!" };
}

export async function removeAvatar(memberId: string): Promise<ActionResult> {
  await requireFamily();
  const supabase = await getDb();
  const { data: member } = await supabase.from("members").select("id, avatar_path").eq("id", memberId).maybeSingle();
  if (!member?.avatar_path) return { ok: true };
  await supabase.from("members").update({ avatar_path: null }).eq("id", member.id);
  await supabase.storage.from("avatars").remove([member.avatar_path]);
  revalidatePath("/", "layout");
  return { ok: true, message: "Bildet er fjernet" };
}
