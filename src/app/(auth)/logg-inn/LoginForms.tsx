"use client";

import { useActionState, useState } from "react";
import { KeyRound, Mail } from "lucide-react";
import { buttonPrimary, buttonGhost, input, label } from "@/components/ui/styles";
import { passwordLogin, sendLoginCode, verifyLoginCode, type LoginState, type PasswordState } from "./actions";

export function LoginForms({ next }: { next: string }) {
  const [mode, setMode] = useState<"adult" | "family">("adult");
  // Ny nøkkel nullstiller kodeskjemaet helt («Bruk en annen e-post»).
  const [otpKey, setOtpKey] = useState(0);

  return (
    <div className="w-full">
      <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl bg-card-soft p-1.5">
        {(
          [
            ["adult", "Voksen", Mail],
            ["family", "Nettbrett", KeyRound],
          ] as const
        ).map(([value, text, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl font-bold transition ${
              mode === value ? "bg-card text-primary-dark shadow-sm" : "text-ink-light"
            }`}
          >
            <Icon size={18} aria-hidden />
            {text}
          </button>
        ))}
      </div>
      {mode === "adult" ? <OtpForm key={otpKey} next={next} onReset={() => setOtpKey((k) => k + 1)} /> : <PasswordForm next={next} />}
    </div>
  );
}

function OtpForm({ next, onReset }: { next: string; onReset: () => void }) {
  const [sendState, sendAction, sending] = useActionState<LoginState, FormData>(sendLoginCode, { step: "email" });
  const [verifyState, verifyAction, verifying] = useActionState<LoginState, FormData>(verifyLoginCode, {
    step: "code",
  });
  if (sendState.step !== "code") {
    return (
      <form action={sendAction} className="flex flex-col gap-4">
        <input type="hidden" name="neste" value={next} />
        <div>
          <label htmlFor="email" className={label}>
            E-post
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={sendState.email}
            className={input}
          />
        </div>
        {sendState.error && <p className="font-semibold text-danger">{sendState.error}</p>}
        <button className={buttonPrimary} disabled={sending}>
          {sending ? "Sender …" : "Send meg innloggingskode"}
        </button>
      </form>
    );
  }

  return (
    <form action={verifyAction} className="flex flex-col gap-4">
      <input type="hidden" name="neste" value={next} />
      <input type="hidden" name="email" value={sendState.email} />
      <p className="rounded-2xl bg-mint p-4 text-ink">{sendState.info}</p>
      <div>
        <label htmlFor="token" className={label}>
          Kode fra e-posten
        </label>
        <input
          id="token"
          name="token"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          className={`${input} text-center text-2xl tracking-[0.4em]`}
        />
      </div>
      {verifyState.error && <p className="font-semibold text-danger">{verifyState.error}</p>}
      <button className={buttonPrimary} disabled={verifying}>
        {verifying ? "Logger inn …" : "Logg inn"}
      </button>
      <button type="button" className={buttonGhost} onClick={onReset}>
        Bruk en annen e-post
      </button>
    </form>
  );
}

function PasswordForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(passwordLogin, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="neste" value={next} />
      <div>
        <label htmlFor="f-email" className={label}>
          E-post
        </label>
        <input id="f-email" name="email" type="email" autoComplete="username" required className={input} />
      </div>
      <div>
        <label htmlFor="f-password" className={label}>
          Passord
        </label>
        <input
          id="f-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={input}
        />
      </div>
      {state.error && <p className="font-semibold text-danger">{state.error}</p>}
      <button className={buttonPrimary} disabled={pending}>
        {pending ? "Logger inn …" : "Logg inn"}
      </button>
    </form>
  );
}
