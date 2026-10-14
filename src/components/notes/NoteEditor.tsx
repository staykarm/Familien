"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extensions";
import { Bold, CheckSquare, Heading, Italic, List, ListOrdered, Redo2, Undo2 } from "lucide-react";
import { saveNote } from "@/actions/notes";
import type { NoteFull } from "@/lib/notes/types";
import type { DocNode } from "@/lib/notes/text";

const SAVE_DELAY_MS = 700;
/** Etter så mange mislykkede forsøk på rad foreslår vi å laste siden på nytt (f.eks. etter en ny versjon av appen). */
const MAX_QUIET_RETRIES = 3;

type SaveState = "saved" | "dirty" | "saving" | "error" | "stuck" | "conflict";

/**
 * Sikkerhetskopi i nettleseren av endringer som ikke er lagret ennå. Gjør at ingenting går tapt hvis
 * lagringen feiler og siden lastes på nytt (eller lukkes). Slettes når endringene er lagret.
 */
const backupKey = (id: string) => `familien-notat-${id}`;
function writeBackup(id: string, version: number, doc: DocNode) {
  try {
    localStorage.setItem(backupKey(id), JSON.stringify({ version, doc }));
  } catch {
    // Privat modus o.l.: ingen sikkerhetskopi.
  }
}
function readBackup(id: string): { version: number; doc: DocNode } | null {
  try {
    const raw = localStorage.getItem(backupKey(id));
    return raw ? (JSON.parse(raw) as { version: number; doc: DocNode }) : null;
  } catch {
    return null;
  }
}
function clearBackup(id: string) {
  try {
    localStorage.removeItem(backupKey(id));
  } catch {
    // ignorer
  }
}

interface Props {
  note: NoteFull;
  /** Kalles etter vellykket lagring, så listen kan oppdatere tittel/forhåndsvisning. */
  onSaved: (note: NoteFull) => void;
  /** Kalles ved konflikt eller når en nyere versjon skal lastes. */
  onReload: () => void;
  readOnly?: boolean;
}

/** Notatredigering à la iOS Notater: skriv fritt, sjekklister med avkrysning, lagres automatisk. */
export function NoteEditor({ note, onSaved, onReload, readOnly }: Props) {
  const [state, setState] = useState<SaveState>("saved");
  const versionRef = useRef(note.version);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const pendingDoc = useRef<DocNode | null>(null);
  const failures = useRef(0);
  // flush planlegger seg selv på nytt (mer tekst under lagring, eller ny prøve etter nettfeil), via en ref.
  const flushRef = useRef<() => Promise<void>>(async () => {});

  const flush = useCallback(async () => {
    if (saving.current || !pendingDoc.current) return;
    const content = pendingDoc.current;
    pendingDoc.current = null;
    saving.current = true;
    setState("saving");
    // Kallet kan kaste (nettbrudd, eller ny versjon av appen mens notatet var åpent). Da må vi likevel
    // slippe «lagrer» og prøve igjen – ellers står notatet fast på «Lagrer …» for alltid.
    let res: Awaited<ReturnType<typeof saveNote>>;
    try {
      res = await saveNote({ id: note.id, version: versionRef.current, content: content as { type: "doc" } });
    } catch {
      res = { ok: false };
    }
    saving.current = false;
    if (res.ok && res.note) {
      failures.current = 0;
      versionRef.current = res.note.version;
      onSaved(res.note);
      // Skrev brukeren mer mens vi lagret? Lagre igjen.
      if (pendingDoc.current) void flushRef.current();
      else {
        clearBackup(note.id);
        setState("saved");
      }
    } else if (res.conflict) {
      setState("conflict");
    } else {
      // Nettfeil o.l.: behold teksten og prøv igjen om litt (sjeldnere etter hvert).
      if (!pendingDoc.current) pendingDoc.current = content;
      failures.current++;
      setState(failures.current >= MAX_QUIET_RETRIES ? "stuck" : "error");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flushRef.current(), failures.current >= MAX_QUIET_RETRIES ? 15000 : 3000);
    }
  }, [note.id, onSaved]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Skriv et notat … første linje blir tittelen" }),
    ],
    content: note.content as object,
    editorProps: { attributes: { class: "familien-note min-h-[50vh] outline-none", spellcheck: "true", lang: "nb" } },
    // Endringer som ikke ble lagret sist (sikkerhetskopien) tas inn igjen og lagres.
    onCreate: ({ editor }) => {
      if (readOnly) return;
      const backup = readBackup(note.id);
      if (!backup) return;
      if (backup.version === note.version && JSON.stringify(backup.doc) !== JSON.stringify(note.content)) {
        editor.commands.setContent(backup.doc as object);
      } else {
        clearBackup(note.id);
      }
    },
    onUpdate: ({ editor }) => {
      pendingDoc.current = editor.getJSON() as DocNode;
      writeBackup(note.id, versionRef.current, pendingDoc.current);
      setState((s) => (s === "stuck" ? s : "dirty"));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flushRef.current(), SAVE_DELAY_MS);
    },
  });

  // Lagre det som gjenstår når man forlater notatet.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void flushRef.current();
    };
  }, []);

  // Ny versjon fra en annen skjerm mens vi ikke har ulagrede endringer: vis den uten å forstyrre.
  useEffect(() => {
    if (!editor || note.version <= versionRef.current) return;
    if (pendingDoc.current || saving.current) return;
    versionRef.current = note.version;
    editor.commands.setContent(note.content as object, { emitUpdate: false });
  }, [editor, note.version, note.content]);

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            heading: e.isActive("heading", { level: 1 }),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
            task: e.isActive("taskList"),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : null,
  });

  if (!editor) return <div className="min-h-[50vh] animate-pulse rounded-3xl bg-card" />;

  const tools = [
    { label: "Sjekkliste", icon: CheckSquare, on: active?.task, run: () => editor.chain().focus().toggleTaskList().run() },
    { label: "Punktliste", icon: List, on: active?.bullet, run: () => editor.chain().focus().toggleBulletList().run() },
    { label: "Nummerert liste", icon: ListOrdered, on: active?.ordered, run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: "Overskrift", icon: Heading, on: active?.heading, run: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { label: "Fet", icon: Bold, on: active?.bold, run: () => editor.chain().focus().toggleBold().run() },
    { label: "Kursiv", icon: Italic, on: active?.italic, run: () => editor.chain().focus().toggleItalic().run() },
  ];

  return (
    <div className="flex flex-col gap-3">
      {state === "conflict" && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-sun p-3 font-semibold">
          Notatet ble endret på en annen skjerm samtidig.
          <button className="rounded-xl bg-card px-3 py-2 font-bold" onClick={onReload}>
            Vis nyeste versjon
          </button>
        </div>
      )}

      {state === "stuck" && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-sun p-3 font-semibold">
          Får ikke lagret notatet. Endringene er tatt vare på på denne enheten.
          <button className="rounded-xl bg-card px-3 py-2 font-bold" onClick={() => window.location.reload()}>
            Last inn på nytt
          </button>
        </div>
      )}

      {!readOnly && (
        <div className="sticky top-14 z-10 flex items-center gap-1 overflow-x-auto rounded-2xl bg-card-soft/95 p-1 backdrop-blur md:top-2">
          {tools.map(({ label, icon: Icon, on, run }) => (
            <button
              key={label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={run}
              aria-label={label}
              aria-pressed={!!on}
              title={label}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition ${
                on ? "bg-primary text-white" : "text-ink hover:bg-card"
              }`}
            >
              <Icon size={20} aria-hidden />
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-line" />
          <button
            type="button"
            aria-label="Angre"
            title="Angre"
            disabled={!active?.canUndo}
            onClick={() => editor.chain().focus().undo().run()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink hover:bg-card disabled:opacity-30"
          >
            <Undo2 size={20} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Gjør om"
            title="Gjør om"
            disabled={!active?.canRedo}
            onClick={() => editor.chain().focus().redo().run()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink hover:bg-card disabled:opacity-30"
          >
            <Redo2 size={20} aria-hidden />
          </button>
          <span className="ml-auto shrink-0 whitespace-nowrap pr-2 text-xs font-bold text-ink-light" aria-live="polite">
            {state === "saving" || state === "dirty"
              ? "Lagrer …"
              : state === "error" || state === "stuck"
                ? "⚠️ Ikke lagret – prøver igjen"
                : state === "saved"
                  ? "Lagret ✓"
                  : ""}
          </span>
        </div>
      )}

      <EditorContent editor={editor} className="rounded-3xl bg-card p-5 shadow-[0_2px_12px_rgba(120,90,60,0.08)]" />
    </div>
  );
}
