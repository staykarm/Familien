"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pin, PinOff, RotateCcw, Search, SquarePen, Trash2 } from "lucide-react";
import {
  createNote,
  deleteNoteForever,
  getNote,
  listNotes,
  restoreNote,
  setNoteOwner,
  setNotePinned,
  trashNote,
} from "@/actions/notes";
import { Avatar } from "@/components/ui/Avatar";
import { buttonGhost, buttonPrimary } from "@/components/ui/styles";
import { LiveBadge, useRealtimeRefresh } from "@/components/useRealtimeRefresh";
import type { CalendarMember } from "@/lib/calendar/types";
import { groupNotes, noteTimeLabel } from "@/lib/notes/group";
import type { NoteFull, NoteSummary } from "@/lib/notes/types";
import { NOTES_TOPIC } from "@/lib/realtimeTopics";
import { NoteEditor } from "./NoteEditor";

const ALL = "alle";
const TRASH = "slettet";

interface Props {
  initialNotes: NoteSummary[];
  members: CalendarMember[];
  activeMemberId: string | null;
  selected: NoteFull | null;
}

export function NotesApp({ initialNotes, members, activeMemberId, selected: initialSelected }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [selected, setSelected] = useState(initialSelected);
  const [filter, setFilter] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const selectedId = selected?.id ?? null;

  const refresh = useCallback(
    (payload: Record<string, unknown> | null) => {
      void listNotes().then(setNotes);
      // Endret noen notatet vi har åpent? Hent nyeste versjon (editoren tar den inn hvis vi ikke skriver).
      if (selectedId && (!payload || payload.id === selectedId)) {
        void getNote(selectedId).then((n) => n && setSelected(n));
      }
    },
    [selectedId]
  );
  const { live } = useRealtimeRefresh(NOTES_TOPIC, refresh);

  const onSaved = useCallback((note: NoteFull) => {
    setNotes((list) => list.map((n) => (n.id === note.id ? { ...note } : n)));
  }, []);
  const reloadSelected = useCallback(() => {
    if (selectedId) void getNote(selectedId).then((n) => n && setSelected(n));
  }, [selectedId]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("nb");
    return notes.filter((n) => {
      if (filter === TRASH ? !n.deletedAt : n.deletedAt) return false;
      if (filter !== ALL && filter !== TRASH && n.ownerId !== filter) return false;
      return !q || `${n.title} ${n.preview}`.toLocaleLowerCase("nb").includes(q);
    });
  }, [notes, filter, query]);
  const groups = filter === TRASH ? [{ key: "trash", title: "Nylig slettet (slettes etter 30 dager)", notes: visible }] : groupNotes(visible);
  const trashCount = notes.filter((n) => n.deletedAt).length;

  function newNote() {
    start(async () => {
      const owner = filter !== ALL && filter !== TRASH ? filter : activeMemberId;
      const res = await createNote(owner);
      if (res.ok && res.note) router.push(`/notater/${res.note.id}`);
      else setToast(res.message ?? "Kunne ikke lage notat");
    });
  }

  function act(fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) {
    start(async () => {
      const res = await fn();
      if (res.message) setToast(res.message);
      if (res.ok) {
        after?.();
        refresh(null);
      }
    });
  }

  const owner = members.find((m) => m.id === selected?.ownerId);

  const list = (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold sm:text-3xl lg:text-4xl">Notater</h1>
        <div className="flex items-center gap-2">
          <LiveBadge live={live} />
          <button className={`${buttonPrimary} px-4`} onClick={newNote} disabled={pending} aria-label="Nytt notat">
            <SquarePen size={22} aria-hidden />
          </button>
        </div>
      </div>

      <label className="flex min-h-12 items-center gap-2 rounded-2xl bg-card-soft px-4">
        <Search size={20} className="text-ink-light" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Søk"
          aria-label="Søk i notater"
          className="min-h-12 w-full bg-transparent text-base outline-none"
        />
      </label>

      <div className="chip-row" aria-label="Vis notater for">
        {[{ id: ALL, label: "Alle" }, ...members.map((m) => ({ id: m.id, label: m.name, m }))].map((f) => {
          const on = filter === f.id;
          const m = "m" in f ? f.m : undefined;
          return (
            <button
              key={f.id}
              aria-pressed={on}
              onClick={() => setFilter(on && f.id !== ALL ? ALL : f.id)}
              className={`flex min-h-11 items-center gap-1.5 rounded-full border-2 text-sm font-bold transition ${m ? "py-0.5 pl-0.5 pr-3" : "px-4"}`}
              style={{
                borderColor: on ? (m?.color ?? "var(--color-primary)") : "var(--color-line)",
                background: on ? `${m?.color ?? "#ff8a5c"}22` : "var(--color-card)",
              }}
            >
              {m && <Avatar name={m.name} color={m.color} icon={m.icon} url={m.avatarUrl} size={30} ring={false} />}
              {f.label}
            </button>
          );
        })}
        {trashCount > 0 && (
          <button
            aria-pressed={filter === TRASH}
            onClick={() => setFilter(filter === TRASH ? ALL : TRASH)}
            className={`inline-flex min-h-11 items-center gap-1 rounded-full border-2 px-4 text-sm font-bold ${
              filter === TRASH ? "border-danger bg-primary-soft text-danger" : "border-line bg-card text-ink-light"
            }`}
          >
            <Trash2 size={16} aria-hidden /> Nylig slettet ({trashCount})
          </button>
        )}
      </div>

      {visible.length === 0 && (
        <p className="py-8 text-center text-ink-light">
          {query ? "Ingen notater passer søket." : filter === TRASH ? "Ingen slettede notater." : "Ingen notater ennå. Trykk ✏️ for å skrive ett."}
        </p>
      )}

      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-1">
          <h2 className="px-1 text-sm font-extrabold text-ink-light">{g.title}</h2>
          <ul className="overflow-hidden rounded-3xl bg-card shadow-[0_2px_12px_rgba(120,90,60,0.08)]">
            {g.notes.map((n, idx) => {
              const m = members.find((x) => x.id === n.ownerId);
              const isSel = n.id === selectedId;
              return (
                <li key={n.id} className={idx > 0 ? "border-t-2 border-line" : ""}>
                  <Link
                    href={`/notater/${n.id}`}
                    className={`flex min-h-16 items-center gap-3 px-4 py-2 ${isSel ? "bg-sun/50" : "hover:bg-card-soft"}`}
                  >
                    <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: m?.color ?? "var(--color-line)" }} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-bold">{n.title || "Nytt notat"}</span>
                      <span className="truncate text-sm text-ink-light">
                        <span className="font-semibold">{noteTimeLabel(n.updatedAt)}</span>
                        {n.checklist.total > 0 && ` · ☑ ${n.checklist.done}/${n.checklist.total}`}
                        {n.preview ? ` · ${n.preview}` : ""}
                      </span>
                    </span>
                    {m && <Avatar name={m.name} color={m.color} icon={m.icon} url={m.avatarUrl} size={28} ring={false} />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );

  const editorPane = selected && (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/notater" className={`${buttonGhost} md:hidden`}>
          <ArrowLeft size={20} aria-hidden /> Notater
        </Link>
        <div className="flex flex-wrap items-center gap-1" aria-label="Hvem hører notatet til">
          {members.map((m) => {
            const on = selected.ownerId === m.id;
            return (
              <button
                key={m.id}
                aria-pressed={on}
                title={m.name}
                aria-label={`Notatet hører til ${m.name}`}
                disabled={!!selected.deletedAt}
                onClick={() => {
                  const ownerId = on ? null : m.id;
                  setSelected({ ...selected, ownerId });
                  act(() => setNoteOwner(selected.id, ownerId));
                }}
                className={`rounded-full transition ${on ? "" : "opacity-40 grayscale hover:opacity-80"}`}
              >
                <Avatar name={m.name} color={m.color} icon={m.icon} url={m.avatarUrl} size={34} ring={on} />
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {selected.deletedAt ? (
            <>
              <button className={buttonGhost} onClick={() => act(() => restoreNote(selected.id), reloadSelected)}>
                <RotateCcw size={20} aria-hidden /> Gjenopprett
              </button>
              <button
                className={`${buttonGhost} text-danger`}
                onClick={() => act(() => deleteNoteForever(selected.id), () => router.push("/notater"))}
              >
                <Trash2 size={20} aria-hidden /> Slett for godt
              </button>
            </>
          ) : (
            <>
              <button
                className={buttonGhost}
                aria-label={selected.pinned ? "Løsne notatet" : "Fest notatet øverst"}
                title={selected.pinned ? "Løsne" : "Fest øverst"}
                onClick={() => {
                  setSelected({ ...selected, pinned: !selected.pinned });
                  act(() => setNotePinned(selected.id, !selected.pinned));
                }}
              >
                {selected.pinned ? <PinOff size={20} aria-hidden /> : <Pin size={20} aria-hidden />}
              </button>
              <button
                className={buttonGhost}
                aria-label="Slett notatet"
                title="Slett"
                onClick={() => act(() => trashNote(selected.id), () => router.push("/notater"))}
              >
                <Trash2 size={20} aria-hidden />
              </button>
            </>
          )}
        </div>
      </div>
      {selected.deletedAt && (
        <p className="rounded-2xl bg-primary-soft p-3 font-semibold">Dette notatet ligger i Nylig slettet. Gjenopprett det for å endre.</p>
      )}
      {owner === undefined && !selected.deletedAt && <p className="text-xs text-ink-faint">Felles notat – trykk på en person for å gi det til noen.</p>}
      <NoteEditor key={selected.id} note={selected} onSaved={onSaved} onReload={reloadSelected} readOnly={!!selected.deletedAt} />
    </div>
  );

  return (
    <>
      <div className="md:grid md:grid-cols-[minmax(18rem,22rem)_1fr] md:gap-6">
        <div className={selected ? "hidden md:block" : ""}>{list}</div>
        {selected ? (
          editorPane
        ) : (
          <div className="hidden items-center justify-center rounded-3xl bg-card/60 p-10 text-center text-ink-light md:flex">
            Velg et notat, eller trykk ✏️ for å skrive et nytt.
          </div>
        )}
      </div>
      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[90vw] rounded-full bg-ink px-5 py-3 text-center font-bold text-white shadow-lg md:bottom-8">
          {toast}
        </div>
      )}
    </>
  );
}
