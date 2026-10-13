"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Check, ChevronDown, Pencil, Plus, ShoppingCart } from "lucide-react";
import { addItem, addTemplateToList, clearChecked, getShopping, toggleItem, type ShoppingData } from "@/actions/shopping";
import { buttonGhost, buttonPrimary, buttonSecondary, card, input } from "@/components/ui/styles";
import type { CalendarCategory } from "@/lib/calendar/types";
import { checkedItems, groupOpenItems } from "@/lib/shopping/group";
import type { ShoppingItem, ShoppingTemplate } from "@/lib/shopping/types";
import { ItemDialog, TemplateDialog } from "./ShoppingDialogs";
import { OdaDialog } from "./OdaDialog";
import { LiveBadge, useRealtimeRefresh } from "@/components/useRealtimeRefresh";
import { SHOPPING_TOPIC } from "@/lib/realtimeTopics";

interface Props {
  initial: ShoppingData;
  categories: CalendarCategory[];
}

const OTHER: CalendarCategory = { id: "annet", name: "Annet", icon: "📦", color: "#a39e93" };

export function ShoppingList({ initial, categories }: Props) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<"list" | "templates">("list");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [showChecked, setShowChecked] = useState(false);
  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ShoppingTemplate | "new" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // null = lukket, "" = handlelisten, ellers id til en fast liste
  const [oda, setOda] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const refetch = useCallback(() => {
    void getShopping().then(setData);
  }, []);
  const { live } = useRealtimeRefresh(SHOPPING_TOPIC, refetch);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const groups = groupOpenItems(data.items, categories);
  const done = checkedItems(data.items);
  const openCount = data.items.length - done.length;

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    start(async () => {
      const res = await addItem({ name, quantity, categoryId: null });
      if (res.ok) {
        setName("");
        setQuantity("");
        refetch();
      } else setToast(res.message ?? "Kunne ikke legge til");
    });
  }

  function toggle(item: ShoppingItem) {
    const checked = !item.checked;
    // Optimistisk: flytt varen med en gang; signalet fra serveren henter fasiten etterpå.
    setData((d) => ({
      ...d,
      items: d.items.map((i) => (i.id === item.id ? { ...i, checked, checkedAt: checked ? new Date().toISOString() : null } : i)),
    }));
    void toggleItem(item.id, checked).then((res) => {
      if (!res.ok) {
        setToast(res.message ?? "Kunne ikke oppdatere");
        refetch();
      }
    });
  }

  function runAndRefresh(action: () => Promise<{ ok: boolean; message?: string }>) {
    start(async () => {
      const res = await action();
      if (res.message) setToast(res.message);
      refetch();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold sm:text-3xl lg:text-4xl">Handleliste</h1>
        <LiveBadge live={live} />
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-card-soft p-1" role="tablist">
        {(
          [
            ["list", `Handlelisten${openCount ? ` (${openCount})` : ""}`],
            ["templates", "Faste lister"],
          ] as const
        ).map(([value, text]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`min-h-12 rounded-xl font-bold transition ${tab === value ? "bg-card text-primary-dark shadow-sm" : "text-ink-light"}`}
          >
            {text}
          </button>
        ))}
      </div>

      {tab === "list" ? (
        <>
          <form onSubmit={add} className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Hva trenger vi?"
              aria-label="Vare"
              className={`${input} min-w-0 flex-1 text-lg`}
              enterKeyHint="done"
            />
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Antall"
              aria-label="Antall"
              className={`${input.replace("w-full", "")} w-20 shrink-0 sm:w-28`}
            />
            <button className={`${buttonPrimary} shrink-0 px-4`} disabled={pending || !name.trim()} aria-label="Legg til">
              <Plus size={24} aria-hidden />
            </button>
          </form>

          {openCount === 0 && (
            <section className={`${card} flex flex-col items-center gap-2 py-10 text-center`}>
              <span className="text-5xl" aria-hidden>
                🛒
              </span>
              <p className="font-bold">Handlelisten er tom</p>
              <p className="text-ink-light">Legg til varer over, eller hent en fast liste.</p>
              <button className={buttonSecondary} onClick={() => setTab("templates")}>
                Vis faste lister
              </button>
            </section>
          )}

          {groups.map((g) => {
            const cat = g.category ?? OTHER;
            return (
              <section key={cat.id} className="flex flex-col gap-2">
                <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                  <span aria-hidden>{cat.icon}</span> {cat.name}
                </h2>
                <ul className="flex flex-col gap-2">
                  {g.items.map((item) => (
                    <ItemRow key={item.id} item={item} color={cat.color} onToggle={toggle} onEdit={() => setEditing(item)} />
                  ))}
                </ul>
              </section>
            );
          })}

          {done.length > 0 && (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowChecked(!showChecked)}
                  aria-expanded={showChecked}
                  className="inline-flex min-h-12 items-center gap-1 font-display text-lg font-bold text-ink-light"
                >
                  <ChevronDown size={20} className={`transition ${showChecked ? "rotate-180" : ""}`} aria-hidden />I kurven ({done.length})
                </button>
                <button className={buttonGhost} disabled={pending} onClick={() => runAndRefresh(clearChecked)}>
                  Fjern avhukede
                </button>
              </div>
              {showChecked && (
                <ul className="flex flex-col gap-2">
                  {done.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      color={(categories.find((c) => c.id === item.categoryId) ?? OTHER).color}
                      onToggle={toggle}
                      onEdit={() => setEditing(item)}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.templates.map((t) => (
              <li key={t.id} className={`${card} flex flex-col gap-3`}>
                <div className="flex items-center gap-3">
                  <span className="text-4xl" aria-hidden>
                    {t.icon}
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-display text-xl font-bold">{t.name}</h2>
                    <p className="truncate text-sm text-ink-light">
                      {t.items.length} varer · {t.items.map((i) => i.name).join(", ")}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={buttonPrimary}
                    disabled={pending || t.items.length === 0}
                    onClick={() =>
                      runAndRefresh(async () => {
                        const res = await addTemplateToList(t.id);
                        if (res.ok) setTab("list");
                        return res;
                      })
                    }
                  >
                    <Plus size={20} aria-hidden /> Legg i handlelisten
                  </button>
                  <button className={buttonGhost} onClick={() => setEditingTemplate(t)}>
                    <Pencil size={18} aria-hidden /> Endre
                  </button>
                  <button
                    className={buttonGhost}
                    disabled={t.items.length === 0}
                    onClick={() => setOda(t.id)}
                    aria-label={`Send ${t.name} til Oda`}
                  >
                    <ShoppingCart size={18} aria-hidden /> <span className="hidden sm:inline">Til Oda</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button className={`${buttonSecondary} self-start`} onClick={() => setEditingTemplate("new")}>
            <Plus size={20} aria-hidden /> Ny fast liste
          </button>
        </>
      )}

      {tab === "list" && openCount > 0 && (
        <button className={`${buttonSecondary} self-center`} onClick={() => setOda("")}>
          <ShoppingCart size={20} aria-hidden /> Send til Oda
        </button>
      )}

      {oda !== null && (
        <OdaDialog
          openCount={openCount}
          templates={data.templates}
          initialTemplateId={oda || null}
          onClose={() => setOda(null)}
          onDone={refetch}
        />
      )}

      {editing && (
        <ItemDialog
          key={editing.id}
          item={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onDone={(message) => {
            setEditing(null);
            if (message) setToast(message);
            refetch();
          }}
        />
      )}

      {editingTemplate && (
        <TemplateDialog
          key={editingTemplate === "new" ? "ny" : editingTemplate.id}
          template={editingTemplate === "new" ? null : editingTemplate}
          currentItems={data.items}
          onClose={() => setEditingTemplate(null)}
          onDone={(message) => {
            setEditingTemplate(null);
            if (message) setToast(message);
            refetch();
          }}
        />
      )}

      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[90vw] rounded-full bg-ink px-5 py-3 text-center font-bold text-white shadow-lg md:bottom-8">
          {toast}
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item,
  color,
  onToggle,
  onEdit,
}: {
  item: ShoppingItem;
  color: string;
  onToggle: (i: ShoppingItem) => void;
  onEdit: () => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-3xl bg-card pr-2 shadow-[0_2px_12px_rgba(120,90,60,0.08)]">
      <button
        onClick={() => onToggle(item)}
        aria-pressed={item.checked}
        aria-label={item.checked ? `Ta ${item.name} ut av kurven` : `Legg ${item.name} i kurven`}
        className="flex min-h-14 flex-1 items-center gap-3 px-3 text-left"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[3px] transition"
          style={{ borderColor: color, background: item.checked ? color : "transparent" }}
        >
          {item.checked && <Check size={20} strokeWidth={3} className="text-white" aria-hidden />}
        </span>
        <span className={`text-lg font-bold ${item.checked ? "text-ink-faint line-through" : ""}`}>{item.name}</span>
        {item.quantity && <span className="rounded-full bg-card-soft px-2 text-sm font-bold text-ink-light">{item.quantity}</span>}
      </button>
      <button
        onClick={onEdit}
        aria-label={`Endre ${item.name}`}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-ink-faint hover:bg-card-soft hover:text-ink"
      >
        <Pencil size={18} aria-hidden />
      </button>
    </li>
  );
}
