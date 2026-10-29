"use client";

import { useEffect, useState } from "react";
import { ListPlus, Play, Search } from "lucide-react";
import { disconnectSpotify, loadMyMusic, searchMusic, type HouseSetup } from "@/actions/huset";
import { Sheet } from "@/components/ui/Sheet";
import { buttonGhost, buttonPrimary, buttonSecondary, input } from "@/components/ui/styles";
import type { MusicItem, SearchResult } from "@/lib/huset/music";
import { Artwork } from "./parts";

type Tab = "search" | "playlists" | "liked";
const TABS: { id: Tab; label: string }[] = [
  { id: "search", label: "Søk" },
  { id: "playlists", label: "Spillelister" },
  { id: "liked", label: "Likte sanger" },
];
const PERSON_KEY = "familien.huset.spotify";
const SEARCH_DELAY_MS = 400;

interface Props {
  /** «Kjøkken» eller «Stue + Kjøkken»: hvor musikken skal spilles. */
  target: string;
  spotify: HouseSetup["spotify"];
  onClose: () => void;
  /** Spill nå, eller legg i køen (bare sanger). Uten `onPlay` velger man bare (`onPick`). */
  onPlay?: (item: MusicItem, queue: boolean) => void;
  onPick?: (item: MusicItem) => void;
  onAccountsChanged: () => void;
}

function Section({ title, items, ...p }: { title?: string; items: MusicItem[] } & Pick<Props, "onPlay" | "onPick">) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-1">
      {title && <h3 className="text-sm font-bold text-ink-light">{title}</h3>}
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={`${item.kind}-${item.id}`} className="flex items-center gap-3 py-1.5">
            <Artwork src={item.image} />
            <span className="min-w-0 flex-1">
              <span className="block font-bold wrap-break-word">{item.name}</span>
              {item.subtitle && <span className="block text-sm text-ink-light wrap-break-word">{item.subtitle}</span>}
            </span>
            {p.onPlay ? (
              <>
                {item.kind === "track" && (
                  <button type="button" className={`${buttonSecondary} w-12 shrink-0 px-0`} onClick={() => p.onPlay?.(item, true)} aria-label={`Legg ${item.name} i køen`}>
                    <ListPlus size={20} aria-hidden />
                  </button>
                )}
                <button type="button" className={`${buttonPrimary} w-12 shrink-0 px-0`} onClick={() => p.onPlay?.(item, false)} aria-label={`Spill ${item.name}`}>
                  <Play size={20} aria-hidden />
                </button>
              </>
            ) : (
              <button type="button" className={`${buttonSecondary} shrink-0`} onClick={() => p.onPick?.(item)}>
                Velg
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Velg musikk fra Spotify: søk, eller spillelistene og de likte sangene til en i familien. */
export function MusicSheet({ target, spotify, onClose, onPlay, onPick, onAccountsChanged }: Props) {
  const [tab, setTab] = useState<Tab>("search");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [mine, setMine] = useState<MusicItem[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const connected = spotify.people.filter((p) => p.account);
  const [person, setPerson] = useState<string | null>(() => connected[0]?.memberId ?? null);

  // Husk hvem man sist så spillelistene til på denne enheten.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(PERSON_KEY);
    } catch {
      // Lagring er av (privat modus).
    }
    if (saved && spotify.people.some((p) => p.memberId === saved)) {
      const frame = requestAnimationFrame(() => setPerson(saved));
      return () => cancelAnimationFrame(frame);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bare ved oppstart
  }, []);

  // Søk mens man skriver (med en liten pause).
  useEffect(() => {
    if (tab !== "search" || query.trim().length < 2) return;
    let stale = false;
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await searchMusic(query);
      if (stale) return;
      setLoading(false);
      setResult(res.result ?? null);
      setMessage(res.ok ? null : (res.message ?? "Søket virket ikke"));
    }, SEARCH_DELAY_MS);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [query, tab]);

  const account = spotify.people.find((p) => p.memberId === person) ?? null;

  useEffect(() => {
    if (tab === "search" || !account?.account) return;
    let stale = false;
    const frame = requestAnimationFrame(() => {
      setLoading(true);
      setMine(null);
    });
    void loadMyMusic(account.memberId, tab).then((res) => {
      if (stale) return;
      setLoading(false);
      setMine(res.items ?? []);
      setMessage(res.ok ? null : (res.message ?? "Kunne ikke hente fra Spotify"));
    });
    return () => {
      stale = true;
      cancelAnimationFrame(frame);
    };
  }, [tab, account?.memberId, account?.account]);

  function choosePerson(id: string) {
    setPerson(id);
    try {
      localStorage.setItem(PERSON_KEY, id);
    } catch {
      // Ikke viktig om det ikke huskes.
    }
  }

  const play = { onPlay, onPick };
  const empty = !loading && !message;

  return (
    <Sheet
      title={onPlay ? `Musikk i ${target}` : "Velg musikk"}
      onClose={onClose}
      onSubmit={() => undefined}
      footer={
        <button type="button" className={buttonSecondary} onClick={onClose}>
          Ferdig
        </button>
      }
    >
      {!spotify.configured ? (
        <p className="text-ink-light">Spotify er ikke satt opp ennå. Når SPOTIFY_CLIENT_ID og SPOTIFY_CLIENT_SECRET er lagt inn i Vercel, kan du søke her.</p>
      ) : (
        <>
          <div className="flex gap-2" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => {
                  setTab(t.id);
                  setMessage(null);
                }}
                className={`min-h-12 flex-1 rounded-2xl border-2 px-2 text-sm font-bold transition ${
                  tab === t.id ? "border-primary bg-primary-soft text-primary-dark" : "border-line bg-card"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "search" ? (
            <>
              <label className="relative block">
                <span className="sr-only">Søk etter sang, album eller spilleliste</span>
                <Search size={20} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
                <input
                  type="search"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Sang, artist, album eller spilleliste"
                  className={`${input} pl-10`}
                />
              </label>
              {result && (
                <>
                  <Section title="Sanger" items={result.tracks} {...play} />
                  <Section title="Spillelister" items={result.playlists} {...play} />
                  <Section title="Album" items={result.albums} {...play} />
                  {empty && !result.tracks.length && !result.playlists.length && !result.albums.length && (
                    <p className="text-ink-light">Fant ingenting.</p>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-2" aria-label="Hvem sin Spotify">
                {spotify.people.map((p) => (
                  <button
                    key={p.memberId}
                    type="button"
                    aria-pressed={person === p.memberId}
                    onClick={() => choosePerson(p.memberId)}
                    className="min-h-12 rounded-full border-2 px-4 text-sm font-bold transition"
                    style={{ borderColor: person === p.memberId ? p.color : "var(--color-line)", background: person === p.memberId ? `${p.color}26` : "var(--color-card)" }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              {account && !account.account && (
                <div className="flex flex-col gap-2 rounded-2xl bg-card-soft p-3">
                  <p>{account.name} har ikke koblet til Spotify ennå.</p>
                  <a href={`/api/huset/spotify/connect?medlem=${account.memberId}`} className={`${buttonPrimary} self-start`}>
                    Koble til Spotify for {account.name}
                  </a>
                </div>
              )}
              {account?.account && mine && (
                <>
                  <Section items={mine} {...play} />
                  {empty && !mine.length && <p className="text-ink-light">{tab === "liked" ? "Ingen likte sanger." : "Ingen spillelister."}</p>}
                  <button
                    type="button"
                    className={`${buttonGhost} self-start text-sm`}
                    onClick={async () => {
                      const res = await disconnectSpotify(account.memberId);
                      setMessage(res.message ?? null);
                      onAccountsChanged();
                    }}
                  >
                    Koble fra Spotify ({account.account})
                  </button>
                </>
              )}
            </>
          )}
          {loading && <p className="text-sm text-ink-light">Henter …</p>}
          {message && (
            <p className="rounded-2xl bg-sun px-4 py-2 font-semibold" role="status">
              {message}
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}
