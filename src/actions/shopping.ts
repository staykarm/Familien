"use server";

import { after } from "next/server";
import { z } from "zod";
import { classifyShoppingItems } from "@/lib/ai/shoppingCategories";
import { broadcastChange, SHOPPING_TOPIC } from "@/lib/realtime";
import { notifyShopping } from "@/lib/push/notify";
import { requireFamily } from "@/lib/session";
import { getDb } from "@/lib/supabase/db";
import { guessCategoryName, itemKey } from "@/lib/shopping/categorize";
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
  /** Varene slik de var før de ble fjernet – til «Angre». */
  deleted?: ShoppingItem[];
}

const ITEM_COLUMNS = "id, name, quantity, category_id, checked, checked_at, added_by, created_at";

export interface ShoppingData {
  items: ShoppingItem[];
  templates: ShoppingTemplate[];
}

type ItemRow = {
  id: string;
  name: string;
  quantity: string | null;
  category_id: string | null;
  checked: boolean;
  checked_at: string | null;
  added_by: string | null;
  created_at: string;
};

function toItem(i: ItemRow): ShoppingItem {
  return {
    id: i.id,
    name: i.name,
    quantity: i.quantity,
    categoryId: i.category_id,
    checked: i.checked,
    checkedAt: i.checked_at,
    addedBy: i.added_by,
    createdAt: i.created_at,
  };
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
    items: (items ?? []).map(toItem),
    templates: (templates ?? []).map((t) => ({
      ...t,
      items: (templateItems ?? [])
        .filter((i) => i.template_id === t.id)
        .map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, categoryId: i.category_id })),
    })),
  };
}

type Db = Awaited<ReturnType<typeof getDb>>;

/**
 * Lager en funksjon som gir kategori-id ut fra varenavnet når ingen er valgt:
 * først det familien har valgt før (minnet), så ordlisten. Ukjente varer gir null og sorteres av Claude etterpå.
 */
async function categoryResolver(db?: Db): Promise<(name: string, chosen: string | null) => string | null> {
  db ??= await getDb();
  const [{ data: cats }, { data: memory }] = await Promise.all([
    db.from("categories").select("id, name").eq("scope", "shopping"),
    db.from("shopping_category_memory").select("name_key, category_id"),
  ]);
  const byName = new Map((cats ?? []).map((c) => [c.name, c.id]));
  const remembered = new Map((memory ?? []).map((m) => [m.name_key, m.category_id]));
  return (name, chosen) => {
    if (chosen) return chosen;
    const fromMemory = remembered.get(itemKey(name));
    if (fromMemory) return fromMemory;
    const guess = guessCategoryName(name);
    return guess ? (byName.get(guess) ?? null) : null;
  };
}

/** Husker avdelingen familien har valgt for en vare. Valg fra familien går alltid foran Claude sitt. */
async function rememberCategory(db: Db, name: string, categoryId: string) {
  const { error } = await db
    .from("shopping_category_memory")
    .upsert({ name_key: itemKey(name), category_id: categoryId, source: "user", updated_at: new Date().toISOString() });
  if (error) console.warn("Kunne ikke huske kategorien", error.message);
}

/**
 * Varer uten avdeling (og, med `includeOther`, varer i «Annet») sorteres: først med minnet og ordlisten,
 * så spør vi Claude om resten. Det Claude svarer, huskes, så samme vare ikke spørres om igjen.
 * Gir antall varer som fikk ny avdeling.
 */
async function sortUncategorized(db: Db, includeOther = false): Promise<number> {
  const [{ data: cats }, { data: items }, { data: memory }] = await Promise.all([
    db.from("categories").select("id, name").eq("scope", "shopping"),
    db.from("shopping_items").select("id, name, category_id").eq("checked", false),
    db.from("shopping_category_memory").select("name_key, category_id, source").eq("source", "user").order("updated_at", { ascending: false }).limit(60),
  ]);
  if (!cats?.length || !items?.length) return 0;
  const otherId = cats.find((c) => c.name === "Annet")?.id ?? null;
  const known = new Set(cats.map((c) => c.id));
  const todo = items.filter((i) => !i.category_id || !known.has(i.category_id) || (includeOther && i.category_id === otherId));
  if (!todo.length) return 0;

  const resolve = await categoryResolver(db);
  const updates = new Map<string, string>();
  const unknown: typeof todo = [];
  for (const item of todo) {
    const id = resolve(item.name, null);
    if (id && id !== item.category_id && id !== otherId) updates.set(item.id, id);
    else unknown.push(item);
  }

  if (unknown.length) {
    const nameOf = new Map(cats.map((c) => [c.id, c.name]));
    const examples = (memory ?? []).flatMap((m) => (nameOf.has(m.category_id) ? [{ name: m.name_key, category: nameOf.get(m.category_id)! }] : []));
    const names = [...new Set(unknown.map((i) => i.name))];
    const answer = await classifyShoppingItems(names, cats.map((c) => c.name), examples);
    const idOf = new Map(cats.map((c) => [c.name, c.id]));
    const learned: { name_key: string; category_id: string; source: "ai" }[] = [];
    for (const item of unknown) {
      const category = answer.get(item.name);
      const id = category ? idOf.get(category) : undefined;
      if (!id) continue;
      if (id !== item.category_id) updates.set(item.id, id);
      learned.push({ name_key: itemKey(item.name), category_id: id, source: "ai" });
    }
    if (learned.length) {
      // Aldri overskriv det familien har valgt selv.
      await db.from("shopping_category_memory").upsert(learned, { onConflict: "name_key", ignoreDuplicates: true });
    }
  }

  await Promise.all([...updates].map(([id, categoryId]) => db.from("shopping_items").update({ category_id: categoryId }).eq("id", id)));
  return updates.size;
}

/** Etter at varer er lagt til: sorter de ukjente i bakgrunnen og si fra til åpne skjermer. */
function sortLater() {
  after(async () => {
    try {
      const db = await getDb();
      if ((await sortUncategorized(db)) > 0) await broadcastChange(SHOPPING_TOPIC);
    } catch (err) {
      console.warn("Kunne ikke sortere handlelisten", err);
    }
  });
}

/** «Sorter på nytt»: varer uten avdeling eller i «Annet» får en ny sjanse (minnet, ordlisten og Claude). */
export async function sortShoppingList(): Promise<ShoppingResult> {
  await requireFamily();
  const db = await getDb();
  const count = await sortUncategorized(db, true);
  if (count) await broadcastChange(SHOPPING_TOPIC);
  return { ok: true, message: count ? `${count} ${count === 1 ? "vare" : "varer"} fikk riktig avdeling` : "Fant ingen bedre avdeling" };
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
  sortLater();
  notifyShopping([name], { actor: session.activeMember });
  return { ok: true };
}

export async function updateItem(input: z.input<typeof itemUpdateSchema>): Promise<ShoppingResult> {
  await requireFamily();
  const parsed = itemUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { id, name, quantity, categoryId } = parsed.data;
  const db = await getDb();
  const { data: before } = await db.from("shopping_items").select("category_id").eq("id", id).maybeSingle();
  const { error } = await db.from("shopping_items").update({ name, quantity, category_id: categoryId }).eq("id", id);
  if (error) return { ok: false, message: "Kunne ikke lagre varen" };
  // Flytter noen varen til en annen avdeling, huskes det til neste gang. (Bare når avdelingen endres,
  // så halvskrevne navn under autolagring ikke blir husket.)
  if (categoryId && before && before.category_id !== categoryId) await rememberCategory(db, name, categoryId);
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
  const { data: rows } = await db.from("shopping_items").select(ITEM_COLUMNS).eq("id", id);
  const { error } = await db.from("shopping_items").delete().eq("id", id);
  if (error) return { ok: false, message: "Kunne ikke slette" };
  await broadcastChange(SHOPPING_TOPIC);
  return { ok: true, message: "Fjernet", deleted: (rows ?? []).map(toItem) };
}

export async function clearChecked(): Promise<ShoppingResult> {
  await requireFamily();
  const db = await getDb();
  const { data: rows } = await db.from("shopping_items").select(ITEM_COLUMNS).eq("checked", true);
  const { error } = await db.from("shopping_items").delete().eq("checked", true);
  if (error) return { ok: false, message: "Kunne ikke rydde listen" };
  await broadcastChange(SHOPPING_TOPIC);
  return { ok: true, message: "Avhukede varer er fjernet", deleted: (rows ?? []).map(toItem) };
}

const restoreItemsSchema = z
  .array(
    z.object({
      id: z.uuid(),
      name: z.string().trim().min(1).max(200),
      quantity: z.string().max(100).nullable(),
      categoryId: z.uuid().nullable(),
      checked: z.boolean(),
      checkedAt: z.string().nullable(),
      addedBy: z.uuid().nullable(),
      createdAt: z.string(),
    })
  )
  .max(500);

/** «Angre» etter at varer er fjernet: legger dem tilbake slik de var (samme id). */
export async function restoreItems(items: ShoppingItem[]): Promise<ShoppingResult> {
  await requireFamily();
  const parsed = restoreItemsSchema.safeParse(items);
  if (!parsed.success) return { ok: false, message: "Kunne ikke angre" };
  if (!parsed.data.length) return { ok: true };
  const db = await getDb();
  const { error } = await db.from("shopping_items").upsert(
    parsed.data.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      category_id: i.categoryId,
      checked: i.checked,
      checked_at: i.checkedAt,
      added_by: i.addedBy,
      created_at: i.createdAt,
    }))
  );
  if (error) return { ok: false, message: "Kunne ikke angre" };
  await broadcastChange(SHOPPING_TOPIC);
  return { ok: true, message: parsed.data.length === 1 ? "Varen er tilbake" : "Varene er tilbake" };
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
  sortLater();
  notifyShopping(
    toAdd.map((i) => i.name),
    { actor: session.activeMember, template: template.name }
  );
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

/** «Butikkrekkefølge»: avdelingene (handlelistekategoriene) i den rekkefølgen man går gjennom butikken. */
export async function reorderShoppingCategories(ids: string[]): Promise<ShoppingResult> {
  await requireFamily();
  const parsed = z.array(z.uuid()).min(1).max(100).safeParse(ids);
  if (!parsed.success) return { ok: false, message: "Ugyldig rekkefølge" };
  const db = await getDb();
  const results = await Promise.all(
    parsed.data.map((id, i) => db.from("categories").update({ sort_order: i + 1 }).eq("id", id).eq("scope", "shopping"))
  );
  if (results.some((r) => r.error)) return { ok: false, message: "Kunne ikke lagre rekkefølgen" };
  await broadcastChange(SHOPPING_TOPIC);
  return { ok: true };
}
