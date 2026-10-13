"use server";

import { z } from "zod";
import { broadcastChange, SHOPPING_TOPIC } from "@/lib/realtime";
import { requireFamily } from "@/lib/session";
import { getDb } from "@/lib/supabase/db";
import { guessCategoryName } from "@/lib/shopping/categorize";
import type { ShoppingItem, ShoppingTemplate } from "@/lib/shopping/types";
import {
  itemInputSchema,
  itemUpdateSchema,
  templateSchema,
  type ItemInput,
  type TemplateInput,
} from "@/lib/validation/shopping";

export interface ShoppingResult {
  ok: boolean;
  message?: string;
}

const ITEM_COLUMNS = "id, name, quantity, category_id, checked, checked_at, added_by, created_at";

export interface ShoppingData {
  items: ShoppingItem[];
  templates: ShoppingTemplate[];
}

export async function getShopping(): Promise<ShoppingData> {
  await requireFamily();
  const db = await getDb();
  const [{ data: items }, { data: templates }, { data: templateItems }] = await Promise.all([
    db.from("shopping_items").select(ITEM_COLUMNS).order("created_at"),
    db.from("shopping_templates").select("id, name, icon").order("sort_order").order("name"),
    db.from("shopping_template_items").select("id, template_id, name, quantity, category_id").order("sort_order"),
  ]);
  return {
    items: (items ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      categoryId: i.category_id,
      checked: i.checked,
      checkedAt: i.checked_at,
      addedBy: i.added_by,
      createdAt: i.created_at,
    })),
    templates: (templates ?? []).map((t) => ({
      ...t,
      items: (templateItems ?? [])
        .filter((i) => i.template_id === t.id)
        .map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, categoryId: i.category_id })),
    })),
  };
}

/** Lager en funksjon som gir kategori-id ut fra varenavnet (når ingen er valgt). Henter kategoriene én gang. */
async function categoryResolver(): Promise<(name: string, chosen: string | null) => string | null> {
  const db = await getDb();
  const { data } = await db.from("categories").select("id, name").eq("scope", "shopping");
  const byName = new Map((data ?? []).map((c) => [c.name, c.id]));
  return (name, chosen) => {
    if (chosen) return chosen;
    const guess = guessCategoryName(name);
    return guess ? (byName.get(guess) ?? null) : null;
  };
}

function sameName(a: string, b: string) {
  return a.trim().toLocaleLowerCase("nb") === b.trim().toLocaleLowerCase("nb");
}

export async function addItem(input: ItemInput): Promise<ShoppingResult> {
  const session = await requireFamily();
  const parsed = itemInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { name, quantity, categoryId } = parsed.data;

  const db = await getDb();
  const { data: open } = await db.from("shopping_items").select("id, name").eq("checked", false);
  if (open?.some((i) => sameName(i.name, name))) return { ok: false, message: `«${name}» står allerede på listen` };

  const { error } = await db.from("shopping_items").insert({
    name,
    quantity,
    category_id: (await categoryResolver())(name, categoryId),
    added_by: session.activeMember?.id ?? null,
  });
  if (error) return { ok: false, message: "Kunne ikke legge til varen" };
  await broadcastChange(SHOPPING_TOPIC);
  return { ok: true };
}

export async function updateItem(input: z.input<typeof itemUpdateSchema>): Promise<ShoppingResult> {
  await requireFamily();
  const parsed = itemUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { id, name, quantity, categoryId } = parsed.data;
  const db = await getDb();
  const { error } = await db.from("shopping_items").update({ name, quantity, category_id: categoryId }).eq("id", id);
  if (error) return { ok: false, message: "Kunne ikke lagre varen" };
  await broadcastChange(SHOPPING_TOPIC);
  return { ok: true, message: "Lagret" };
}

export async function toggleItem(id: string, checked: boolean): Promise<ShoppingResult> {
  await requireFamily();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Ugyldig vare" };
  const db = await getDb();
  const { error } = await db
    .from("shopping_items")
    .update({ checked, checked_at: checked ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return { ok: false, message: "Kunne ikke oppdatere" };
  await broadcastChange(SHOPPING_TOPIC);
  return { ok: true };
}

export async function deleteItem(id: string): Promise<ShoppingResult> {
  await requireFamily();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Ugyldig vare" };
  const db = await getDb();
  const { error } = await db.from("shopping_items").delete().eq("id", id);
  if (error) return { ok: false, message: "Kunne ikke slette" };
  await broadcastChange(SHOPPING_TOPIC);
  return { ok: true, message: "Fjernet" };
}

export async function clearChecked(): Promise<ShoppingResult> {
  await requireFamily();
  const db = await getDb();
  const { error } = await db.from("shopping_items").delete().eq("checked", true);
  if (error) return { ok: false, message: "Kunne ikke rydde listen" };
  await broadcastChange(SHOPPING_TOPIC);
  return { ok: true, message: "Avhukede varer er fjernet" };
}

/** Legger varene fra en fast liste inn i handlelisten. Varer som allerede står der (ikke avhuket) hoppes over. */
export async function addTemplateToList(templateId: string): Promise<ShoppingResult> {
  const session = await requireFamily();
  if (!z.uuid().safeParse(templateId).success) return { ok: false, message: "Ugyldig liste" };
  const db = await getDb();
  const [{ data: template }, { data: items }, { data: open }] = await Promise.all([
    db.from("shopping_templates").select("name").eq("id", templateId).maybeSingle(),
    db.from("shopping_template_items").select("name, quantity, category_id").eq("template_id", templateId).order("sort_order"),
    db.from("shopping_items").select("name").eq("checked", false),
  ]);
  if (!template) return { ok: false, message: "Fant ikke listen" };

  const toAdd = (items ?? []).filter((i) => !open?.some((o) => sameName(o.name, i.name)));
  if (toAdd.length === 0) return { ok: true, message: `Alt fra «${template.name}» står allerede på listen` };

  const { error } = await db.from("shopping_items").insert(
    toAdd.map((i) => ({ name: i.name, quantity: i.quantity, category_id: i.category_id, added_by: session.activeMember?.id ?? null }))
  );
  if (error) return { ok: false, message: "Kunne ikke legge til varene" };
  await broadcastChange(SHOPPING_TOPIC);
  const skipped = (items?.length ?? 0) - toAdd.length;
  return {
    ok: true,
    message: `${toAdd.length} varer fra «${template.name}» lagt til${skipped ? ` (${skipped} fantes fra før)` : ""}`,
  };
}

export async function saveTemplate(input: TemplateInput): Promise<ShoppingResult & { id?: string }> {
  await requireFamily();
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { id, name, icon, items } = parsed.data;
  const db = await getDb();

  let templateId = id;
  if (templateId) {
    const { error } = await db.from("shopping_templates").update({ name, icon }).eq("id", templateId);
    if (error) return { ok: false, message: error.code === "23505" ? "Det finnes allerede en liste med det navnet" : "Kunne ikke lagre listen" };
  } else {
    const { data, error } = await db.from("shopping_templates").insert({ name, icon }).select("id").maybeSingle();
    if (error || !data) return { ok: false, message: error?.code === "23505" ? "Det finnes allerede en liste med det navnet" : "Kunne ikke lagre listen" };
    templateId = data.id;
  }

  // Varene erstattes i sin helhet – enkelt og forutsigbart for små lister.
  await db.from("shopping_template_items").delete().eq("template_id", templateId);
  if (items.length) {
    const resolve = await categoryResolver();
    const rows = items.map((i, idx) => ({
      template_id: templateId!,
      name: i.name,
      quantity: i.quantity,
      category_id: resolve(i.name, i.categoryId),
      sort_order: idx,
    }));
    const { error } = await db.from("shopping_template_items").insert(rows);
    if (error) return { ok: false, message: "Kunne ikke lagre varene i listen" };
  }
  await broadcastChange(SHOPPING_TOPIC);
  return { ok: true, message: `«${name}» er lagret`, id: templateId };
}

export async function deleteTemplate(id: string): Promise<ShoppingResult> {
  await requireFamily();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Ugyldig liste" };
  const db = await getDb();
  const { error } = await db.from("shopping_templates").delete().eq("id", id);
  if (error) return { ok: false, message: "Kunne ikke slette listen" };
  await broadcastChange(SHOPPING_TOPIC);
  return { ok: true, message: "Listen er slettet" };
}
