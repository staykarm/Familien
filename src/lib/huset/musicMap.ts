// Musikk på kartet: hvilke rom som spiller sammen (samme farge), hva som spilles, og hvordan valgte rom kobles
// sammen. Rene funksjoner uten nettverk.

import type { Speaker, SpeakerGroup } from "./sonos";

/** Fargene på gruppene (samme rekkefølge hver gang, så fargen ikke hopper). */
export const GROUP_COLORS = ["#2f80ed", "#e2557b", "#27a376", "#9b51e0", "#e8891f", "#0f9fb3", "#c0392b", "#6d8a12"];

export interface RoomMusic {
  /** Lederen i gruppen rommet spiller i (styrer avspillingen). */
  leader: Speaker;
  /** Alle høyttalerne i gruppen. */
  speakers: Speaker[];
  /** Fargen når rommet spiller eller er koblet med andre, ellers null. */
  color: string | null;
  playing: boolean;
  /** Rommet har lederen (der navnet på det som spilles står). */
  isLeaderRoom: boolean;
}

interface RoomLike {
  id: string;
  speakers: string[];
}

/** Gruppene som vises med farge: de som spiller, og de der flere rom er koblet sammen. */
export function coloredGroups(groups: SpeakerGroup[]): SpeakerGroup[] {
  return groups.filter((g) => g.leader.status !== "unavailable" && (g.leader.status === "playing" || g.speakers.length > 1));
}

/** Musikken i hvert rom (rom uten høyttaler er ikke med). */
export function roomMusic(rooms: RoomLike[], groups: SpeakerGroup[]): Map<string, RoomMusic> {
  const colored = coloredGroups(groups).sort((a, b) => a.leader.id.localeCompare(b.leader.id));
  const out = new Map<string, RoomMusic>();
  for (const r of rooms) {
    const group = groups.find((g) => g.speakers.some((s) => r.speakers.includes(s.id)));
    if (!group) continue;
    const i = colored.indexOf(group);
    out.set(r.id, {
      leader: group.leader,
      speakers: group.speakers,
      color: i < 0 ? null : GROUP_COLORS[i % GROUP_COLORS.length],
      playing: group.leader.status === "playing",
      isLeaderRoom: r.speakers.includes(group.leader.id),
    });
  }
  return out;
}

/** «Artist – tittel», eller kilden (radio/favoritt) når det ikke finnes noen tittel. */
export function nowPlayingText(s: Speaker): string | null {
  if (s.title) return s.artist ? `${s.artist} – ${s.title}` : s.title;
  return s.source ?? s.playlist ?? null;
}

/**
 * Valgte høyttalere skal spille sammen. Lederen blir en som allerede spiller (så musikken fortsetter), ellers den
 * første. `changes` er flyttingene som vises med en gang mens Sonos kobler om.
 */
export function planGroup(groups: SpeakerGroup[], selected: string[]): { leader: string; members: string[]; changes: { speaker: string; to: string | null }[] } | null {
  if (selected.length < 2) return null;
  const groupOf = (id: string) => groups.find((g) => g.speakers.some((s) => s.id === id));
  const playingLeader = groups.find((g) => g.leader.status === "playing" && selected.includes(g.leader.id))?.leader.id;
  const playingMember = selected.find((id) => groupOf(id)?.leader.status === "playing");
  const leader = playingLeader ?? playingMember ?? selected[0];
  const members = selected.filter((id) => id !== leader);
  const changes: { speaker: string; to: string | null }[] = [];
  // Lederen må først ut av en annen gruppe den er med i.
  const own = groupOf(leader);
  if (own && own.leader.id !== leader) changes.push({ speaker: leader, to: null });
  for (const id of members) if (groupOf(id)?.leader.id !== leader) changes.push({ speaker: id, to: leader });
  // Rom som var med lederen, men ikke er valgt, tas ut.
  if (own && own.leader.id === leader) for (const s of own.speakers) if (s.id !== leader && !selected.includes(s.id)) changes.push({ speaker: s.id, to: null });
  return { leader, members, changes };
}
