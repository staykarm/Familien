"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, RefreshCw, Settings2 } from "lucide-react";
import {
  chooseOutlookCalendar,
  disconnectOutlook,
  getOutlookStatus,
  listOutlookCalendars,
  syncOutlookNow,
  type OutlookCalendar,
  type OutlookStatus,
} from "@/actions/outlook";
import { buttonGhost, buttonPrimary, buttonSecondary } from "@/components/ui/styles";

const dateTime = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", dateStyle: "short", timeStyle: "short" });

/** Meldinger etter at Microsoft sender oss tilbake hit (`?outlook=…`). */
const RETURN_MESSAGES: Record<string, string> = {
  velg: "Innlogget hos Microsoft. Velg kalenderen under.",
  koblet: "Koblet til Outlook igjen.",
  avbrutt: "Innloggingen ble avbrutt.",
  ugyldig: "Innloggingen kunne ikke bekreftes. Prøv igjen.",
  "feil-nokkel": "Microsoft avviste appen. Sjekk MS_CLIENT_ID og MS_CLIENT_SECRET i Vercel.",
  feil: "Noe gikk galt under innloggingen. Prøv igjen.",
  "mangler-oppsett": "MS_CLIENT_ID og MS_CLIENT_SECRET mangler i Vercel.",
};

export function OutlookSettings({ initial, returnStatus }: { initial: OutlookStatus; returnStatus: string | null }) {
  const [status, setStatus] = useState(initial);
  const [calendars, setCalendars] = useState<OutlookCalendar[] | null>(null);
  const [choosing, setChoosing] = useState(initial.connected && !initial.calendarId);
  const [message, setMessage] = useState<string | null>(returnStatus ? (RETURN_MESSAGES[returnStatus] ?? null) : null);
  const [pending, start] = useTransition();

  const refresh = () => void getOutlookStatus().then(setStatus);

  useEffect(() => {
    if (!choosing || calendars) return;
    void listOutlookCalendars().then((res) => {
      setCalendars(res.calendars);
      if (!res.ok) setMessage(res.message ?? "Kunne ikke hente kalenderne");
    });
  }, [choosing, calendars]);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) {
    setMessage(null);
    start(async () => {
      const res = await fn();
      setMessage(res.message ?? null);
      if (res.ok) after?.();
      refresh();
    });
  }

  if (!status.configured) {
    return (
      <p className="text-ink-light">
        Outlook er ikke satt opp ennå. Legg inn <code>MS_CLIENT_ID</code> og <code>MS_CLIENT_SECRET</code> i Vercel (se README), og
        last siden på nytt.
      </p>
    );
  }

  if (!status.connected) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-ink-light">
          Synk kalenderen i appen med den delte Outlook-kalenderen, begge veier. Den som eier kalenderen logger inn én gang.
        </p>
        {message && <p className="text-sm font-semibold">{message}</p>}
        <a href="/api/outlook/connect" className={`${buttonPrimary} self-start`}>
          Koble til Outlook
        </a>
      </div>
    );
  }

  if (choosing) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-ink-light">
          Innlogget som <strong className="text-ink">{status.email}</strong>. Hvilken kalender skal familien bruke?
        </p>
        {message && <p className="text-sm font-semibold">{message}</p>}
        {!calendars && <div className="h-24 animate-pulse rounded-2xl bg-card-soft" />}
        {calendars?.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={pending || !c.canEdit}
            onClick={() =>
              run(
                () => chooseOutlookCalendar({ id: c.id, name: c.name }),
                () => setChoosing(false)
              )
            }
            className={`${buttonSecondary} justify-start text-left`}
          >
            📅 {c.name}
            <span className="text-sm font-normal text-ink-light">
              {c.isDefault ? " · hovedkalender" : ""}
              {!c.canEdit ? " · kun lesetilgang" : ""}
            </span>
          </button>
        ))}
        <div className="flex flex-wrap gap-2">
          {status.calendarId && (
            <button type="button" className={buttonGhost} onClick={() => setChoosing(false)}>
              Avbryt
            </button>
          )}
          <button type="button" className={`${buttonGhost} text-danger`} disabled={pending} onClick={() => run(disconnectOutlook)}>
            Koble fra
          </button>
        </div>
      </div>
    );
  }

  const { counts } = status;
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-2 font-semibold">
        <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
        <span>
          Synker med «{status.calendarName}» ({status.email})
        </span>
      </p>
      <ul className="flex flex-col gap-1 text-sm text-ink-light">
        <li>Sist synket: {status.lastSyncAt ? dateTime.format(new Date(status.lastSyncAt)) : "ikke ennå"}</li>
        <li>
          {status.subscriptionActive
            ? "Endringer i Outlook kommer inn i løpet av noen sekunder."
            : "Endringer i Outlook hentes ved «Synk nå» og én gang i døgnet."}
        </li>
        {counts.waiting > 0 && <li>{counts.waiting} aktiviteter venter på å bli sendt til Outlook.</li>}
        {counts.conflicts > 0 && (
          <li className="font-semibold text-ink">⚠️ {counts.conflicts} aktiviteter er endret begge steder – åpne dem i kalenderen og velg.</li>
        )}
        {counts.errors > 0 && <li className="font-semibold text-danger">{counts.errors} aktiviteter kunne ikke synkes.</li>}
      </ul>
      {status.lastError && <p className="rounded-2xl bg-primary-soft p-3 text-sm font-semibold text-danger">{status.lastError}</p>}
      {message && <p className="text-sm font-semibold">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonSecondary} disabled={pending} onClick={() => run(syncOutlookNow)}>
          <RefreshCw size={18} className={pending ? "animate-spin" : ""} aria-hidden /> {pending ? "Synker …" : "Synk nå"}
        </button>
        <button type="button" className={buttonGhost} disabled={pending} onClick={() => setChoosing(true)}>
          <Settings2 size={18} aria-hidden /> Bytt kalender
        </button>
        <button type="button" className={`${buttonGhost} text-danger`} disabled={pending} onClick={() => run(disconnectOutlook)}>
          Koble fra
        </button>
      </div>
      {status.log.length > 0 && (
        <details className="text-sm">
          <summary className="min-h-12 cursor-pointer content-center font-semibold text-ink-light">Siste hendelser</summary>
          <ul className="flex flex-col gap-1">
            {status.log.map((l) => (
              <li key={l.id} className={`flex items-start gap-2 ${l.ok ? "text-ink-light" : "text-danger"}`}>
                {l.direction === "in" ? (
                  <ArrowDownToLine size={16} className="mt-0.5 shrink-0" aria-label="Fra Outlook" />
                ) : l.direction === "out" ? (
                  <ArrowUpFromLine size={16} className="mt-0.5 shrink-0" aria-label="Til Outlook" />
                ) : (
                  <RefreshCw size={16} className="mt-0.5 shrink-0" aria-hidden />
                )}
                <span>
                  <span className="tabular-nums">{dateTime.format(new Date(l.createdAt))}</span> · {l.message}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
