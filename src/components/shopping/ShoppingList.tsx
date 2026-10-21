"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  Pencil,
  Plus,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import {
  addItem,
  addTemplateToList,
  clearChecked,
  getShopping,
  reorderShoppingCategories,
  restoreItems,
  sortShoppingList,
  toggleItem,
  type ShoppingData,
} from "@/actions/shopping";
import { Sheet } from "@/components/ui/Sheet";
import { useUndo } from "@/components/ui/UndoToast";
import {
  buttonGhost,
  buttonPrimary,
  buttonSecondary,
  card,
  input,
} from "@/components/ui/styles";
import type { CalendarCategory } from "@/lib/calendar/types";
import { checkedItems, groupOpenItems, moveInList } from "@/lib/shopping/group";
import { parseItemText } from "@/lib/shopping/parse";
import type { ShoppingItem, ShoppingTemplate } from "@/lib/shopping/types";
import { ItemDialog, TemplateDialog } from "./ShoppingDialogs";
import { OdaDialog } from "./OdaDialog";
import { LiveBadge, useRealtimeRefresh } from "@/components/useRealtimeRefresh";
import { SHOPPING_TOPIC } from "@/lib/realtimeTopics";

interface Props {
  initial: ShoppingData;
  categories: CalendarCategory[];
}

const OTHER: CalendarCategory = {
  id: "annet",
  name: "Annet",
  icon: "📦",
  color: "#a39e93",
};

export function ShoppingList({
  initial,
  categories: initialCategories,
}: Props) {
  const [data, setData] = useState(initial);
  // Avdelingene i butikkrekkefølge (kan endres med «Butikkrekkefølge»).
  const [categories, setCategories] = useState(initialCategories);
  const [orderOpen, setOrderOpen] = useState(false);
  // Handlemodus: store rader, bare avkrysning, og skjermen holdes våken.
  const [shopMode, setShopMode] = useState(false);
  useWakeLock(shopMode);
  const [tab, setTab] = useState<"list" | "templates">("list");
  const [name, setName] = useState("");
  const [showChecked, setShowChecked] = useState(false);
  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<
    ShoppingTemplate | "new" | null
  >(null);
  const [toast, setToast] = useState<string | null>(null);
  const { offer: offerUndo, node: undoNode } = useUndo((m) =>
    setToast(m ?? null),
  );
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

  function moveCategory(index: number, dir: -1 | 1) {
    const next = moveInList(categories, index, dir);
    if (next === categories) return;
    setCategories(next);
    start(async () => {
      const res = await reorderShoppingCategories(next.map((c) => c.id));
      if (!res.ok) setToast(res.message ?? "Kunne ikke lagre rekkefølgen");
    });
  }
  const done = checkedItems(data.items);
  const openCount = data.items.length - done.length;

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const parsed = parseItemText(name);
    // Tøm feltet med en gang, så man kan skrive neste vare mens denne lagres.
    setName("");
    start(async () => {
      const res = await addItem({
        name: parsed.name,
        quantity: parsed.quantity,
        categoryId: null,
      });
      if (res.ok) refetch();
      else {
        setName((current) => current || name);
        setToast(res.message ?? "Kunne ikke legge til");
      }
    });
  }

  function toggle(item: ShoppingItem) {
    const checked = !item.checked;
    // Optimistisk: flytt varen med en gang; signalet fra serveren henter fasiten etterpå.
    setData((d) => ({
      ...d,
      items: d.items.map((i) =>
        i.id === item.id
          ? {
              ...i,
              checked,
              checkedAt: checked ? new Date().toISOString() : null,
            }
          : i,
      ),
    }));
    void toggleItem(item.id, checked).then((res) => {
      if (!res.ok) {
        setToast(res.message ?? "Kunne ikke oppdatere");
        refetch();
      }
    });
  }

  function runAndRefresh(
    action: () => Promise<{ ok: boolean; message?: string }>,
  ) {
    start(async () => {
      const res = await action();
      if (res.message) setToast(res.message);
      refetch();
    });
  }

  const toastNode = toast && (
    <div
      role="status"
      className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[90vw] rounded-full bg-ink px-5 py-3 text-center font-bold text-white shadow-lg md:bottom-8"
    >
      {toast}
    </div>
  );

  if (shopMode) {
    const total = data.items.length;
    return (
      <div className="flex flex-col gap-4">
        <div className="sticky top-12 z-20 flex items-center gap-3 rounded-2xl bg-card/95 p-2 pl-3 shadow-[0_2px_12px_rgba(120,90,60,0.12)] backdrop-blur md:top-2">
          <ShoppingCart
            size={24}
            className="shrink-0 text-primary-dark"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="font-bold">
              {done.length} av {total} i kurven
            </p>
            <div
              className="mt-1 h-2 overflow-hidden rounded-full bg-card-soft"
              aria-hidden
            >
              <div
                className="h-full rounded-full bg-mint transition-all"
                style={{ width: `${total ? (done.length / total) * 100 : 0}%` }}
              />
            </div>
          </div>
          <button
            className={`${buttonPrimary} shrink-0`}
            onClick={() => setShopMode(false)}
          >
            Ferdig
          </button>
        </div>

        {openCount === 0 && (
          <section
            className={`${card} flex flex-col items-center gap-2 py-8 text-center`}
          >
            <span className="text-5xl" aria-hidden>
              🎉
            </span>
            <p className="font-bold">Alt er i kurven!</p>
          </section>
        )}

        {groups.map((g) => {
          const cat = g.category ?? OTHER;
          return (
            <section key={cat.id} className="flex flex-col gap-2">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold">
                <span aria-hidden>{cat.icon}</span> {cat.name}
              </h2>
              <ul className="flex flex-col gap-2">
                {g.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    color={cat.color}
                    onToggle={toggle}
                    big
                  />
                ))}
              </ul>
            </section>
          );
        })}

        {done.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="font-display text-lg font-bold text-ink-light">
              I kurven ({done.length})
            </h2>
            <ul className="flex flex-col gap-2">
              {done.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  color={
                    (categories.find((c) => c.id === item.categoryId) ?? OTHER)
                      .color
                  }
                  onToggle={toggle}
                  big
                />
              ))}
            </ul>
          </section>
        )}
        {undoNode}
        {toastNode}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold sm:text-2xl lg:text-3xl">
          Handleliste
        </h1>
        <div className="flex items-center gap-2">
          <LiveBadge live={live} />
          <button
            className={buttonGhost}
            onClick={() => setOrderOpen(true)}
            aria-label="Butikkrekkefølge"
            title="Butikkrekkefølge"
          >
            <ArrowUpDown size={20} aria-hidden />
            <span className="hidden sm:inline">Butikkrekkefølge</span>
          </button>
          {openCount > 0 && (
            <button className={buttonPrimary} onClick={() => setShopMode(true)}>
              <ShoppingCart size={20} aria-hidden /> Handle
            </button>
          )}
        </div>
      </div>

      <div
        className="grid grid-cols-2 gap-1 rounded-2xl bg-card-soft p-1"
        role="tablist"
      >
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
            {/* Skriv og trykk Enter – feltet blir stående klart for neste vare. Antall kan skrives rett inn: «2 melk». */}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Hva trenger vi? F.eks. «2 melk»"
              aria-label="Ny vare"
              className={`${input} min-w-0 flex-1 text-lg`}
              enterKeyHint="enter"
              autoComplete="off"
            />
            <button
              className={`${buttonPrimary} shrink-0 px-4`}
              disabled={!name.trim()}
              aria-label="Legg til"
            >
              <Plus size={24} aria-hidden />
            </button>
          </form>

          {openCount === 0 && (
            <section
              className={`${card} flex flex-col items-center gap-2 py-10 text-center`}
            >
              <span className="text-5xl" aria-hidden>
                🛒
              </span>
              <p className="font-bold">Handlelisten er tom</p>
              <p className="text-ink-light">
                Legg til varer over, eller hent en fast liste.
              </p>
              <button
                className={buttonSecondary}
                onClick={() => setTab("templates")}
              >
                Vis faste lister
              </button>
            </section>
          )}

          {groups.map((g) => {
            const cat = g.category ?? OTHER;
            const isOther = cat.name === OTHER.name;
            return (
              <section key={cat.id} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                    <span aria-hidden>{cat.icon}</span> {cat.name}
                  </h2>
                  {isOther && (
                    <button
                      className={`${buttonGhost} min-h-10 text-sm`}
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          setToast("Sorterer …");
                          const res = await sortShoppingList();
                          setToast(res.message ?? null);
                          refetch();
                        })
                      }
                    >
                      <Sparkles size={16} aria-hidden /> Sorter
                    </button>
                  )}
                </div>
                <ul className="flex flex-col gap-2">
                  {g.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      color={cat.color}
                      onToggle={toggle}
                      onEdit={() => setEditing(item)}
                    />
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
                  <ChevronDown
                    size={20}
                    className={`transition ${showChecked ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                  I kurven ({done.length})
                </button>
                <button
                  className={buttonGhost}
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await clearChecked();
                      const deleted = res.deleted;
                      if (res.ok && deleted?.length) {
                        setToast(null);
                        offerUndo({
                          text: res.message ?? "Fjernet",
                          run: async () => {
                            const r = await restoreItems(deleted);
                            refetch();
                            return r;
                          },
                        });
                      } else if (res.message) setToast(res.message);
                      refetch();
                    })
                  }
                >
                  Fjern avhukede
                </button>
              </div>
              {showChecked && (
                <ul className="flex flex-col gap-2">
                  {done.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      color={
                        (
                          categories.find((c) => c.id === item.categoryId) ??
                          OTHER
                        ).color
                      }
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
                    <h2 className="font-display text-lg font-bold">{t.name}</h2>
                    <p className="wrap-break-word text-sm text-ink-light">
                      {t.items.length} varer ·{" "}
                      {t.items.map((i) => i.name).join(", ")}
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
                  <button
                    className={buttonGhost}
                    onClick={() => setEditingTemplate(t)}
                  >
                    <Pencil size={18} aria-hidden /> Endre
                  </button>
                  <button
                    className={buttonGhost}
                    disabled={t.items.length === 0}
                    onClick={() => setOda(t.id)}
                    aria-label={`Send ${t.name} til Oda`}
                  >
                    <ShoppingCart size={18} aria-hidden />{" "}
                    <span className="hidden sm:inline">Til Oda</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button
            className={`${buttonSecondary} self-start`}
            onClick={() => setEditingTemplate("new")}
          >
            <Plus size={20} aria-hidden /> Ny fast liste
          </button>
        </>
      )}

      {tab === "list" && openCount > 0 && (
        <button
          className={`${buttonSecondary} self-center`}
          onClick={() => setOda("")}
        >
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
          onDone={(message, undo) => {
            setEditing(null);
            if (undo) {
              setToast(null);
              offerUndo({
                text: message ?? "Fjernet",
                run: async () => {
                  const r = await undo();
                  refetch();
                  return r;
                },
              });
            } else if (message) setToast(message);
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

      {orderOpen && (
        <Sheet
          title="Butikkrekkefølge"
          onClose={() => setOrderOpen(false)}
          onSubmit={() => setOrderOpen(false)}
          footer={
            <button className={`${buttonPrimary} ml-auto`} disabled={pending}>
              Ferdig
            </button>
          }
        >
          <p className="text-ink-light">
            Flytt avdelingene i den rekkefølgen dere går gjennom butikken.
            Handlelisten sorteres slik.
          </p>
          <ol className="flex flex-col gap-2">
            {categories.map((c, i) => (
              <li
                key={c.id}
                className="flex items-center gap-2 rounded-2xl bg-card-soft py-1 pl-3 pr-1"
              >
                <span className="w-6 text-sm font-bold tabular-nums text-ink-light">
                  {i + 1}.
                </span>
                <span className="min-w-0 flex-1 font-bold">
                  <span aria-hidden>{c.icon}</span> {c.name}
                </span>
                <button
                  type="button"
                  className={`${buttonGhost} px-3`}
                  disabled={i === 0}
                  onClick={() => moveCategory(i, -1)}
                  aria-label={`Flytt ${c.name} opp`}
                >
                  <ArrowUp size={20} aria-hidden />
                </button>
                <button
                  type="button"
                  className={`${buttonGhost} px-3`}
                  disabled={i === categories.length - 1}
                  onClick={() => moveCategory(i, 1)}
                  aria-label={`Flytt ${c.name} ned`}
                >
                  <ArrowDown size={20} aria-hidden />
                </button>
              </li>
            ))}
          </ol>
        </Sheet>
      )}

      {undoNode}
      {toastNode}
    </div>
  );
}

function ItemRow({
  item,
  color,
  onToggle,
  onEdit,
  big,
}: {
  item: ShoppingItem;
  color: string;
  onToggle: (i: ShoppingItem) => void;
  onEdit?: () => void;
  /** Handlemodus: større rad og tekst, ingen endreknapp. */
  big?: boolean;
}) {
  return (
    <li className="flex items-center gap-2 rounded-3xl bg-card pr-2 shadow-[0_2px_12px_rgba(120,90,60,0.08)]">
      <button
        onClick={() => onToggle(item)}
        aria-pressed={item.checked}
        aria-label={
          item.checked
            ? `Ta ${item.name} ut av kurven`
            : `Legg ${item.name} i kurven`
        }
        className={`flex flex-1 items-center gap-3 px-3 text-left ${big ? "min-h-18 py-2" : "min-h-14"}`}
      >
        <span
          className={`flex shrink-0 items-center justify-center rounded-full border-[3px] transition ${big ? "h-11 w-11" : "h-9 w-9"}`}
          style={{
            borderColor: color,
            background: item.checked ? color : "transparent",
          }}
        >
          {item.checked && (
            <Check
              size={20}
              strokeWidth={3}
              className="text-white"
              aria-hidden
            />
          )}
        </span>
        <span
          className={`wrap-break-word font-bold ${big ? "text-2xl" : "text-lg"} ${item.checked ? "text-ink-faint line-through" : ""}`}
        >
          {item.name}
        </span>
        {item.quantity && (
          <span className="rounded-full bg-card-soft px-2 text-sm font-bold text-ink-light">
            {item.quantity}
          </span>
        )}
      </button>
      {onEdit && (
        <button
          onClick={onEdit}
          aria-label={`Endre ${item.name}`}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-ink-faint hover:bg-card-soft hover:text-ink"
        >
          <Pencil size={18} aria-hidden />
        </button>
      )}
    </li>
  );
}

/** Holder skjermen våken mens man handler (der nettleseren støtter det). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = () =>
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => {});
    void request();
    // Låsen slippes når appen går i bakgrunnen; be om den igjen når man kommer tilbake.
    const onVisible = () =>
      document.visibilityState === "visible" && void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
}
