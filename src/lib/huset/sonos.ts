// Sonos-høyttalerne slik Home Assistant viser dem (media_player.*), gjort om til rom og grupper.
// Rene funksjoner uten nettverk, slik at de kan testes.

export type SpeakerStatus = "playing" | "paused" | "idle" | "off" | "unavailable";

export interface Speaker {
  id: string;
  name: string;
  status: SpeakerStatus;
  /** 0–100, null hvis ukjent. */
  volume: number | null;
  muted: boolean;
  title: string | null;
  artist: string | null;
  album: string | null;
  playlist: string | null;
  /** Endres når coveret endres (brukes i adressen så nettleseren henter nytt bilde). Null = ikke noe cover. */
  coverKey: string | null;
  /** Sonos-favorittene (radio, spillelister) som kan velges. */
  sources: string[];
  source: string | null;
  /** Høyttalerne den spiller sammen med, lederen først. Bare seg selv når den spiller alene. */
  groupMembers: string[];
}

export interface SpeakerGroup {
  /** Lederen styrer avspillingen for hele gruppen. */
  leader: Speaker;
  /** Alle i gruppen, lederen først. */
  speakers: Speaker[];
}

interface StateLike {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

const STATUSES: SpeakerStatus[] = ["playing", "paused", "idle", "off", "unavailable"];

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Sonos-navnet blir ofte «Stue Stue» i entity-id-en; vi bruker visningsnavnet. */
function speakerName(s: StateLike): string {
  return str(s.attributes.friendly_name) ?? s.entity_id.replace(/^media_player\./, "").replace(/_/g, " ");
}

function coverKey(picture: unknown): string | null {
  const p = str(picture);
  if (!p) return null;
  // Home Assistant legger en «cache»-nøkkel på adressen som endres med coveret.
  return /[?&]cache=([^&]+)/.exec(p)?.[1] ?? String(p.length);
}

/** Høyttalere (device_class speaker eller Sonos-kilde) fra alle tilstandene. */
export function toSpeakers(states: StateLike[]): Speaker[] {
  return states
    .filter((s) => s.entity_id.startsWith("media_player.") && s.attributes.device_class !== "tv")
    .map((s): Speaker => {
      const a = s.attributes;
      const status = STATUSES.includes(s.state as SpeakerStatus) ? (s.state as SpeakerStatus) : "idle";
      const volume = typeof a.volume_level === "number" ? Math.round(a.volume_level * 100) : null;
      const members = strings(a.group_members);
      return {
        id: s.entity_id,
        name: speakerName(s),
        status,
        volume,
        muted: a.is_volume_muted === true,
        title: str(a.media_title),
        artist: str(a.media_artist),
        album: str(a.media_album_name),
        playlist: str(a.media_playlist),
        coverKey: status === "unavailable" ? null : coverKey(a.entity_picture),
        sources: strings(a.source_list).filter((x) => x !== "TV" && x !== "Line-in"),
        source: str(a.source),
        groupMembers: members.length ? members : [s.entity_id],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "nb"));
}

/**
 * Samler høyttalerne i grupper. En høyttaler som spiller sammen med andre vises i lederens gruppe.
 * Rekkefølge: det som spiller eller står på pause midt i noe, så resten, og til slutt de som ikke svarer.
 */
export function toGroups(speakers: Speaker[]): SpeakerGroup[] {
  const byId = new Map(speakers.map((s) => [s.id, s]));
  const placed = new Set<string>();
  const groups: SpeakerGroup[] = [];

  for (const s of speakers) {
    if (s.status === "unavailable" || s.groupMembers[0] !== s.id) continue;
    const members = s.groupMembers
      .map((id) => byId.get(id))
      .filter((m): m is Speaker => !!m && m.status !== "unavailable" && !placed.has(m.id));
    members.forEach((m) => placed.add(m.id));
    groups.push({ leader: s, speakers: members });
  }
  // Med i en gruppe som lederen ikke kjenner til (skjer et øyeblikk under endringer): vis alene.
  for (const s of speakers) {
    if (!placed.has(s.id)) {
      placed.add(s.id);
      groups.push({ leader: s, speakers: [s] });
    }
  }
  const rank = ({ leader: l }: SpeakerGroup) =>
    l.status === "unavailable" ? 2 : l.status === "playing" || (l.status === "paused" && l.title) ? 0 : 1;
  return groups.sort((a, b) => rank(a) - rank(b) || a.leader.name.localeCompare(b.leader.name, "nb"));
}

/** «Stue + Kjøkken + Spisestue». */
export function groupName(group: SpeakerGroup): string {
  return group.speakers.map((s) => s.name).join(" + ");
}

export function isPlaying(group: SpeakerGroup): boolean {
  return group.leader.status === "playing";
}

/** Høyttalerne som skal kobles fra når gruppen endres til `wanted` (lederen er alltid med). */
export function membersToRemove(group: SpeakerGroup, wanted: string[]): string[] {
  return group.speakers.map((s) => s.id).filter((id) => id !== group.leader.id && !wanted.includes(id));
}

/**
 * Hvem som skal lede når rom kobles sammen: et rom som spiller (da fortsetter musikken),
 * så et som står på pause midt i noe, ellers det første. Bare rom som svarer, telles med.
 */
export function pickLeader(speakers: Speaker[], ids: string[]): string | null {
  const chosen = ids.map((id) => speakers.find((s) => s.id === id)).filter((s): s is Speaker => !!s && s.status !== "unavailable");
  return (
    chosen.find((s) => s.status === "playing")?.id ??
    chosen.find((s) => s.status === "paused" && s.title)?.id ??
    chosen[0]?.id ??
    null
  );
}

/**
 * Flytter et rom inn i gruppen til `toLeader`, eller ut for seg selv (`null`). Brukes for å vise endringen
 * med en gang, før Sonos har svart. Var rommet leder for andre, tar neste i gruppen over (som i Sonos).
 */
export function moveSpeaker(groups: SpeakerGroup[], speakerId: string, toLeader: string | null): SpeakerGroup[] {
  const from = groups.findIndex((g) => g.speakers.some((s) => s.id === speakerId));
  if (from < 0 || toLeader === speakerId) return groups;
  const source = groups[from];
  const speaker = source.speakers.find((s) => s.id === speakerId)!;
  if (toLeader === null && source.speakers.length === 1) return groups;
  if (toLeader !== null && source.leader.id === toLeader) return groups;

  const rest = source.speakers.filter((s) => s.id !== speakerId);
  const next: SpeakerGroup[] = [];
  groups.forEach((g, i) => {
    if (i !== from) return next.push(g);
    if (rest.length) next.push({ leader: source.leader.id === speakerId ? rest[0] : source.leader, speakers: rest });
    // Alene: rett etter gruppen det kom fra, så lista ikke hopper.
    if (toLeader === null) next.push({ leader: speaker, speakers: [speaker] });
  });
  if (toLeader === null) return next;
  return next.map((g) => (g.leader.id === toLeader ? { leader: g.leader, speakers: [...g.speakers, speaker] } : g));
}

/** Har Sonos gjort flyttingen? (`to` = lederen rommet skal være med, `null` = alene.) */
export function isMoved(groups: SpeakerGroup[], speakerId: string, to: string | null): boolean {
  const group = groups.find((g) => g.speakers.some((s) => s.id === speakerId));
  if (!group) return true;
  return to === null ? group.speakers.length === 1 : group.speakers.some((s) => s.id === to);
}
