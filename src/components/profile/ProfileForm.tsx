"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Camera, Plus, Trash2 } from "lucide-react";
import { removeAvatar, updateProfile, uploadAvatar, type ActionResult } from "@/actions/profiles";
import { Avatar } from "@/components/ui/Avatar";
import { buttonGhost, buttonPrimary, buttonSecondary, card, input, label } from "@/components/ui/styles";
import { resizeImage } from "@/lib/imageResize";

const COLORS = ["#e5739a", "#4f97d9", "#f0a030", "#4fb071", "#9a7fd8", "#e26d5a", "#3bb3c3", "#a3794f"];
const ICONS = ["🌸", "⛵", "🦖", "⚽", "🏠", "🦄", "🚀", "🐶", "🐱", "🦊", "🐼", "🎸", "🎨", "📚", "🏊", "⛷️", "🚲", "🌟"];
const SUGGESTED_DETAILS = ["Skole", "Klasse", "Aktiviteter", "Klesstørrelse", "Skostørrelse", "Allergier", "Lege", "Annet"];

interface Detail {
  label: string;
  value: string;
}

interface Props {
  member: { id: string; name: string; color: string; icon: string; isShared: boolean; details: Detail[] };
  avatarUrl: string | null;
}

export function ProfileForm({ member, avatarUrl }: Props) {
  const [name, setName] = useState(member.name);
  const [color, setColor] = useState(member.color);
  const [icon, setIcon] = useState(member.icon);
  const [details, setDetails] = useState<Detail[]>(member.details);
  const [state, formAction, saving] = useActionState<ActionResult | null, FormData>(updateProfile, null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarMsg, setAvatarMsg] = useState<ActionResult | null>(null);
  const [uploading, startUpload] = useTransition();

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    startUpload(async () => {
      try {
        const resized = await resizeImage(file);
        const fd = new FormData();
        fd.set("avatar", resized);
        setAvatarMsg(await uploadAvatar(member.id, fd));
      } catch {
        setAvatarMsg({ ok: false, message: "Kunne ikke lese bildet" });
      }
    });
  }

  function onRemoveAvatar() {
    startUpload(async () => setAvatarMsg(await removeAvatar(member.id)));
  }

  const updateDetail = (i: number, patch: Partial<Detail>) =>
    setDetails((list) => list.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const unusedSuggestions = SUGGESTED_DETAILS.filter((s) => !details.some((d) => d.label === s));

  return (
    <div className="flex flex-col gap-4">
      <section className={`${card} flex flex-col items-center gap-4 sm:flex-row`}>
        <Avatar name={name} color={color} icon={icon} url={avatarUrl} size={120} />
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <h1 className="font-display text-xl font-bold sm:text-2xl lg:text-3xl">{name || member.name}</h1>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
            <button type="button" className={buttonSecondary} disabled={uploading} onClick={() => fileRef.current?.click()}>
              <Camera size={20} aria-hidden />
              {uploading ? "Laster opp …" : avatarUrl ? "Bytt bilde" : "Legg til bilde"}
            </button>
            {avatarUrl && (
              <button type="button" className={buttonGhost} disabled={uploading} onClick={onRemoveAvatar}>
                Fjern bilde
              </button>
            )}
          </div>
          {avatarMsg?.message && (
            <p className={`font-semibold ${avatarMsg.ok ? "text-ink-light" : "text-danger"}`}>{avatarMsg.message}</p>
          )}
        </div>
      </section>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={member.id} />
        <input type="hidden" name="color" value={color} />
        <input type="hidden" name="icon" value={icon} />
        <input type="hidden" name="details" value={JSON.stringify(details)} />

        <section className={`${card} flex flex-col gap-4`}>
          <div>
            <label htmlFor="name" className={label}>
              Navn
            </label>
            <input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} className={input} required />
          </div>

          <fieldset>
            <legend className={label}>Farge</legend>
            <div className="flex flex-wrap items-center gap-3">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Velg farge ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className="h-12 w-12 rounded-full transition active:scale-90"
                  style={{ background: c, boxShadow: color === c ? `0 0 0 4px #fff, 0 0 0 7px ${c}` : undefined }}
                />
              ))}
              <input
                type="color"
                aria-label="Egen farge"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-12 w-12 cursor-pointer rounded-full border-2 border-line bg-card"
              />
            </div>
          </fieldset>

          <fieldset>
            <legend className={label}>Ikon</legend>
            <div className="flex flex-wrap gap-2">
              {ICONS.map((i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={icon === i}
                  onClick={() => setIcon(i)}
                  className={`h-12 w-12 rounded-2xl text-2xl transition active:scale-90 ${
                    icon === i ? "bg-primary-soft ring-2 ring-primary" : "bg-card-soft"
                  }`}
                >
                  {i}
                </button>
              ))}
              <input
                aria-label="Eget ikon (emoji)"
                value={icon}
                maxLength={16}
                onChange={(e) => setIcon(e.target.value)}
                className={`${input} w-20 text-center text-2xl`}
              />
            </div>
          </fieldset>
        </section>

        <section className={`${card} flex flex-col gap-4`}>
          <h2 className="font-display text-lg font-bold">{member.isShared ? "Notater" : `Om ${name || member.name}`}</h2>
          {details.length === 0 && <p className="text-ink-light">Ingen detaljer ennå.</p>}
          {details.map((d, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-2xl bg-card-soft p-3 sm:flex-row sm:items-start">
              <input
                aria-label="Hva"
                value={d.label}
                onChange={(e) => updateDetail(i, { label: e.target.value })}
                placeholder="F.eks. Skostørrelse"
                className={`${input} font-bold sm:w-48`}
              />
              <textarea
                aria-label={d.label || "Verdi"}
                value={d.value}
                onChange={(e) => updateDetail(i, { value: e.target.value })}
                rows={1}
                className={`${input} min-h-12 flex-1 py-3`}
              />
              <button
                type="button"
                aria-label={`Fjern ${d.label}`}
                onClick={() => setDetails((list) => list.filter((_, j) => j !== i))}
                className={`${buttonGhost} self-end sm:self-auto`}
              >
                <Trash2 size={20} aria-hidden />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {unusedSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setDetails((list) => [...list, { label: s, value: "" }])}
                className="min-h-10 rounded-full bg-sky px-4 text-sm font-bold text-ink"
              >
                + {s}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDetails((list) => [...list, { label: "", value: "" }])}
              className="inline-flex min-h-10 items-center gap-1 rounded-full bg-sun px-4 text-sm font-bold text-ink"
            >
              <Plus size={16} aria-hidden /> Eget felt
            </button>
          </div>
        </section>

        <div className="flex items-center gap-4">
          <button className={buttonPrimary} disabled={saving}>
            {saving ? "Lagrer …" : "Lagre"}
          </button>
          {state?.message && (
            <p className={`font-semibold ${state.ok ? "text-ink-light" : "text-danger"}`}>{state.message}</p>
          )}
        </div>
      </form>
    </div>
  );
}
