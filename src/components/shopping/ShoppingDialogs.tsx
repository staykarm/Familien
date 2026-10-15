"use client";

import { useState, useTransition } from "react";
import { autosaveLabel, useAutosave } from "@/components/useAutosave";
import { Plus, Trash2 } from "lucide-react";
import { deleteItem, deleteTemplate, restoreItems, saveTemplate, updateItem } from "@/actions/shopping";
import { DeleteButton, Sheet } from "@/components/ui/Sheet";
import { buttonGhost, buttonPrimary, buttonSecondary, input, label } from "@/components/ui/styles";
import type { CalendarCategory } from "@/lib/calendar/types";
import type { ShoppingItem, ShoppingTemplate, TemplateItem } from "@/lib/shopping/types";

function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: CalendarCategory[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((c) => {
        const on = value === c.id;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? null : c.id)}
            className="min-h-11 rounded-full border-2 px-3 text-sm font-bold transition active:scale-95"
            style={{ borderColor: on ? c.color : "var(--color-line)", background: on ? `${c.color}26` : "var(--color-card)" }}
          >
            <span aria-hidden>{c.icon}</span> {c.name}
          </button>
        );
      })}
    </div>
  );
}

// --- Endre én vare ------------------------------------------------------------------

export function ItemDialog({
  item,
  categories,
  onDone,
}: {
  item: ShoppingItem;
  categories: CalendarCategory[];
  /** Kalles når dialogen lukkes (etter at siste endring er lagret), eller når varen er fjernet (da med `undo`). */
  onDone: (message?: string, undo?: () => Promise<{ ok: boolean; message?: string }>) => void;
}) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity ?? "");
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Endringer lagres mens man skriver; «Ferdig» lukker.
  const { state: saveState, flush } = useAutosave(
    { name, quantity, categoryId },
    async (v) => {
      const res = await updateItem({ id: item.id, ...v });
      setError(res.ok ? null : (res.message ?? "Kunne ikke lagre"));
      return res.ok;
    },
    { enabled: name.trim() !== "", delay: 500 }
  );

  async function done() {
    if (name.trim()) await flush();
    onDone();
  }

  return (
    <Sheet
      title="Vare"
      onClose={() => void done()}
      onSubmit={() => void done()}
      footer={
        <>
          <button
            type="button"
            className={buttonGhost}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await deleteItem(item.id);
                const deleted = res.deleted;
                if (res.ok) onDone(res.message, deleted?.length ? () => restoreItems(deleted) : undefined);
                else setError(res.message ?? "Noe gikk galt");
              })
            }
          >
            <Trash2 size={20} aria-hidden /> Fjern
          </button>
          <span className="ml-auto text-sm font-semibold text-ink-light" aria-live="polite">
            {autosaveLabel(saveState)}
          </span>
          <button className={buttonPrimary} disabled={pending}>
            Ferdig
          </button>
        </>
      }
    >
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <div>
          <label htmlFor="item-name" className={label}>
            Vare
          </label>
          <input id="item-name" value={name} onChange={(e) => setName(e.target.value)} className={input} required />
        </div>
        <div>
          <label htmlFor="item-qty" className={label}>
            Antall
          </label>
          <input id="item-qty" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="F.eks. 2" className={input} />
        </div>
      </div>
      <fieldset>
        <legend className={label}>Hvor i butikken?</legend>
        <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
      </fieldset>
      {error && <p className="rounded-2xl bg-primary-soft p-3 font-semibold text-danger">{error}</p>}
    </Sheet>
  );
}

// --- Fast liste ---------------------------------------------------------------------

const TEMPLATE_ICONS = ["🧺", "🌮", "🍕", "🥞", "🎂", "🏕️", "🎄", "🧃", "🥗", "🛒"];

export function TemplateDialog({
  template,
  currentItems,
  onClose,
  onDone,
}: {
  template: ShoppingTemplate | null;
  /** Varer som står på handlelisten nå – kan kopieres inn i den faste listen. */
  currentItems: ShoppingItem[];
  onClose: () => void;
  onDone: (message?: string) => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [icon, setIcon] = useState(template?.icon ?? "🛒");
  const [items, setItems] = useState<TemplateItem[]>(template?.items ?? []);
  const [newItem, setNewItem] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  const addRow = () => {
    const n = newItem.trim();
    if (!n) return;
    setItems((list) => [...list, { name: n, quantity: null, categoryId: null }]);
    setNewItem("");
  };

  const copyFromList = () => {
    const extra = currentItems
      .filter((c) => !c.checked && !items.some((i) => i.name.toLowerCase() === c.name.toLowerCase()))
      .map((c) => ({ name: c.name, quantity: c.quantity, categoryId: c.categoryId }));
    setItems((list) => [...list, ...extra]);
  };

  return (
    <Sheet
      title={template ? "Endre fast liste" : "Ny fast liste"}
      onClose={onClose}
      onSubmit={() =>
        start(async () => {
          const res = await saveTemplate({ id: template?.id ?? null, name, icon, items });
          if (res.ok) onDone(res.message);
          else setError(res.message ?? "Noe gikk galt");
        })
      }
      footer={
        <>
          {template && (
            <DeleteButton
              confirming={confirmDelete}
              onAsk={() => setConfirmDelete(true)}
              onCancel={() => setConfirmDelete(false)}
              pending={pending}
              label="🗑️ Slett"
              onConfirm={() =>
                start(async () => {
                  const res = await deleteTemplate(template.id);
                  if (res.ok) onDone(res.message);
                  else setError(res.message ?? "Noe gikk galt");
                })
              }
            />
          )}
          <button className={`${buttonPrimary} ml-auto`} disabled={pending}>
            Lagre
          </button>
        </>
      }
    >
      <div>
        <label htmlFor="tpl-name" className={label}>
          Navn
        </label>
        <input
          id="tpl-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="F.eks. Søndagsfrokost"
          className={`${input} text-lg font-bold`}
          required
        />
      </div>
      <fieldset>
        <legend className={label}>Ikon</legend>
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_ICONS.map((i) => (
            <button
              key={i}
              type="button"
              aria-pressed={icon === i}
              onClick={() => setIcon(i)}
              className={`h-12 w-12 rounded-2xl text-2xl ${icon === i ? "bg-primary-soft ring-2 ring-primary" : "bg-card-soft"}`}
            >
              {i}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <span className={label}>Varer ({items.length})</span>
        <ul className="flex flex-col gap-1">
          {items.map((it, idx) => (
            <li key={`${idx}-${it.name}`} className="flex items-center gap-2 rounded-2xl bg-card-soft px-3 py-1">
              <span className="flex-1 font-semibold">{it.name}</span>
              <input
                aria-label={`Antall ${it.name}`}
                value={it.quantity ?? ""}
                onChange={(e) =>
                  setItems((list) => list.map((x, j) => (j === idx ? { ...x, quantity: e.target.value || null } : x)))
                }
                placeholder="Antall"
                className="min-h-10 w-24 rounded-xl border-2 border-line bg-card px-2 text-sm"
              />
              <button
                type="button"
                aria-label={`Fjern ${it.name}`}
                onClick={() => setItems((list) => list.filter((_, j) => j !== idx))}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-light hover:bg-primary-soft"
              >
                <Trash2 size={18} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addRow();
              }
            }}
            placeholder="Legg til vare"
            aria-label="Ny vare i listen"
            className={input}
          />
          <button type="button" onClick={addRow} className={`${buttonSecondary} shrink-0 px-4`} aria-label="Legg til vare">
            <Plus size={20} aria-hidden />
          </button>
        </div>
        {currentItems.some((c) => !c.checked) && (
          <button type="button" onClick={copyFromList} className={`${buttonGhost} self-start text-sm`}>
            + Hent varene som står på handlelisten nå
          </button>
        )}
      </div>
      {error && <p className="rounded-2xl bg-primary-soft p-3 font-semibold text-danger">{error}</p>}
    </Sheet>
  );
}
