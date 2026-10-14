"use client";

import { useEffect, useId, type FormEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { buttonGhost } from "@/components/ui/styles";

interface SheetProps {
  title: string;
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  footer: ReactNode;
}

/** Skjema i et ark: glir opp nedenfra på mobil, sentrert dialog på større skjermer. Esc og klikk utenfor lukker. */
export function Sheet({ title, onClose, onSubmit, children, footer }: SheetProps) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(e);
        }}
        onClick={(e) => e.stopPropagation()}
        className="pb-safe flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-card shadow-xl sm:rounded-3xl"
      >
        <header className="flex items-center justify-between border-b-2 border-line px-5 py-3">
          <h2 id={titleId} className="font-display text-lg font-bold sm:text-2xl">
            {title}
          </h2>
          <button type="button" onClick={onClose} className={buttonGhost} aria-label="Lukk">
            <X size={24} aria-hidden />
          </button>
        </header>
        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">{children}</div>
        <footer className="flex flex-wrap items-center gap-3 border-t-2 border-line px-5 py-3">{footer}</footer>
      </form>
    </div>
  );
}

/** «Slett» med bekreftelse i to trinn. */
export function DeleteButton({
  confirming,
  onAsk,
  onCancel,
  onConfirm,
  pending,
  label = "Slett",
}: {
  confirming: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  label?: string;
}) {
  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="font-bold text-danger">Slette?</span>
        <button
          type="button"
          className="inline-flex min-h-12 items-center rounded-2xl border-2 border-danger px-4 font-bold text-danger"
          onClick={onConfirm}
          disabled={pending}
        >
          Ja, slett
        </button>
        <button type="button" className={buttonGhost} onClick={onCancel}>
          Nei
        </button>
      </div>
    );
  }
  return (
    <button type="button" className={buttonGhost} onClick={onAsk}>
      {label}
    </button>
  );
}
