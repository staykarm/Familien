"use client";

import { useEffect, useState, useTransition } from "react";
import { Lock, ScanFace, Trash2 } from "lucide-react";
import { changePin, lockNow, removePasskey, setRemember, type LockSettings as LockSettingsData } from "@/actions/lock";
import { enableFaceId, forgetFaceId, readFaceIdFlag, supportsFaceId } from "@/components/lock/passkey";
import { buttonGhost, buttonPrimary, buttonSecondary, input, label } from "@/components/ui/styles";
import { REMEMBER_LABEL, type RememberMode } from "@/lib/lock/token";

const date = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", dateStyle: "medium" });
const MODES: RememberMode[] = ["session", "day", "month"];

/** Felles kode når appen åpnes, hvor ofte den spørres om, og Face ID / Touch ID per enhet. */
export function LockSettings({ initial }: { initial: LockSettingsData }) {
  const [remember, setRememberState] = useState(initial.remember);
  const [isDefaultPin, setIsDefaultPin] = useState(initial.isDefaultPin);
  const [passkeys, setPasskeys] = useState(initial.passkeys);
  const [pins, setPins] = useState({ current: "", next: "", repeat: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Leses etter første tegning, siden serveren ikke vet hva enheten husker.
  const [device, setDevice] = useState<{ supported: boolean; id: string | null }>({ supported: false, id: null });

  useEffect(() => {
    const id = requestAnimationFrame(() => setDevice({ supported: supportsFaceId(), id: readFaceIdFlag() }));
    return () => cancelAnimationFrame(id);
  }, []);

  const thisDeviceOn = Boolean(device.id && passkeys.some((p) => p.id === device.id));

  function chooseMode(mode: RememberMode) {
    setRememberState(mode);
    start(async () => {
      const res = await setRemember(mode);
      if (!res.ok) setMessage(res.message ?? null);
    });
  }

  function savePin(e: React.FormEvent) {
    e.preventDefault();
    setPinMessage(null);
    start(async () => {
      const res = await changePin(pins);
      setPinMessage(res.message ?? null);
      if (res.ok) {
        setPins({ current: "", next: "", repeat: "" });
        setIsDefaultPin(false);
      }
    });
  }

  function turnOnFaceId() {
    setMessage(null);
    start(async () => {
      const res = await enableFaceId();
      setMessage(res.message ?? null);
      if (res.ok) window.location.reload();
    });
  }

  function remove(id: string) {
    start(async () => {
      const res = await removePasskey(id);
      if (!res.ok) return setMessage(res.message ?? null);
      forgetFaceId(id);
      setPasskeys((list) => list.filter((p) => p.id !== id));
      if (device.id === id) setDevice((d) => ({ ...d, id: null }));
    });
  }

  const pinField = (key: keyof typeof pins, text: string) => (
    <div>
      <label htmlFor={`pin-${key}`} className={label}>
        {text}
      </label>
      <input
        id={`pin-${key}`}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]*"
        maxLength={8}
        className={`${input} max-w-48 tracking-[0.4em]`}
        value={pins[key]}
        onChange={(e) => setPins((p) => ({ ...p, [key]: e.target.value.replace(/\D/g, "") }))}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-light">
        Appen spør om en felles kode når den åpnes.
        {isDefaultPin && (
          <>
            {" "}
            Dere bruker standardkoden <strong className="text-ink">0102</strong> – bytt den gjerne.
          </>
        )}
      </p>

      <div>
        <p className={label}>Be om koden</p>
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              disabled={pending}
              onClick={() => chooseMode(m)}
              aria-pressed={remember === m}
              className={`min-h-12 rounded-2xl border-2 px-4 font-bold transition ${
                remember === m ? "border-primary bg-primary-soft text-primary-dark" : "border-line bg-card text-ink"
              }`}
            >
              {REMEMBER_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className={label}>
          <ScanFace size={16} className="mr-1 inline" aria-hidden />
          Face ID / Touch ID
        </p>
        <p className="text-sm text-ink-light">
          Slå det på på hver enhet. Da låses appen opp med ansiktet eller fingeren, og koden trengs bare som reserve.
        </p>
        {passkeys.length > 0 && (
          <ul className="flex flex-col gap-1">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-2xl bg-card-soft px-3 py-1">
                <span className="flex-1 wrap-break-word">
                  <strong>{p.label}</strong>
                  {p.id === device.id && " (denne enheten)"}
                  <span className="block text-sm text-ink-light">
                    Lagt til {date.format(new Date(p.createdAt))}
                    {p.lastUsedAt && ` · sist brukt ${date.format(new Date(p.lastUsedAt))}`}
                    {!p.thisSite && " · annen adresse (testversjon)"}
                  </span>
                </span>
                <button type="button" className={buttonGhost} disabled={pending} onClick={() => remove(p.id)} aria-label={`Fjern ${p.label}`}>
                  <Trash2 size={18} />
                  <span className="hidden sm:inline">Fjern</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {device.supported && !thisDeviceOn && (
          <button type="button" className={`${buttonSecondary} self-start`} disabled={pending} onClick={turnOnFaceId}>
            <ScanFace size={20} aria-hidden />
            Slå på Face ID på denne enheten
          </button>
        )}
        {!device.supported && <p className="text-sm text-ink-light">Denne nettleseren støtter ikke Face ID / Touch ID.</p>}
        {message && <p className="text-sm font-semibold">{message}</p>}
      </div>

      <form onSubmit={savePin} className="flex flex-col gap-2">
        <p className={label}>Endre koden (4–8 sifre)</p>
        <div className="flex flex-wrap gap-3">
          {pinField("current", "Koden nå")}
          {pinField("next", "Ny kode")}
          {pinField("repeat", "Ny kode igjen")}
        </div>
        <p className="text-sm text-ink-light">De andre enhetene må taste den nye koden (eller bruke Face ID) neste gang.</p>
        {pinMessage && <p className="text-sm font-semibold">{pinMessage}</p>}
        <button type="submit" className={`${buttonPrimary} self-start`} disabled={pending || !pins.current || !pins.next}>
          Lagre ny kode
        </button>
      </form>

      <form action={lockNow}>
        <button type="submit" className={buttonGhost}>
          <Lock size={18} aria-hidden />
          Lås nå
        </button>
      </form>
    </div>
  );
}
