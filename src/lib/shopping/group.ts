import type { CalendarCategory } from "@/lib/calendar/types";
import type { ShoppingItem } from "./types";

export interface ItemGroup {
  category: CalendarCategory | null;
  items: ShoppingItem[];
}

/**
 * Ikke-avhukede varer gruppert etter butikkavdeling, i kategoriens rekkefølge (slik man går gjennom butikken).
 * Varer uten kjent kategori havner til slutt. Innen gruppen: eldste først, så nye varer havner nederst.
 */
export function groupOpenItems(items: ShoppingItem[], categories: CalendarCategory[]): ItemGroup[] {
  const open = items.filter((i) => !i.checked).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const groups: ItemGroup[] = categories
    .map((category) => ({ category, items: open.filter((i) => i.categoryId === category.id) }))
    .filter((g) => g.items.length > 0);
  const known = new Set(categories.map((c) => c.id));
  const rest = open.filter((i) => !i.categoryId || !known.has(i.categoryId));
  if (rest.length) groups.push({ category: null, items: rest });
  return groups;
}

/** Avhukede varer, sist avhuket først. */
export function checkedItems(items: ShoppingItem[]): ShoppingItem[] {
  return items.filter((i) => i.checked).sort((a, b) => (b.checkedAt ?? "").localeCompare(a.checkedAt ?? ""));
}

/** Flytter elementet på `index` ett steg opp (-1) eller ned (1). Utenfor listen: uendret. */
export function moveInList<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const to = index + dir;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
