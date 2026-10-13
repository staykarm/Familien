"use client";

/* eslint-disable @next/next/no-img-element -- produktbilder fra Oda sin CDN */
import { useEffect, useMemo, useState, useTransition } from "react";
import { ExternalLink, Minus, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { addToOdaCart, getOdaStatus } from "@/actions/oda";
import { Sheet } from "@/components/ui/Sheet";
import { buttonGhost, buttonPrimary, buttonSecondary } from "@/components/ui/styles";
import type { OdaProposal, ProposalLine } from "@/lib/oda/agent";
import type { OdaProduct } from "@/lib/oda/parse";
import type { ShoppingTemplate } from "@/lib/shopping/types";

type Step = "loading" | "login" | "choose" | "working" | "review" | "done";

interface Props {
  openCount: number;
  templates: ShoppingTemplate[];
  /** Forhåndsvalgt kilde, f.eks. en fast liste man trykket «Send til Oda» på. */
  initialTemplateId?: string | null;
  onClose: () => void;
  onDone: () => void;
}

interface ReviewLine extends ProposalLine {
  include: boolean;
  itemId: string | null;
}

const kr = (n: number) => n.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function OdaDialog({ openCount, templates, initialTemplateId, onClose, onDone }: Props) {
  const [step, setStep] = useState<Step>("loading");
  const [connectedAs, setConnectedAs] = useState<string | null>(null);
  const [lines, setLines] = useState<ReviewLine[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [fromList, setFromList] = useState(true);
  const [checkOff, setCheckOff] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    void getOdaStatus().then((s) => {
      setConnectedAs(s.email);
      if (!s.connected) setStep("login");
      else if (initialTemplateId) void propose({ source: "template", templateId: initialTemplateId });
      else setStep("choose");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kjøres én gang når dialogen åpnes
  }, []);

  async function propose(body: { source: "list" } | { source: "template"; templateId: string }) {
    setError(null);
    setFromList(body.source === "list");
    setStep("working");
    try {
      const res = await fetch("/api/oda/forslag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        needsLogin?: boolean;
        proposal?: OdaProposal;
        itemIds?: (string | null)[];
      };
      if (!json.ok || !json.proposal) {
        setError(json.message ?? "Noe gikk galt");
        setStep(json.needsLogin ? "login" : "choose");
        return;
      }
      setNote(json.proposal.note);
      setLines(json.proposal.lines.map((l, i) => ({ ...l, include: !!l.product, itemId: json.itemIds?.[i] ?? null })));
      setStep("review");
    } catch {
      setError("Mistet forbindelsen. Prøv igjen.");
      setStep("choose");
    }
  }

  const update = (i: number, patch: Partial<ReviewLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  function swap(i: number, productId: string) {
    const line = lines[i];
    const all = [line.product, ...line.alternatives].filter((p): p is OdaProduct => !!p);
    const chosen = all.find((p) => String(p.id) === productId) ?? null;
    update(i, {
      product: chosen,
      alternatives: all.filter((p) => p.id !== chosen?.id),
      include: !!chosen,
    });
  }

  const selected = lines.filter((l) => l.include && l.product);
  const total = useMemo(() => selected.reduce((sum, l) => sum + (l.product?.price ?? 0) * l.quantity, 0), [selected]);

  function confirm() {
    setError(null);
    start(async () => {
      const res = await addToOdaCart({
        lines: selected.map((l) => ({ productId: l.product!.id, quantity: l.quantity })),
        checkItemIds: fromList && checkOff ? selected.map((l) => l.itemId).filter((id): id is string => !!id) : [],
      });
      if (res.ok) {
        setResult(res.message ?? "Lagt i handlekurven");
        setStep("done");
        onDone();
      } else {
        setError(res.message ?? "Noe gikk galt");
        if (res.needsLogin) setStep("login");
      }
    });
  }

  const titles: Record<Step, string> = {
    loading: "Send til Oda",
    login: "Oda er ikke koblet til",
    choose: "Send til Oda",
    working: "Finner varer …",
    review: "Sjekk varene",
    done: "Lagt i handlekurven",
  };

  let footer: React.ReactNode = (
    <button type="button" className={`${buttonSecondary} ml-auto`} onClick={onClose}>
      Lukk
    </button>
  );
  if (step === "login") {
    footer = (
      <Link href="/innstillinger#oda" className={`${buttonPrimary} ml-auto`}>
        Gå til Innstillinger
      </Link>
    );
  } else if (step === "review") {
    footer = (
      <>
        <div className="text-sm">
          <p className="font-bold">
            {selected.length} varer · ca. {kr(total)} kr
          </p>
          <p className="text-ink-light">Ingenting bestilles – du fullfører i Oda.</p>
        </div>
        <button className={`${buttonPrimary} ml-auto`} disabled={pending || selected.length === 0}>
          {pending ? "Legger i kurven …" : "Legg i handlekurven"}
        </button>
      </>
    );
  } else if (step === "done") {
    footer = (
      <>
        <a href="https://oda.com/no/cart/" target="_blank" rel="noreferrer" className={buttonPrimary}>
          <ExternalLink size={18} aria-hidden /> Åpne Oda
        </a>
        <button type="button" className={`${buttonSecondary} ml-auto`} onClick={onClose}>
          Ferdig
        </button>
      </>
    );
  }

  return (
    <Sheet
      title={titles[step]}
      onClose={onClose}
      onSubmit={() => {
        if (step === "review") confirm();
      }}
      footer={footer}
    >
      {step === "loading" && <div className="h-24 animate-pulse rounded-2xl bg-card-soft" />}

      {step === "login" && (
        <p className="text-ink-light">
          Oda må kobles til én gang under Innstillinger før handlelisten kan sendes dit. Det tar et halvt minutt.
        </p>
      )}

      {step === "choose" && (
        <>
          <p className="text-ink-light">
            Hva skal sendes? Claude finner riktige varer hos Oda (og foretrekker det dere har kjøpt før). Du ser gjennom forslaget
            før noe havner i handlekurven.
          </p>
          <button type="button" className={`${buttonPrimary} justify-start`} disabled={openCount === 0} onClick={() => void propose({ source: "list" })}>
            🛒 Handlelisten ({openCount} varer)
          </button>
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`${buttonSecondary} justify-start`}
              disabled={t.items.length === 0}
              onClick={() => void propose({ source: "template", templateId: t.id })}
            >
              {t.icon} {t.name} ({t.items.length} varer)
            </button>
          ))}
          {connectedAs && <p className="text-sm text-ink-light">Koblet til Oda som {connectedAs}.</p>}
        </>
      )}

      {step === "working" && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Sparkles size={44} className="animate-pulse text-primary" aria-hidden />
          <p className="font-display text-xl font-bold">Claude finner varene hos Oda …</p>
          <p className="text-ink-light">Søker og sammenligner med det dere pleier å kjøpe. Tar gjerne et halvt minutt.</p>
        </div>
      )}

      {step === "review" && (
        <>
          {note && <p className="rounded-2xl bg-sky/50 p-3">{note}</p>}
          <ul className="flex flex-col gap-2">
            {lines.map((l, i) => (
              <li
                key={`${l.item}-${i}`}
                className={`flex flex-col gap-2 rounded-2xl border-2 p-3 ${l.include && l.product ? "border-line bg-card" : "border-dashed border-line opacity-60"}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Ta med ${l.item}`}
                    checked={l.include && !!l.product}
                    disabled={!l.product}
                    onChange={(e) => update(i, { include: e.target.checked })}
                    className="mt-1 h-6 w-6 shrink-0 accent-[var(--color-primary)]"
                  />
                  {l.product?.imageUrl ? (
                    <img src={l.product.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-white object-contain" />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-card-soft text-xl" aria-hidden>
                      🛒
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase text-ink-faint">
                      {l.item}
                      {l.quantityText ? ` · ${l.quantityText}` : ""}
                    </p>
                    {l.product ? (
                      <>
                        <p className="font-bold leading-tight">{l.product.name}</p>
                        <p className="text-sm text-ink-light">
                          {[l.product.extra, l.product.price != null ? `${kr(l.product.price)} kr` : null].filter(Boolean).join(" · ")}
                        </p>
                      </>
                    ) : (
                      <p className="font-semibold text-danger">Fant ikke noe som passet</p>
                    )}
                    {l.reason && <p className="text-xs text-ink-faint">{l.reason}</p>}
                  </div>
                  {l.product && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label="Færre"
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-card-soft"
                        onClick={() => update(i, { quantity: Math.max(1, l.quantity - 1) })}
                      >
                        <Minus size={16} aria-hidden />
                      </button>
                      <span className="w-6 text-center font-bold tabular-nums">{l.quantity}</span>
                      <button
                        type="button"
                        aria-label="Flere"
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-card-soft"
                        onClick={() => update(i, { quantity: Math.min(50, l.quantity + 1) })}
                      >
                        <Plus size={16} aria-hidden />
                      </button>
                    </div>
                  )}
                </div>
                {l.alternatives.length > 0 && (
                  <select
                    aria-label={`Velg annen vare for ${l.item}`}
                    value={l.product ? String(l.product.id) : ""}
                    onChange={(e) => swap(i, e.target.value)}
                    className="min-h-11 w-full rounded-xl border-2 border-line bg-card-soft px-3 text-sm"
                  >
                    {!l.product && <option value="">Velg en vare …</option>}
                    {[l.product, ...l.alternatives]
                      .filter((p): p is OdaProduct => !!p)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.extra ? ` (${p.extra})` : ""} – {p.price != null ? `${kr(p.price)} kr` : "?"}
                          {p.available ? "" : " – utsolgt"}
                        </option>
                      ))}
                  </select>
                )}
              </li>
            ))}
          </ul>
          {fromList && (
            <label className="flex min-h-11 items-center gap-3 font-semibold">
              <input type="checkbox" checked={checkOff} onChange={(e) => setCheckOff(e.target.checked)} className="h-6 w-6 accent-[var(--color-primary)]" />
              Huk av varene på handlelisten etterpå
            </label>
          )}
        </>
      )}

      {step === "done" && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <span className="text-5xl" aria-hidden>
            🛒
          </span>
          <p className="font-display text-xl font-bold">{result}</p>
          <p className="text-ink-light">Velg levering og fullfør bestillingen i Oda-appen eller på oda.com.</p>
        </div>
      )}

      {error && <p className="rounded-2xl bg-primary-soft p-3 font-semibold text-danger">{error}</p>}
      {step === "review" && (
        <button type="button" className={`${buttonGhost} self-start text-sm`} onClick={() => setStep("choose")}>
          ← Velg en annen liste
        </button>
      )}
    </Sheet>
  );
}
