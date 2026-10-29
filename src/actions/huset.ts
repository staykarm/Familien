"use server";

import { callService, getStates, haConfigured, HaError } from "@/lib/huset/ha";
import { membersToRemove, toGroups, toSpeakers, type Speaker, type SpeakerGroup } from "@/lib/huset/sonos";
import { requireFamily } from "@/lib/session";
import { speakerCommandSchema, type SpeakerCommand } from "@/lib/validation/huset";

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

function failure(e: unknown): string {
  return e instanceof HaError ? e.message : "Noe gikk galt med Home Assistant";
}

async function loadSpeakers(): Promise<Speaker[]> {
  return toSpeakers(await getStates());
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

/** Spill/pause, neste, volum, favoritt eller hvem som spiller sammen. */
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
      case "group": {
        const known = new Set(speakers.filter((s) => s.status !== "unavailable").map((s) => s.id));
        const wanted = [...new Set(cmd.members)].filter((id) => id !== entity_id);
        if (wanted.some((id) => !known.has(id))) return { ok: false, message: "Et av rommene svarer ikke" };
        const group = toGroups(speakers).find((g) => g.leader.id === entity_id);
        const remove = group ? membersToRemove(group, wanted) : [];
        if (remove.length) await callService("media_player", "unjoin", { entity_id: remove });
        if (wanted.length) await callService("media_player", "join", { entity_id, group_members: wanted });
        else if (speaker.groupMembers.length > 1) await callService("media_player", "unjoin", { entity_id });
        break;
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: failure(e) };
  }
}
