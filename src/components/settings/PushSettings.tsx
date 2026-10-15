"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Bell, BellOff, ChevronDown, Send, Trash2, Users } from "lucide-react";
import {
  getPushDevice,
  removePushDevice,
  sendTestPush,
  subscribePush,
  unsubscribePush,
  updatePushDevice,
  type PushDevice,
} from "@/actions/push";
import { Avatar } from "@/components/ui/Avatar";
import { buttonGhost, buttonPrimary, buttonSecondary, input, label } from "@/components/ui/styles";
import { autosaveLabel, useAutosave } from "@/components/useAutosave";
import type { CalendarMember } from "@/lib/calendar/types";
import { deviceLabel } from "@/lib/push/device";
import { PUSH_TYPES, type PushPrefs } from "@/lib/push/settings";

const dateTime = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", dateStyle: "medium", timeStyle: "short" });

interface Props {
  /** Null når SQL-en for pushvarsler ikke er kjørt ennå. */
  publicKey: string | null;
  members: CalendarMember[];
  devices: PushDevice[];
  activeMemberId: string | null;
}

/**
 * «Varsler» i Innstillinger. Hver enhet har egne valg: hvem den tilhører, hvilke varsler den får, tider og stille tid.
 * Denne enheten slås på/av her, og alle enhetene kan endres fra listen.
 */
export function PushSettings({ publicKey, members, devices: initialDevices, activeMemberId }: Props) {
  const people = members.filter((m) => !m.isShared);
  const [devices, setDevices] = useState(initialDevices);
  const [thisId, setThisId] = useState<string | null>(null);

  const upsert = useCallback(
    (d: PushDevice) => setDevices((list) => (list.some((x) => x.id === d.id) ? list.map((x) => (x.id === d.id ? d : x)) : [...list, d])),
    []
  );
  const remove = useCallback((id: string) => setDevices((list) => list.filter((d) => d.id !== id)), []);

  if (!publicKey) {
    return (
      <p className="text-ink-light">
        Pushvarsler er ikke klare ennå. SQL-en for varsler må kjøres i Supabase (se PR-en), og <code>TOKEN_ENCRYPTION_KEY</code> må være satt i
        Vercel.
      </p>
    );
  }

  const mine = devices.find((d) => d.id === thisId) ?? null;
  const others = devices.filter((d) => d.id !== thisId);

  return (
    <div className="flex flex-col gap-4">
      <ThisDevice
        publicKey={publicKey}
        people={people}
        activeMemberId={activeMemberId}
        onOn={(d) => {
          upsert(d);
          setThisId(d.id);
        }}
        onOff={(id) => {
          remove(id);
          setThisId(null);
        }}
      >
        {mine && <DeviceCard key={mine.id} device={mine} people={people} isThis onChange={upsert} onRemoved={remove} />}
      </ThisDevice>

      {others.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-bold">{mine ? `Andre enheter (${others.length})` : `Enheter med varsler (${others.length})`}</h3>
          <p className="text-sm text-ink-light">Trykk på en enhet for å endre hva akkurat den får.</p>
          <ul className="flex flex-col gap-2">
            {others.map((d) => (
              <li key={d.id}>
                <DeviceCard device={d} people={people} onChange={upsert} onRemoved={remove} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// --- Denne enheten ---------------------------------------------------------------------

type DeviceState =
  | { kind: "loading" }
  | { kind: "unsupported"; ios: boolean }
  | { kind: "denied" }
  | { kind: "off" }
  | { kind: "on"; endpoint: string; id: string };

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
  onOn,
  onOff,
  children,
}: {
  publicKey: string;
  people: CalendarMember[];
  activeMemberId: string | null;
  onOn: (device: PushDevice) => void;
  onOff: (id: string) => void;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<DeviceState>({ kind: "loading" });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  // Hvem enheten skal få varsler for når de slås på: den som bruker appen nå.
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
        if (sub && saved) {
          setState({ kind: "on", endpoint: sub.endpoint, id: saved.id });
          onOn(saved);
        } else setState({ kind: "off" });
      } catch {
        if (!cancelled) setState({ kind: "off" });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Kjøres bare én gang ved oppstart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        if (res.ok && res.device) {
          setState({ kind: "on", endpoint: json.endpoint, id: res.device.id });
          onOn(res.device);
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
      onOff(id);
    });
  }

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

      {state.kind === "off" && (
        <>
          <MemberPicker people={people} value={choice} onChange={setChoice} />
          <button type="button" className={`${buttonPrimary} self-start`} disabled={pending} onClick={enable}>
            <Bell size={20} aria-hidden /> {pending ? "Slår på …" : "Slå på varsler"}
          </button>
          <p className="text-sm text-ink-light">Etterpå velger du hvilke varsler akkurat denne enheten skal få.</p>
        </>
      )}

      {state.kind === "on" && (
        <>
          {children}
          <button type="button" className={`${buttonGhost} self-start`} disabled={pending} onClick={() => disable(state.endpoint, state.id)}>
            <BellOff size={18} aria-hidden /> Slå av varsler på denne enheten
          </button>
        </>
      )}

      {message?.text && <p className={`font-semibold ${message.ok ? "text-ink-light" : "text-danger"}`}>{message.text}</p>}
    </div>
  );
}

// --- En enhet ---------------------------------------------------------------------------

function DeviceCard({
  device,
  people,
  isThis = false,
  onChange,
  onRemoved,
}: {
  device: PushDevice;
  people: CalendarMember[];
  isThis?: boolean;
  onChange: (d: PushDevice) => void;
  onRemoved: (id: string) => void;
}) {
  const [open, setOpen] = useState(isThis);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const person = people.find((p) => p.id === device.memberId);
  const onCount = PUSH_TYPES.filter((t) => device.prefs.types[t.key]).length;

  return (
    <div className={`flex flex-col gap-3 rounded-2xl ${isThis ? "" : "border-2 border-line p-3"}`}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-12 min-w-0 items-center gap-3 text-left">
        {person ? (
          <Avatar name={person.name} color={person.color} icon={person.icon} url={person.avatarUrl} size={36} />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-line">
            <Users size={20} aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-bold wrap-break-word">
            {person?.name ?? "Hele familien"} · {device.device ?? "Enhet"}
          </span>
          <span className="block text-sm text-ink-light">
            {onCount} av {PUSH_TYPES.length} varsler på ·{" "}
            {device.lastSentAt ? `sist varslet ${dateTime.format(new Date(device.lastSentAt))}` : `lagt til ${dateTime.format(new Date(device.createdAt))}`}
          </span>
        </span>
        <ChevronDown size={20} aria-hidden className={`shrink-0 text-ink-light transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <DeviceEditor device={device} people={people} onChange={onChange} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonSecondary}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await sendTestPush(device.id);
                  setMessage({ ok: res.ok, text: res.message ?? "" });
                })
              }
            >
              <Send size={18} aria-hidden /> Send testvarsel
            </button>
            {!isThis && (
              <button
                type="button"
                className={buttonGhost}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await removePushDevice(device.id);
                    if (res.ok) onRemoved(device.id);
                    else setMessage({ ok: false, text: res.message ?? "" });
                  })
                }
              >
                <Trash2 size={18} aria-hidden /> Fjern enheten
              </button>
            )}
          </div>
          {message?.text && <p className={`font-semibold ${message.ok ? "text-ink-light" : "text-danger"}`}>{message.text}</p>}
        </>
      )}
    </div>
  );
}

/** Valgene for én enhet: hvem den tilhører, hvilke varsler, tider og stille tid. Lagres automatisk. */
function DeviceEditor({ device, people, onChange }: { device: PushDevice; people: CalendarMember[]; onChange: (d: PushDevice) => void }) {
  const [value, setValue] = useState({ memberId: device.memberId, prefs: device.prefs });
  const [error, setError] = useState<string | null>(null);
  const save = useCallback(
    async (v: { memberId: string | null; prefs: PushPrefs }) => {
      const res = await updatePushDevice({ id: device.id, ...v });
      setError(res.ok ? null : (res.message ?? "Kunne ikke lagre"));
      if (res.ok) onChange({ ...device, ...v });
      return res.ok;
    },
    [device, onChange]
  );
  const { state } = useAutosave(value, save, { key: (v) => JSON.stringify(v) });
  const prefs = value.prefs;
  const setPrefs = (patch: Partial<PushPrefs>) => setValue((v) => ({ ...v, prefs: { ...v.prefs, ...patch } }));

  return (
    <div className="flex flex-col gap-3">
      <MemberPicker people={people} value={value.memberId} onChange={(memberId) => setValue((v) => ({ ...v, memberId }))} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-bold">Varsler på denne enheten</span>
        <span className="text-sm font-semibold text-ink-light" aria-live="polite">
          {error ?? autosaveLabel(state)}
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {PUSH_TYPES.map((t) => {
          const on = prefs.types[t.key];
          return (
            <li key={t.key} className="flex flex-col gap-2 rounded-2xl bg-card p-2 ring-1 ring-line sm:p-3">
              <div className="flex items-start gap-3">
                <Switch on={on} label={t.label} onChange={(next) => setPrefs({ types: { ...prefs.types, [t.key]: next } })} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold wrap-break-word">{t.label}</p>
                  <p className="text-sm text-ink-light wrap-break-word">{t.hint}</p>
                </div>
              </div>
              {on && t.key === "reminder" && (
                <MinutesSelect
                  label="Hvor lenge før"
                  value={prefs.reminderMinutes}
                  options={[10, 15, 30, 60, 120]}
                  onChange={(reminderMinutes) => setPrefs({ reminderMinutes })}
                />
              )}
              {on && t.key === "care" && (
                <MinutesSelect label="Hvor lenge før" value={prefs.careMinutes} options={[10, 15, 30, 45, 60]} onChange={(careMinutes) => setPrefs({ careMinutes })} />
              )}
              {on && t.key === "morning" && (
                <label className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-ink-light">Klokkeslett</span>
                  <input
                    type="time"
                    className={`${input} max-w-36`}
                    value={prefs.morningTime}
                    onChange={(e) => e.target.value && setPrefs({ morningTime: e.target.value.slice(0, 5) })}
                  />
                </label>
              )}
            </li>
          );
        })}
        <li className="flex flex-col gap-2 rounded-2xl bg-card p-2 ring-1 ring-line sm:p-3">
          <div className="flex items-start gap-3">
            <Switch on={prefs.quiet.enabled} label="Stille tid" onChange={(enabled) => setPrefs({ quiet: { ...prefs.quiet, enabled } })} />
            <div className="min-w-0 flex-1">
              <p className="font-bold">Stille tid</p>
              <p className="text-sm text-ink-light">Ingen varsler i dette tidsrommet (morgenoversikten kommer likevel på valgt klokkeslett).</p>
            </div>
          </div>
          {prefs.quiet.enabled && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="time"
                aria-label="Stille fra"
                className={`${input} max-w-36`}
                value={prefs.quiet.from}
                onChange={(e) => e.target.value && setPrefs({ quiet: { ...prefs.quiet, from: e.target.value.slice(0, 5) } })}
              />
              <span className="font-bold text-ink-light">til</span>
              <input
                type="time"
                aria-label="Stille til"
                className={`${input} max-w-36`}
                value={prefs.quiet.to}
                onChange={(e) => e.target.value && setPrefs({ quiet: { ...prefs.quiet, to: e.target.value.slice(0, 5) } })}
              />
            </div>
          )}
        </li>
      </ul>
    </div>
  );
}

// --- Små byggeklosser -------------------------------------------------------------------

function MemberPicker({ people, value, onChange }: { people: CalendarMember[]; value: string | null; onChange: (id: string | null) => void }) {
  return (
    <div>
      <span className={label}>Varsler for</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Varsler for">
        {people.map((p) => {
          const on = value === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(p.id)}
              className={`flex min-h-12 shrink-0 items-center gap-1.5 rounded-2xl border-2 px-2 font-semibold transition ${
                on ? "bg-card" : "border-transparent text-ink-light opacity-60"
              }`}
              style={on ? { borderColor: p.color } : undefined}
            >
              <Avatar name={p.name} color={p.color} icon={p.icon} url={p.avatarUrl} size={28} ring={on} />
              <span className="text-sm">{p.name}</span>
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          onClick={() => onChange(null)}
          className={`flex min-h-12 shrink-0 items-center gap-1.5 rounded-2xl border-2 px-3 font-semibold ${
            value === null ? "border-primary bg-card" : "border-transparent text-ink-light"
          }`}
        >
          <Users size={20} aria-hidden /> Hele familien
        </button>
      </div>
      <p className="mt-1 text-sm text-ink-light">
        {value === null
          ? "Felles enhet (f.eks. nettbrettet på kjøkkenet): får det som er slått på, for alle i familien."
          : "Får bare det som gjelder denne personen."}
      </p>
    </div>
  );
}

function Switch({ on, label: text, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={text} onClick={() => onChange(!on)} className="flex min-h-12 shrink-0 items-center">
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
