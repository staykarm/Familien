"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { Camera, Check, ExternalLink, FileUp, Pencil, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import {
  approveAll,
  approveSuggestion,
  createUpload,
  deleteUpload,
  getUploadUrl,
  listUploads,
  markSuggestionApproved,
  rejectSuggestion,
} from "@/actions/files";
import { addItem } from "@/actions/shopping";
import { EventDialog, type EventDraft } from "@/components/calendar/EventDialog";
import { TaskDialog, type TaskDraft } from "@/components/tasks/TaskDialog";
import { Avatar } from "@/components/ui/Avatar";
import { buttonGhost, buttonPrimary, buttonSecondary, card, input } from "@/components/ui/styles";
import { eventSuggestionToForm, taskSuggestionToForm } from "@/lib/ai/map";
import type { Suggestion, UploadWithSuggestions } from "@/lib/ai/types";
import type { CalendarCategory, CalendarMember } from "@/lib/calendar/types";
import { osloDate } from "@/lib/calendar/dates";
import { resizeImage } from "@/lib/imageResize";
import { createClient } from "@/lib/supabase/client";

const ACCEPT =
  "application/pdf,image/*,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

interface Props {
  initialUploads: UploadWithSuggestions[];
  members: CalendarMember[];
  eventCategories: CalendarCategory[];
  taskCategories: CalendarCategory[];
}

type Progress = { step: "upload" | "analyze"; filename: string } | null;

function formatDate(date: string | null): string {
  if (!date) return "";
  const d = osloDate(date);
  return d.isValid ? d.setLocale("nb").toFormat("ccc d. LLL") : date;
}

export function FilesApp({ initialUploads, members, eventCategories, taskCategories }: Props) {
  const [uploads, setUploads] = useState(initialUploads);
  const [progress, setProgress] = useState<Progress>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [eventEdit, setEventEdit] = useState<{ suggestionId: string; draft: EventDraft } | null>(null);
  const [taskEdit, setTaskEdit] = useState<{ suggestionId: string; draft: TaskDraft } | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const fellesId = members.find((m) => m.isShared)?.id ?? null;
  const memberNames = members.map((m) => ({ id: m.id, name: m.name }));

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };
  const refresh = useCallback(() => void listUploads().then(setUploads), []);

  async function analyze(uploadId: string, filename: string) {
    setProgress({ step: "analyze", filename });
    try {
      const res = await fetch(`/api/uploads/${uploadId}/analyze`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      showToast(body.message ?? (res.ok ? "Ferdig" : "Tolkningen feilet"));
    } catch {
      showToast("Mistet forbindelsen under tolkningen. Prøv «Tolk på nytt».");
    } finally {
      setProgress(null);
      refresh();
    }
  }

  async function handleFile(original: File) {
    try {
      // Store mobilbilder krympes før opplasting – raskere, og godt nok for Claude.
      const file =
        original.type.startsWith("image/") && original.size > 1.5 * 1024 * 1024 ? await resizeImage(original, 2000, 0.85) : original;
      const mime = file.type || (file.name.endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "");
      setProgress({ step: "upload", filename: original.name });

      const created = await createUpload({ filename: original.name, mime, size: file.size });
      if (!created.ok || !created.uploadId || !created.path || !created.token) {
        showToast(created.message ?? "Kunne ikke laste opp");
        setProgress(null);
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.storage.from("uploads").uploadToSignedUrl(created.path, created.token, file, { contentType: mime });
      if (error) {
        showToast("Opplastingen feilet. Prøv igjen.");
        setProgress(null);
        refresh();
        return;
      }
      refresh();
      await analyze(created.uploadId, original.name);
    } catch {
      showToast("Kunne ikke lese filen");
      setProgress(null);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void handleFile(file);
  }

  function act(fn: () => Promise<{ ok: boolean; message?: string }>) {
    start(async () => {
      const res = await fn();
      if (res.message) showToast(res.message);
      refresh();
    });
  }

  function editSuggestion(s: Suggestion) {
    if (s.kind === "event") {
      const form = eventSuggestionToForm(s.payload, memberNames, eventCategories, fellesId);
      setEventEdit({
        suggestionId: s.id,
        draft: {
          id: null,
          title: form.title,
          participantIds: form.participantIds,
          categoryId: form.categoryId,
          allDay: form.allDay,
          date: form.date,
          startTime: form.startTime,
          durationMinutes: form.durationMinutes,
          endDate: form.endDate,
          location: form.location ?? "",
          notes: form.notes ?? "",
        },
      });
    } else if (s.kind === "task") {
      const form = taskSuggestionToForm(s.payload, memberNames);
      setTaskEdit({
        suggestionId: s.id,
        draft: {
          id: null,
          title: form.title,
          notes: form.notes ?? "",
          assigneeId: form.assigneeId,
          categoryId: null,
          dueDate: form.dueDate ?? "",
          dueTime: form.dueTime ?? "",
          status: "todo",
        },
      });
    }
  }

  const busy = progress !== null;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-2xl font-bold sm:text-3xl lg:text-4xl">Les inn fil</h1>

      <section
        className={`${card} flex flex-col items-center gap-3 border-4 border-dashed py-5 text-center sm:gap-4 sm:py-8 transition ${
          dragging ? "border-primary bg-primary-soft" : "border-line"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file && !busy) void handleFile(file);
        }}
      >
        {busy ? (
          <>
            <Sparkles size={48} className="animate-pulse text-primary" aria-hidden />
            <p className="font-display text-xl font-bold sm:text-2xl">
              {progress.step === "upload" ? "Laster opp …" : "Claude leser dokumentet …"}
            </p>
            <p className="text-ink-light">
              {progress.filename}
              {progress.step === "analyze" && " – dette tar vanligvis under ett minutt."}
            </p>
          </>
        ) : (
          <>
            <span className="text-5xl" aria-hidden>
              📄
            </span>
            <div>
              <p className="font-display text-xl font-bold sm:text-2xl">Ukeplan, invitasjon eller skriv?</p>
              <p className="text-ink-light">
                Ta bilde eller velg en fil (PDF, bilde, Word). Du får forslag til aktiviteter, oppgaver og handleliste – ingenting
                lagres før du godkjenner.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
              <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={onPick} />
              <button className={buttonPrimary} onClick={() => cameraRef.current?.click()}>
                <Camera size={22} aria-hidden /> Ta bilde
              </button>
              <button className={buttonSecondary} onClick={() => fileRef.current?.click()}>
                <FileUp size={22} aria-hidden /> Velg fil
              </button>
            </div>
          </>
        )}
      </section>

      {uploads.map((u) => {
        const pendingCount = u.suggestions.filter((s) => s.status === "pending").length;
        const groups = [
          { kind: "event" as const, title: "📅 Aktiviteter" },
          { kind: "task" as const, title: "✅ Oppgaver" },
          { kind: "shopping" as const, title: "🛒 Handleliste" },
        ].map((g) => ({ ...g, items: u.suggestions.filter((s) => s.kind === g.kind) }));

        return (
          <section key={u.id} className={`${card} flex flex-col gap-4`}>
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="wrap-break-word font-display text-xl font-bold">{u.filename}</h2>
                <p className="text-sm text-ink-light">
                  {new Date(u.createdAt).toLocaleString("nb-NO", { timeZone: "Europe/Oslo", dateStyle: "medium", timeStyle: "short" })}
                  {" · "}
                  {u.status === "done" && "Tolket"}
                  {u.status === "analyzing" && "Tolkes …"}
                  {u.status === "uploaded" && "Ikke tolket"}
                  {u.status === "failed" && <span className="font-bold text-danger">Feilet</span>}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className={buttonGhost}
                  aria-label="Vis originalfilen"
                  title="Vis fil"
                  onClick={() =>
                    void getUploadUrl(u.id).then((url) => (url ? window.open(url, "_blank", "noopener") : showToast("Fant ikke filen")))
                  }
                >
                  <ExternalLink size={20} aria-hidden />
                </button>
                {u.status !== "analyzing" && (
                  <button className={buttonGhost} aria-label="Tolk på nytt" title="Tolk på nytt" disabled={busy} onClick={() => void analyze(u.id, u.filename)}>
                    <RefreshCw size={20} aria-hidden />
                  </button>
                )}
                <button className={buttonGhost} aria-label="Slett filen" title="Slett" onClick={() => act(() => deleteUpload(u.id))}>
                  <Trash2 size={20} aria-hidden />
                </button>
              </div>
            </div>

            {u.error && <p className="rounded-2xl bg-primary-soft p-3 font-semibold text-danger">{u.error}</p>}
            {u.summary && <p className="rounded-2xl bg-sky/50 p-3">{u.summary}</p>}
            {u.status === "done" && u.suggestions.length === 0 && <p className="text-ink-light">Fant ingen aktiviteter, oppgaver eller varer.</p>}

            {groups
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <div key={g.kind} className="flex flex-col gap-2">
                  <h3 className="font-display text-lg font-bold">{g.title}</h3>
                  <ul className="flex flex-col gap-2">
                    {g.items.map((s) => (
                      <SuggestionRow
                        key={s.id}
                        s={s}
                        members={members}
                        disabled={pending}
                        onApprove={() => act(() => approveSuggestion(s.id))}
                        onReject={() => act(() => rejectSuggestion(s.id))}
                        onEdit={() => editSuggestion(s)}
                        onApproveShopping={(name, quantity) =>
                          act(async () => {
                            const res = await addItem({ name, quantity, categoryId: null });
                            await markSuggestionApproved(s.id, null);
                            return { ok: true, message: res.ok ? "Lagt på handlelisten" : res.message };
                          })
                        }
                      />
                    ))}
                  </ul>
                </div>
              ))}

            {pendingCount > 1 && (
              <button className={`${buttonPrimary} self-start`} disabled={pending} onClick={() => act(() => approveAll(u.id))}>
                <Check size={20} aria-hidden /> Godkjenn alle ({pendingCount})
              </button>
            )}
          </section>
        );
      })}

      {eventEdit && (
        <EventDialog
          key={eventEdit.suggestionId}
          draft={eventEdit.draft}
          members={members}
          categories={eventCategories}
          onClose={() => setEventEdit(null)}
          onSaved={(_message, id) => {
            const suggestionId = eventEdit.suggestionId;
            setEventEdit(null);
            act(async () => {
              await markSuggestionApproved(suggestionId, id ?? null);
              return { ok: true, message: "Lagt i kalenderen" };
            });
          }}
        />
      )}

      {taskEdit && (
        <TaskDialog
          key={taskEdit.suggestionId}
          draft={taskEdit.draft}
          members={members}
          categories={taskCategories}
          onClose={() => setTaskEdit(null)}
          onSaved={(_message, task) => {
            const suggestionId = taskEdit.suggestionId;
            setTaskEdit(null);
            act(async () => {
              await markSuggestionApproved(suggestionId, task?.id ?? null);
              return { ok: true, message: "Lagt til i oppgaver" };
            });
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

interface RowProps {
  s: Suggestion;
  members: CalendarMember[];
  disabled: boolean;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  onApproveShopping: (name: string, quantity: string | null) => void;
}

function SuggestionRow({ s, members, disabled, onApprove, onReject, onEdit, onApproveShopping }: RowProps) {
  const [editingItem, setEditingItem] = useState(false);
  const [name, setName] = useState(s.kind === "shopping" ? s.payload.name : "");
  const [quantity, setQuantity] = useState(s.kind === "shopping" ? (s.payload.quantity ?? "") : "");
  const decided = s.status !== "pending";

  const people =
    s.kind === "event" ? s.payload.participants : s.kind === "task" && s.payload.assignee ? [s.payload.assignee] : [];
  const avatars = people.map((p) => members.find((m) => m.name.toLowerCase() === p.toLowerCase())).filter((m): m is CalendarMember => !!m);

  let title = "";
  let detail = "";
  if (s.kind === "event") {
    const p = s.payload;
    title = p.title;
    const when = p.allDay || !p.startTime ? "hele dagen" : `kl. ${p.startTime}${p.endTime ? `–${p.endTime}` : ""}`;
    detail = [`${formatDate(p.date)}${p.endDate && p.endDate !== p.date ? `–${formatDate(p.endDate)}` : ""}`, when, p.location, p.notes]
      .filter(Boolean)
      .join(" · ");
  } else if (s.kind === "task") {
    title = s.payload.title;
    detail = [s.payload.dueDate ? `frist ${formatDate(s.payload.dueDate)}${s.payload.dueTime ? ` kl. ${s.payload.dueTime}` : ""}` : "uten frist", s.payload.notes]
      .filter(Boolean)
      .join(" · ");
  } else {
    title = s.payload.name;
    detail = s.payload.quantity ?? "";
  }

  return (
    <li
      className={`flex flex-col gap-2 rounded-2xl border-2 p-3 sm:flex-row sm:items-center ${
        s.status === "approved" ? "border-mint bg-mint/40" : s.status === "rejected" ? "border-line opacity-50" : "border-line bg-card"
      }`}
    >
      {editingItem && s.kind === "shopping" ? (
        <div className="flex flex-1 gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Vare" className={`${input} min-w-0 flex-1`} />
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-label="Antall"
            placeholder="Antall"
            className={`${input.replace("w-full", "")} w-24 shrink-0`}
          />
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className={`font-bold ${s.status === "rejected" ? "line-through" : ""}`}>{title}</p>
            {detail && <p className="text-sm text-ink-light">{detail}</p>}
          </div>
          <div className="flex -space-x-2">
            {avatars.map((m) => (
              <Avatar key={m.id} name={m.name} color={m.color} icon={m.icon} url={m.avatarUrl} size={30} />
            ))}
          </div>
        </div>
      )}

      {decided ? (
        <span className="text-sm font-bold text-ink-light">{s.status === "approved" ? "✓ Lagt inn" : "Avvist"}</span>
      ) : (
        <div className="flex shrink-0 gap-1">
          {editingItem ? (
            <button className={`${buttonPrimary} px-4`} disabled={disabled || !name.trim()} onClick={() => onApproveShopping(name.trim(), quantity.trim() || null)}>
              <Check size={20} aria-hidden /> Legg til
            </button>
          ) : (
            <>
              <button className={`${buttonPrimary} px-4`} disabled={disabled} onClick={onApprove} aria-label={`Godkjenn ${title}`}>
                <Check size={20} aria-hidden />
              </button>
              <button
                className={`${buttonSecondary} px-3`}
                disabled={disabled}
                onClick={s.kind === "shopping" ? () => setEditingItem(true) : onEdit}
                aria-label={`Endre ${title}`}
              >
                <Pencil size={18} aria-hidden />
              </button>
            </>
          )}
          <button
            className={`${buttonGhost} px-3`}
            disabled={disabled}
            onClick={editingItem ? () => setEditingItem(false) : onReject}
            aria-label={editingItem ? "Avbryt" : `Avvis ${title}`}
          >
            <X size={20} aria-hidden />
          </button>
        </div>
      )}
    </li>
  );
}
