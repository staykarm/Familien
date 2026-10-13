"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { connectOda, disconnectOda, forgetOdaPassword } from "@/actions/oda";
import { buttonGhost, buttonPrimary, input, label } from "@/components/ui/styles";
import type { OdaStatus } from "@/lib/oda/session";

const dateTime = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", dateStyle: "medium", timeStyle: "short" });

/** Kobler familiens Oda-konto til appen, én gang for alle. */
export function OdaSettings({ initial }: { initial: OdaStatus }) {
  const [status, setStatus] = useState(initial);
  const [email, setEmail] = useState(initial.email ?? "");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function connect(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    start(async () => {
      const res = await connectOda({ email, password, remember });
      setPassword("");
      setMessage(res.message ?? null);
      if (res.ok) setStatus({ connected: true, email, rememberPassword: remember, lastUsedAt: new Date().toISOString() });
    });
  }

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, after: (s: OdaStatus) => OdaStatus) {
    setMessage(null);
    start(async () => {
      const res = await fn();
      setMessage(res.message ?? null);
      if (res.ok) setStatus(after);
    });
  }

  if (status.connected) {
    return (
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 font-semibold">
          <CheckCircle2 size={22} className="shrink-0 text-emerald-600" aria-hidden />
          Koblet til som {status.email}
        </p>
        <p className="text-sm text-ink-light">
          {status.rememberPassword
            ? "Passordet er husket (kryptert), så appen logger inn på nytt av seg selv om Oda logger den ut."
            : "Passordet er ikke husket. Logger Oda ut appen, må du koble til på nytt her."}
          {status.lastUsedAt && ` Sist brukt ${dateTime.format(new Date(status.lastUsedAt))}.`}
        </p>
        {message && <p className="text-sm font-semibold">{message}</p>}
        <div className="flex flex-wrap gap-2">
          {status.rememberPassword && (
            <button className={buttonGhost} disabled={pending} onClick={() => run(forgetOdaPassword, (s) => ({ ...s, rememberPassword: false }))}>
              Glem passordet
            </button>
          )}
          <button
            className={`${buttonGhost} text-danger`}
            disabled={pending}
            onClick={() => run(disconnectOda, () => ({ connected: false, email: null, rememberPassword: false, lastUsedAt: null }))}
          >
            Koble fra Oda
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={connect} className="flex flex-col gap-3">
      <p className="text-ink-light">
        Logg inn med Oda-kontoen én gang, så kan hele familien sende handlelisten til Oda. Appen legger bare varer i
        handlekurven – den bestiller aldri.
      </p>
      <div>
        <label htmlFor="oda-email" className={label}>
          E-post hos Oda
        </label>
        <input id="oda-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={input} required />
      </div>
      <div>
        <label htmlFor="oda-pw" className={label}>
          Passord
        </label>
        <input
          id="oda-pw"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
          required
        />
      </div>
      <label className="flex min-h-12 cursor-pointer items-start gap-3">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-1 h-6 w-6 shrink-0 accent-primary" />
        <span>
          <span className="font-semibold">Husk passordet</span>
          <span className="block text-sm text-ink-light">
            Lagres kryptert, slik at appen kan logge inn på nytt av seg selv. Uten dette må du koble til på nytt når Oda logger
            appen ut.
          </span>
        </span>
      </label>
      {message && <p className="text-sm font-semibold">{message}</p>}
      <button className={`${buttonPrimary} self-start`} disabled={pending}>
        {pending ? "Logger inn …" : "Koble til Oda"}
      </button>
    </form>
  );
}
