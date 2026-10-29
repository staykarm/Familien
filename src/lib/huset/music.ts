// Spotify-resultater gjort om til det Huset viser og spiller. Rene funksjoner uten nettverk.
// Sonos spiller Spotify direkte fra en open.spotify.com-lenke (Home Assistant: media_player.play_media).

export type MusicKind = "track" | "album" | "playlist";

export interface MusicItem {
  kind: MusicKind;
  id: string;
  /** https://open.spotify.com/<kind>/<id> – det Sonos får. */
  url: string;
  name: string;
  /** Artist(er), eller hvem som har laget spillelisten. */
  subtitle: string | null;
  image: string | null;
}

export interface SearchResult {
  tracks: MusicItem[];
  playlists: MusicItem[];
  albums: MusicItem[];
}

/** Bare slike lenker kan spilles (sjekkes i server actions). */
export const SPOTIFY_URL = /^https:\/\/open\.spotify\.com\/(track|album|playlist)\/[A-Za-z0-9]{22}$/;

export function spotifyUrl(kind: MusicKind, id: string): string {
  return `https://open.spotify.com/${kind}/${id}`;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === "object" ? (v as Json) : null);
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Minste bilde som er minst 64 px (Spotify gir flere størrelser), ellers det første. */
export function pickImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  const list = images.map(obj).filter((i): i is Json => !!i && typeof i.url === "string");
  const ok = list.filter((i) => typeof i.width !== "number" || i.width >= 64);
  const best = [...ok].sort((a, b) => ((a.width as number) ?? 0) - ((b.width as number) ?? 0))[0] ?? list[0];
  return best ? (best.url as string) : null;
}

function artists(v: unknown): string | null {
  if (!Array.isArray(v)) return null;
  const names = v.map((a) => text(obj(a)?.name)).filter((n): n is string => !!n);
  return names.length ? names.join(", ") : null;
}

/** Ett objekt fra Spotify (spor, album eller spilleliste). Null hvis det mangler noe vesentlig. */
export function toMusicItem(raw: unknown, kind: MusicKind): MusicItem | null {
  const o = obj(raw);
  const id = text(o?.id);
  const name = text(o?.name);
  if (!o || !id || !name || !/^[A-Za-z0-9]{22}$/.test(id)) return null;
  const subtitle =
    kind === "playlist" ? text(obj(o.owner)?.display_name) : artists(o.artists);
  const image = kind === "track" ? pickImage(obj(o.album)?.images) : pickImage(o.images);
  return { kind, id, url: spotifyUrl(kind, id), name, subtitle, image };
}

function items(section: unknown, kind: MusicKind, unwrap?: string): MusicItem[] {
  const list = obj(section)?.items;
  if (!Array.isArray(list)) return [];
  return list
    .map((x) => toMusicItem(unwrap ? obj(x)?.[unwrap] : x, kind))
    .filter((x): x is MusicItem => !!x);
}

/** Svaret fra /v1/search. Spotify kan gi null-elementer i lista, de hoppes over. */
export function toSearchResult(json: unknown): SearchResult {
  const o = obj(json);
  return { tracks: items(o?.tracks, "track"), playlists: items(o?.playlists, "playlist"), albums: items(o?.albums, "album") };
}

/** /v1/me/playlists */
export function toPlaylists(json: unknown): MusicItem[] {
  return items(json, "playlist");
}

/** /v1/me/tracks (likte sanger): hvert element har sporet under «track». */
export function toSavedTracks(json: unknown): MusicItem[] {
  return items(json, "track", "track");
}
