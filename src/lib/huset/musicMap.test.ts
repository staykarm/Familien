import { describe, expect, it } from "vitest";
import { GROUP_COLORS, nowPlayingText, planGroup, roomMusic } from "./musicMap";
import type { Speaker, SpeakerGroup } from "./sonos";

const sp = (id: string, over: Partial<Speaker> = {}): Speaker => ({
  id: `media_player.${id}`,
  name: id,
  status: "paused",
  volume: 20,
  muted: false,
  title: null,
  artist: null,
  album: null,
  playlist: null,
  coverKey: null,
  sources: [],
  source: null,
  groupMembers: [`media_player.${id}`],
  ...over,
});
const group = (...s: Speaker[]): SpeakerGroup => ({ leader: s[0], speakers: s });

const stue = sp("stue", { status: "playing", title: "Song", artist: "Band" });
const kjokken = sp("kjokken");
const bad = sp("bad");
const taket = sp("taket");
const groups = [group(stue, kjokken), group(bad), group(taket)];
const rooms = [
  { id: "stue", speakers: ["media_player.stue"] },
  { id: "kjokken", speakers: ["media_player.kjokken"] },
  { id: "bad", speakers: ["media_player.bad"] },
  { id: "gang", speakers: [] },
];

describe("musikk på kartet", () => {
  it("gir rom som spiller sammen samme farge, og rom som står stille ingen farge", () => {
    const m = roomMusic(rooms, groups);
    expect(m.get("stue")?.color).toBe(GROUP_COLORS[0]);
    expect(m.get("kjokken")?.color).toBe(GROUP_COLORS[0]);
    expect(m.get("kjokken")?.isLeaderRoom).toBe(false);
    expect(m.get("bad")?.color).toBeNull();
    expect(m.has("gang")).toBe(false);
  });

  it("viser artist og tittel, ellers kilden", () => {
    expect(nowPlayingText(stue)).toBe("Band – Song");
    expect(nowPlayingText(sp("x", { source: "NRK P3" }))).toBe("NRK P3");
    expect(nowPlayingText(bad)).toBeNull();
  });

  it("kobler valgte rom til det som spiller, og tar ut rom som ikke er valgt", () => {
    expect(planGroup(groups, ["media_player.bad", "media_player.stue"])).toEqual({
      leader: "media_player.stue",
      members: ["media_player.bad"],
      changes: [
        { speaker: "media_player.bad", to: "media_player.stue" },
        { speaker: "media_player.kjokken", to: null },
      ],
    });
    expect(planGroup(groups, ["media_player.bad", "media_player.taket"])?.leader).toBe("media_player.bad");
    expect(planGroup(groups, ["media_player.bad"])).toBeNull();
  });

  it("tar lederen ut av en annen gruppe først", () => {
    const plan = planGroup(groups, ["media_player.kjokken", "media_player.taket"])!;
    expect(plan.leader).toBe("media_player.kjokken");
    expect(plan.changes[0]).toEqual({ speaker: "media_player.kjokken", to: null });
  });
});
