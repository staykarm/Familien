"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Send, Trash2, Users } from "lucide-react";
import {
  getPushDevice,
  removePushDevice,
  savePushSettings,
  sendTestPush,
  setPushMember,
  subscribePush,
  unsubscribePush,
  type PushDevice,
} from "@/actions/push";
import { Avatar } from "@/components/ui/Avatar";
import { buttonGhost, buttonPrimary, buttonSecondary, input, label } from "@/components/ui/styles";
import { autosaveLabel, useAutosave } from "@/components/useAutosave";
import type { CalendarMember } from "@/lib/calendar/types";
import { deviceLabel } from "@/lib/push/device";
import { PUSH_TYPES, type PushSettings as Settings, type PushType } from "@/lib/push/settings";

const dateTime = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", dateStyle: "medium", timeStyle: "short" });

interface Props {
  /** Null når SQL-en for pushvarsler ikke er kjørt ennå. */
  publicKey: string | null;
  settings: Settings;
  members: CalendarMember[];
  devices: PushDevice[];
  activeMemberId: string | null;
}

/** «Varsler» i Innstillinger: slå på for denne enheten, velg hva som sendes til hvem, og se enhetene. */
export function PushSettings({ publicKey, settings, members, devices: initialDevices, activeMemberId }: Props) {
  const people = members.filter((m) => !m.isShared);
  const [devices, setDevices] = useState(initialDevices);

  if (!publicKey) {
    return (
      <p className="text-ink-light">
        Pushvarsler er ikke klare ennå. SQL-en for varsler må kjøres i Supabase (se PR-en), og <code>TOKEN_ENCRYPTION_KEY</code> må være satt i
        Vercel.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ThisDevice publicKey={publicKey} people={people} activeMemberId={activeMemberId} onChanged={setDevices} />
      <Rules initial={settings} people={people} />
      <Devices devices={devices} people={people} onRemoved={(id) => setDevices((list) => list.filter((d) => d.id !== id))} />
    </div>
  );
}

// --- Denne enheten ---------------------------------------------------------------------

type DeviceState =
  | { kind: "loading" }
  | { kind: "unsupported"; ios: boolean }
  | { kind: "denied" }
  | { kind: "off" }
  | { kind: "on"; endpoint: string; memberId: string | null; id: string };

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

function ThisDevice({
  publicKey,
  people,
  activeMemberId,
  onChanged,
}: {
  publicKey: string;
  people: CalendarMember[];
  activeMemberId: string | null;
  onChanged: (update: (list: PushDevice[]) => PushDevice[]) => void;
}) {
  const [state, setState] = useState<DeviceState>({ kind: "loading" });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  // Personen enheten skal få varsler for når de slås på: den som bruker appen nå.
  const [choice, setChoice] = useState<string | null>(activeMemberId && people.some((p) => p.id === activeMemberId) ? activeMemberId : null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) {
        const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
        if (!cancelled) setState({ kind: "unsupported", ios });
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState({ kind: "denied" });
        return;
      }
      try {
        const reg = await registration();
        const sub = await reg.pushManager.getSubscription();
        const saved = sub ? await getPushDevice(sub.endpoint) : null;
        if (cancelled) return;
        setState(sub && saved ? { kind: "on", endpoint: sub.endpoint, memberId: saved.memberId, id: saved.id } : { kind: "off" });
      } catch {
        if (!cancelled) setState({ kind: "off" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function enable() {
    setMessage(null);
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? { kind: "denied" } : { kind: "off" });
          return;
        }
        const reg = await registration();
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
        const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        const device = deviceLabel(navigator.userAgent, navigator.maxTouchPoints);
        const res = await subscribePush({ endpoint: json.endpoint, keys: json.keys, memberId: choice, device });
        setMessage({ ok: res.ok, text: res.message ?? "" });
        if (res.ok && res.id) {
          const id = res.id;
          setState({ kind: "on", endpoint: json.endpoint, memberId: choice, id });
          onChanged((list) => [
            ...list.filter((d) => d.id !== id),
            { id, memberId: choice, device, createdAt: new Date().toISOString(), lastSentAt: null },
          ]);
        }
      } catch {
        setMessage({ ok: false, text: "Kunne ikke slå på varsler på denne enheten" });
      }
    });
  }

  function disable(endpoint: string, id: string) {
    setMessage(null);
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await (await reg?.pushManager.getSubscription())?.unsubscribe();
      const res = await unsubscribePush(endpoint);
      setMessage({ ok: res.ok, text: res.message ?? "" });
      setState({ kind: "off" });
      onChanged((list) => list.filter((d) => d.id !== id));
    });
  }

  function changeMember(endpoint: string, id: string, memberId: string | null) {
    setState({ kind: "on", endpoint, memberId, id });
    onChanged((list) => list.map((d) => (d.id === id ? { ...d, memberId } : d)));
    start(async () => {
      const res = await setPushMember(endpoint, memberId);
      if (!res.ok) setMessage({ ok: false, text: res.message ?? "Kunne ikke lagre" });
    });
  }

  function test(endpoint: string) {
    setMessage(null);
    start(async () => {
      const res = await sendTestPush(endpoint);
      setMessage({ ok: res.ok, text: res.message ?? "" });
    });
  }

  const selected = state.kind === "on" ? state.memberId : choice;
  const pick = (id: string | null) => (state.kind === "on" ? changeMember(state.endpoint, state.id, id) : setChoice(id));

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card-soft p-3">
      <h3 className="font-bold">Denne enheten</h3>

      {state.kind === "loading" && <p className="text-ink-light">Sjekker …</p>}

      {state.kind === "unsupported" && (
        <p className="text-ink-light">
          {state.ios ? (
            <>
              På iPhone og iPad virker varsler bare når appen er lagt på Hjem-skjermen: trykk <strong className="text-ink">Del</strong> →{" "}
              <strong className="text-ink">Legg til på Hjem-skjerm</strong>, åpne Familien derfra og kom tilbake hit.
            </>
          ) : (
            "Denne nettleseren støtter ikke pushvarsler."
          )}
        </p>
      )}

      {state.kind === "denied" && (
        <p className="text-ink-light">
          Varsler er blokkert for Familien på denne enheten. Tillat varsler i innstillingene for appen eller nettleseren, og last siden på nytt.
        </p>
      )}

      {(state.kind === "off" || state.kind === "on") && (
        <>
          <div>
            <span className={label}>Varsler for</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Varsler for">
              {people.map((p) => (
                <PersonChip key={p.id} person={p} on={selected === p.id} onClick={() => pick(p.id)} />
              ))}
              <button
                type="button"
                role="radio"
                aria-checked={selected === null}
                onClick={() => pick(null)}
                className={`flex min-h-12 shrink-0 items-center gap-1.5 rounded-2xl border-2 px-3 font-semibold ${
                  selected === null ? "border-primary bg-card" : "border-transparent text-ink-light"
                }`}
              >
                <Users size={20} aria-hidden /> Hele familien
              </button>
            </div>
            <p className="mt-1 text-sm text-ink-light">
              {selected === null
                ? "Felles enhet (f.eks. nettbrettet på kjøkkenet): får alle varsler som er slått på."
                : "Får varslene som gjelder denne personen."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {state.kind === "off" ? (
              <button type="button" className={buttonPrimary} disabled={pending} onClick={enable}>
                <Bell size={20} aria-hidden /> {pending ? "Slår på …" : "Slå på varsler"}
              </button>
            ) : (
              <>
                <button type="button" className={buttonSecondary} disabled={pending} onClick={() => test(state.endpoint)}>
                  <Send size={18} aria-hidden /> Send testvarsel
                </button>
                <button type="button" className={buttonGhost} disabled={pending} onClick={() => disable(state.endpoint, state.id)}>
                  <BellOff size={18} aria-hidden /> Slå av
                </button>
              </>
            )}
          </div>
        </>
      )}
      {message?.text && <p className={`font-semibold ${message.ok ? "text-ink-light" : "text-danger"}`}>{message.text}</p>}
    </div>
  );
}

function PersonChip({ person, on, onClick, small = false }: { person: CalendarMember; on: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      role={small ? "checkbox" : "radio"}
      aria-checked={on}
      onClick={onClick}
      className={`flex min-h-12 shrink-0 items-center gap-1.5 rounded-2xl border-2 px-2 font-semibold transition ${
        on ? "bg-card" : "border-transparent text-ink-light opacity-60"
      }`}
      style={on ? { borderColor: person.color } : undefined}
    >
      <Avatar name={person.name} color={person.color} icon={person.icon} url={person.avatarUrl} size={small ? 24 : 28} ring={on} />
      <span className="text-sm">{person.name}</span>
    </button>
  );
}

// --- Hva sendes ------------------------------------------------------------------------

function Rules({ initial, people }: { initial: Settings; people: CalendarMember[] }) {
  const [settings, setSettings] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const save = useCallback(async (value: Settings) => {
    const res = await savePushSettings(value);
    setError(res.ok ? null : (res.message ?? "Kunne ikke lagre"));
    return res.ok;
  }, []);
  const { state } = useAutosave(settings, save, { key: (v) => JSON.stringify(v) });

  const setType = (key: PushType, patch: Partial<Settings["types"][PushType]>) =>
    setSettings((s) => ({ ...s, types: { ...s.types, [key]: { ...s.types[key], ...patch } } }));
  const toggleMember = (key: PushType, id: string) => {
    const current = settings.types[key].members;
    setType(key, { members: current.includes(id) ? current.filter((m) => m !== id) : [...current, id] });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold">Hva sendes, og til hvem</h3>
        <span className="text-sm font-semibold text-ink-light" aria-live="polite">
          {error ?? autosaveLabel(state)}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {PUSH_TYPES.map((t) => {
          const type = settings.types[t.key];
          return (
            <li key={t.key} className="flex flex-col gap-2 rounded-2xl border-2 border-line p-3">
              <div className="flex items-start gap-3">
                <Switch on={type.enabled} label={t.label} onChange={(enabled) => setType(t.key, { enabled })} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold wrap-break-word">{t.label}</p>
                  <p className="text-sm text-ink-light wrap-break-word">{t.hint}</p>
                </div>
              </div>
              {type.enabled && (
                <>
                  <div className="flex flex-wrap gap-1.5" aria-label={`Hvem får «${t.label}»`}>
                    {people.map((p) => (
                      <PersonChip key={p.id} person={p} small on={type.members.includes(p.id)} onClick={() => toggleMember(t.key, p.id)} />
                    ))}
                  </div>
                  {t.key === "reminder" && (
                    <MinutesSelect
                      label="Hvor lenge før"
                      value={settings.reminderMinutes}
                      options={[10, 15, 30, 60, 120]}
                      onChange={(reminderMinutes) => setSettings((s) => ({ ...s, reminderMinutes }))}
                    />
                  )}
                  {t.key === "care" && (
                    <MinutesSelect
                      label="Hvor lenge før"
                      value={settings.careMinutes}
                      options={[10, 15, 30, 45, 60]}
                      onChange={(careMinutes) => setSettings((s) => ({ ...s, careMinutes }))}
                    />
                  )}
                  {t.key === "morning" && (
                    <label className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-ink-light">Klokkeslett</span>
                      <input
                        type="time"
                        className={`${input} max-w-36`}
                        value={settings.morningTime}
                        onChange={(e) => e.target.value && setSettings((s) => ({ ...s, morningTime: e.target.value.slice(0, 5) }))}
                      />
                    </label>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2 rounded-2xl border-2 border-line p-3">
        <div className="flex items-start gap-3">
          <Switch on={settings.quiet.enabled} label="Stille tid" onChange={(enabled) => setSettings((s) => ({ ...s, quiet: { ...s.quiet, enabled } }))} />
          <div className="min-w-0 flex-1">
            <p className="font-bold">Stille tid</p>
            <p className="text-sm text-ink-light">Ingen varsler i dette tidsrommet (morgenoversikten kommer likevel på valgt klokkeslett).</p>
          </div>
        </div>
        {settings.quiet.enabled && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="time"
              aria-label="Stille fra"
              className={`${input} max-w-36`}
              value={settings.quiet.from}
              onChange={(e) => e.target.value && setSettings((s) => ({ ...s, quiet: { ...s.quiet, from: e.target.value.slice(0, 5) } }))}
            />
            <span className="font-bold text-ink-light">til</span>
            <input
              type="time"
              aria-label="Stille til"
              className={`${input} max-w-36`}
              value={settings.quiet.to}
              onChange={(e) => e.target.value && setSettings((s) => ({ ...s, quiet: { ...s.quiet, to: e.target.value.slice(0, 5) } }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Switch({ on, label: text, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={text}
      onClick={() => onChange(!on)}
      className="flex min-h-12 shrink-0 items-center"
    >
      <span className={`relative h-8 w-14 rounded-full transition ${on ? "bg-primary" : "bg-line"}`}>
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-7" : "left-1"}`} />
      </span>
    </button>
  );
}

function MinutesSelect({ label: text, value, options, onChange }: { label: string; value: number; options: number[]; onChange: (v: number) => void }) {
  const list = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
  return (
    <label className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-bold text-ink-light">{text}</span>
      <select className={`${input} max-w-48`} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {list.map((m) => (
          <option key={m} value={m}>
            {m < 60 ? `${m} minutter` : m === 60 ? "1 time" : `${m / 60} timer`}
          </option>
        ))}
      </select>
    </label>
  );
}

// --- Enheter ---------------------------------------------------------------------------

function Devices({ devices, people, onRemoved }: { devices: PushDevice[]; people: CalendarMember[]; onRemoved: (id: string) => void }) {
  const [pending, start] = useTransition();
  if (!devices.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-bold">Enheter med varsler ({devices.length})</h3>
      <ul className="flex flex-col gap-1">
        {devices.map((d) => {
          const person = people.find((p) => p.id === d.memberId);
          return (
            <li key={d.id} className="flex items-center gap-3 rounded-2xl bg-card-soft px-3 py-2">
              {person ? (
                <Avatar name={person.name} color={person.color} icon={person.icon} url={person.avatarUrl} size={32} />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-line">
                  <Users size={18} aria-hidden />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-bold wrap-break-word">
                  {person?.name ?? "Hele familien"} · {d.device ?? "Enhet"}
                </p>
                <p className="text-sm text-ink-light">
                  {d.lastSentAt ? `Sist varslet ${dateTime.format(new Date(d.lastSentAt))}` : `Lagt til ${dateTime.format(new Date(d.createdAt))}`}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Fjern ${d.device ?? "enheten"}`}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await removePushDevice(d.id);
                    if (res.ok) onRemoved(d.id);
                  })
                }
                className="flex min-h-12 min-w-12 items-center justify-center rounded-2xl text-ink-light hover:bg-card"
              >
                <Trash2 size={20} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
