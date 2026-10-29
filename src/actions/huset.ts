"use server";

import { z } from "zod";
import { callService, getStates, haConfigured, HaError } from "@/lib/huset/ha";
import type { MusicItem, SearchResult } from "@/lib/huset/music";
import { membersToRemove, pickLeader, toGroups, toSpeakers, type Speaker, type SpeakerGroup } from "@/lib/huset/sonos";
import {
  connectedAccounts,
  disconnectAccount,
  searchSpotify,
  spotifyConfigured,
  SpotifyError,
  userPlaylists,
  userSavedTracks,
} from "@/lib/huset/spotify";
import { requireFamily } from "@/lib/session";
import { getDb } from "@/lib/supabase/db";
import { houseGroupSchema, musicQuerySchema, speakerCommandSchema, type HouseGroupInput, type SpeakerCommand } from "@/lib/validation/huset";

export interface HouseData {
  ok: boolean;
  /** Forklaring når Home Assistant ikke svarer eller ikke er satt opp. */
  message?: string;
  groups: SpeakerGroup[];
  updatedAt: string;
}

export interface HouseResult {
  ok: boolean;
  message?: string;
}

/** En fast gruppe av rom («1. etasje», «Middag» …). */
export interface HouseGroup {
  id: string;
  name: string;
  speakerIds: string[];
  spotifyUrl: string | null;
  spotifyName: string | null;
  volume: number | null;
}

export interface SpotifyPerson {
  memberId: string;
  name: string;
  color: string;
  /** Navnet på Spotify-kontoen, null hvis ikke koblet til. */
  account: string | null;
}

/** Det som ikke endrer seg hvert par sekund: faste grupper og Spotify-kontoene. */
export interface HouseSetup {
  presets: HouseGroup[];
  spotify: { configured: boolean; people: SpotifyPerson[] };
}

function failure(e: unknown): string {
  if (e instanceof HaError || e instanceof SpotifyError) return e.message;
  return "Noe gikk galt";
}

async function loadSpeakers(): Promise<Speaker[]> {
  return toSpeakers(await getStates());
}

/** Kobler `members` til `leader` og fjerner dem som ikke skal være med lenger. */
async function setGroup(speakers: Speaker[], leader: Speaker, members: string[]): Promise<void> {
  const wanted = [...new Set(members)].filter((id) => id !== leader.id);
  const group = toGroups(speakers).find((g) => g.leader.id === leader.id);
  const remove = group ? membersToRemove(group, wanted) : [];
  if (remove.length) await callService("media_player", "unjoin", { entity_id: remove });
  if (wanted.length) await callService("media_player", "join", { entity_id: leader.id, group_members: wanted });
  // Lederen var med i en gruppe den ikke leder: ta den ut.
  else if (!remove.length && leader.groupMembers.length > 1) await callService("media_player", "unjoin", { entity_id: leader.id });
}

/** Alle Sonos-høyttalerne, samlet i grupper. Kalles på nytt hvert par sekund mens siden er åpen. */
export async function loadHouse(): Promise<HouseData> {
  await requireFamily();
  const updatedAt = new Date().toISOString();
  if (!haConfigured()) return { ok: false, message: "Home Assistant er ikke koblet til ennå (HA_URL og HA_TOKEN mangler).", groups: [], updatedAt };
  try {
    return { ok: true, groups: toGroups(await loadSpeakers()), updatedAt };
  } catch (e) {
    return { ok: false, message: failure(e), groups: [], updatedAt };
  }
}

export async function loadHouseSetup(): Promise<HouseSetup> {
  const session = await requireFamily();
  const db = await getDb();
  const configured = spotifyConfigured();
  const [{ data }, accounts] = await Promise.all([
    db.from("house_groups").select("*").order("sort_order").order("created_at"),
    configured ? connectedAccounts().catch(() => ({}) as Record<string, string>) : Promise.resolve({} as Record<string, string>),
  ]);
  return {
    presets: (data ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      speakerIds: g.speaker_ids,
      spotifyUrl: g.spotify_url,
      spotifyName: g.spotify_name,
      volume: g.volume,
    })),
    spotify: {
      configured,
      people: session.members
        .filter((m) => !m.is_shared)
        .map((m) => ({ memberId: m.id, name: m.name, color: m.color, account: accounts[m.id] ?? null })),
    },
  };
}

/** Spill/pause, neste, volum, favoritt, Spotify eller hvem som spiller sammen. */
export async function controlSpeaker(input: SpeakerCommand): Promise<HouseResult> {
  await requireFamily();
  const parsed = speakerCommandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const cmd = parsed.data;

  try {
    // Bare høyttalere Home Assistant faktisk har, kan styres.
    const speakers = await loadSpeakers();
    const speaker = speakers.find((s) => s.id === cmd.id);
    if (!speaker) return { ok: false, message: "Fant ikke høyttaleren" };
    if (speaker.status === "unavailable") return { ok: false, message: `${speaker.name} svarer ikke` };
    const entity_id = speaker.id;

    switch (cmd.action) {
      case "toggle":
        await callService("media_player", "media_play_pause", { entity_id });
        break;
      case "next":
        await callService("media_player", "media_next_track", { entity_id });
        break;
      case "previous":
        await callService("media_player", "media_previous_track", { entity_id });
        break;
      case "volume":
        await callService("media_player", "volume_set", { entity_id, volume_level: cmd.volume / 100 });
        break;
      case "source":
        if (!speaker.sources.includes(cmd.source)) return { ok: false, message: "Ukjent favoritt" };
        await callService("media_player", "select_source", { entity_id, source: cmd.source });
        break;
      case "play":
        // Sonos henter selv musikken fra Spotify-kontoen som er koblet til Sonos.
        await callService("media_player", "play_media", {
          entity_id,
          media_content_id: cmd.url,
          media_content_type: "music",
          ...(cmd.queue ? { enqueue: "add" } : {}),
        });
        return { ok: true, message: cmd.queue ? "Lagt i køen" : undefined };
      case "join": {
        const member = speakers.find((s) => s.id === cmd.member);
        if (!member || member.id === entity_id) return { ok: false, message: "Ukjent rom" };
        if (member.status === "unavailable") return { ok: false, message: `${member.name} svarer ikke` };
        await callService("media_player", "join", { entity_id, group_members: [member.id] });
        break;
      }
      case "unjoin": {
        // Sendes uten å sjekke grupperingen her: tilstanden i Home Assistant kan henge noen sekunder etter
        // (for eksempel rett etter at rommet ble koblet til), og unjoin på et rom som spiller alene gjør ingenting.
        const ids = [entity_id, ...(cmd.also ?? [])].filter((id) => speakers.some((s) => s.id === id && s.status !== "unavailable"));
        await callService("media_player", "unjoin", { entity_id: [...new Set(ids)] });
        break;
      }
      case "group": {
        const known = new Set(speakers.filter((s) => s.status !== "unavailable").map((s) => s.id));
        if (cmd.members.some((id) => !known.has(id))) return { ok: false, message: "Et av rommene svarer ikke" };
        await setGroup(speakers, speaker, cmd.members);
        break;
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: failure(e) };
  }
}

/** Starter en fast gruppe: kobler rommene, setter volum og starter musikken hvis gruppen har det. */
export async function startHouseGroup(id: string): Promise<HouseResult> {
  await requireFamily();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Ukjent gruppe" };
  const db = await getDb();
  const { data: preset } = await db.from("house_groups").select("*").eq("id", id).maybeSingle();
  if (!preset) return { ok: false, message: "Fant ikke gruppen" };
  try {
    const speakers = await loadSpeakers();
    const available = preset.speaker_ids.filter((sid) => speakers.some((s) => s.id === sid && s.status !== "unavailable"));
    const leader = speakers.find((s) => s.id === pickLeader(speakers, available));
    if (!leader) return { ok: false, message: "Ingen av rommene i gruppen svarer" };

    await setGroup(speakers, leader, available);
    if (preset.volume !== null) {
      await callService("media_player", "volume_set", { entity_id: available, volume_level: preset.volume / 100 });
    }
    if (preset.spotify_url) {
      await callService("media_player", "play_media", { entity_id: leader.id, media_content_id: preset.spotify_url, media_content_type: "music" });
    }
    const missing = preset.speaker_ids.length - available.length;
    return { ok: true, message: missing ? `${preset.name} er startet, men ${missing} rom svarer ikke` : undefined };
  } catch (e) {
    return { ok: false, message: failure(e) };
  }
}

export async function saveHouseGroup(input: HouseGroupInput): Promise<HouseResult & { id?: string }> {
  await requireFamily();
  const parsed = houseGroupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const g = parsed.data;
  const db = await getDb();
  const row = {
    name: g.name,
    speaker_ids: [...new Set(g.speakerIds)],
    spotify_url: g.spotifyUrl,
    spotify_name: g.spotifyUrl ? g.spotifyName : null,
    volume: g.volume,
  };
  if (g.id) {
    const { error } = await db.from("house_groups").update(row).eq("id", g.id);
    return error ? { ok: false, message: "Kunne ikke lagre gruppen" } : { ok: true, id: g.id };
  }
  const { count } = await db.from("house_groups").select("id", { count: "exact", head: true });
  const { data, error } = await db
    .from("house_groups")
    .insert({ ...row, sort_order: count ?? 0 })
    .select("id")
    .single();
  return error || !data ? { ok: false, message: "Kunne ikke lagre gruppen (er SQL-en for Huset kjørt?)" } : { ok: true, id: data.id };
}

/** Sletter med en gang. Det som returneres, gis til `restoreHouseGroup` for å angre. */
export async function deleteHouseGroup(id: string): Promise<HouseResult & { deleted?: HouseGroup & { sortOrder: number } }> {
  await requireFamily();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Ukjent gruppe" };
  const db = await getDb();
  const { data } = await db.from("house_groups").select("*").eq("id", id).maybeSingle();
  if (!data) return { ok: false, message: "Fant ikke gruppen" };
  const { error } = await db.from("house_groups").delete().eq("id", id);
  if (error) return { ok: false, message: "Kunne ikke slette gruppen" };
  return {
    ok: true,
    deleted: {
      id: data.id,
      name: data.name,
      speakerIds: data.speaker_ids,
      spotifyUrl: data.spotify_url,
      spotifyName: data.spotify_name,
      volume: data.volume,
      sortOrder: data.sort_order,
    },
  };
}

export async function restoreHouseGroup(group: HouseGroup & { sortOrder: number }): Promise<HouseResult> {
  await requireFamily();
  const parsed = houseGroupSchema.extend({ id: z.uuid(), sortOrder: z.number().int() }).safeParse(group);
  if (!parsed.success) return { ok: false, message: "Kunne ikke angre" };
  const g = parsed.data;
  const db = await getDb();
  const { error } = await db.from("house_groups").insert({
    id: g.id,
    name: g.name,
    speaker_ids: g.speakerIds,
    spotify_url: g.spotifyUrl,
    spotify_name: g.spotifyName,
    volume: g.volume,
    sort_order: g.sortOrder,
  });
  return error ? { ok: false, message: "Kunne ikke angre" } : { ok: true, message: `${g.name} er tilbake` };
}

// --- Spotify ------------------------------------------------------------------

export async function searchMusic(query: string): Promise<HouseResult & { result?: SearchResult }> {
  await requireFamily();
  if (!spotifyConfigured()) return { ok: false, message: "Spotify er ikke satt opp ennå (SPOTIFY_CLIENT_ID mangler)" };
  const q = musicQuerySchema.safeParse(query);
  if (!q.success) return { ok: false, message: q.error.issues[0].message };
  try {
    return { ok: true, result: await searchSpotify(q.data) };
  } catch (e) {
    return { ok: false, message: failure(e) };
  }
}

/** Spillelistene eller de likte sangene til ett medlem. */
export async function loadMyMusic(memberId: string, kind: "playlists" | "liked"): Promise<HouseResult & { items?: MusicItem[] }> {
  const session = await requireFamily();
  if (!session.members.some((m) => m.id === memberId)) return { ok: false, message: "Ukjent person" };
  try {
    return { ok: true, items: kind === "liked" ? await userSavedTracks(memberId) : await userPlaylists(memberId) };
  } catch (e) {
    return { ok: false, message: failure(e) };
  }
}

export async function disconnectSpotify(memberId: string): Promise<HouseResult> {
  const session = await requireFamily();
  if (!session.members.some((m) => m.id === memberId)) return { ok: false, message: "Ukjent person" };
  await disconnectAccount(memberId);
  return { ok: true, message: "Spotify er koblet fra" };
}
