import { describe, expect, it } from "vitest";
import { groupName, membersToRemove, pickLeader, toGroups, toSpeakers } from "./sonos";

function player(id: string, state: string, attributes: Record<string, unknown> = {}) {
  return { entity_id: `media_player.${id}`, state, attributes: { device_class: "speaker", ...attributes } };
}

describe("toSpeakers", () => {
  it("leser navn, volum, sang og cover-nøkkel", () => {
    const [stue] = toSpeakers([
      player("stue_stue", "paused", {
        friendly_name: "Stue",
        volume_level: 0.27,
        media_title: "Airportman",
        media_artist: "R.E.M.",
        entity_picture: "/api/media_player_proxy/media_player.stue_stue?token=abc&cache=562edc35",
        source_list: ["TV", "NRK Nyheter", "NRK P3"],
        group_members: ["media_player.stue_stue"],
      }),
    ]);
    expect(stue).toMatchObject({
      id: "media_player.stue_stue",
      name: "Stue",
      status: "paused",
      volume: 27,
      title: "Airportman",
      artist: "R.E.M.",
      coverKey: "562edc35",
      sources: ["NRK Nyheter", "NRK P3"],
      groupMembers: ["media_player.stue_stue"],
    });
  });

  it("tåler høyttalere som ikke svarer, og hopper over TV-er og andre ting", () => {
    const speakers = toSpeakers([
      player("soverom", "unavailable", { friendly_name: "Soverom" }),
      { entity_id: "light.stue", state: "on", attributes: {} },
      player("tv", "on", { device_class: "tv" }),
    ]);
    expect(speakers).toHaveLength(1);
    expect(speakers[0]).toMatchObject({ status: "unavailable", volume: null, coverKey: null, groupMembers: ["media_player.soverom"] });
  });

  it("sorterer på norsk", () => {
    const names = toSpeakers([player("a", "idle", { friendly_name: "Åsen" }), player("b", "idle", { friendly_name: "Bad" })]).map((s) => s.name);
    expect(names).toEqual(["Bad", "Åsen"]);
  });
});

describe("toGroups", () => {
  const states = [
    player("kjokken", "playing", { friendly_name: "Kjøkken", group_members: ["media_player.stue", "media_player.kjokken"] }),
    player("stue", "playing", { friendly_name: "Stue", group_members: ["media_player.stue", "media_player.kjokken"] }),
    player("bad", "idle", { friendly_name: "Bad", group_members: ["media_player.bad"] }),
    player("terrassen", "unavailable", { friendly_name: "Terrassen" }),
  ];

  it("samler en gruppe under lederen, med det som spiller først og de som ikke svarer sist", () => {
    const groups = toGroups(toSpeakers(states));
    expect(groups.map(groupName)).toEqual(["Stue + Kjøkken", "Bad", "Terrassen"]);
    expect(groups[0].leader.id).toBe("media_player.stue");
  });

  it("viser en høyttaler alene hvis lederen ikke har den med", () => {
    const groups = toGroups(
      toSpeakers([
        player("stue", "playing", { friendly_name: "Stue", group_members: ["media_player.stue"] }),
        player("kjokken", "playing", { friendly_name: "Kjøkken", group_members: ["media_player.stue", "media_player.kjokken"] }),
      ])
    );
    expect(groups.map(groupName)).toEqual(["Kjøkken", "Stue"]);
  });

  it("legger et rom på pause midt i en sang foran rom som ikke spiller noe", () => {
    const groups = toGroups(
      toSpeakers([
        player("bad", "idle", { friendly_name: "Bad" }),
        player("stue", "paused", { friendly_name: "Stue", media_title: "Airportman" }),
      ])
    );
    expect(groups.map(groupName)).toEqual(["Stue", "Bad"]);
  });

  it("finner hvem som skal kobles fra", () => {
    const [group] = toGroups(toSpeakers(states));
    expect(membersToRemove(group, ["media_player.stue"])).toEqual(["media_player.kjokken"]);
    expect(membersToRemove(group, ["media_player.stue", "media_player.kjokken"])).toEqual([]);
  });
});

describe("pickLeader", () => {
  const speakers = toSpeakers([
    player("bad", "idle", { friendly_name: "Bad" }),
    player("stue", "paused", { friendly_name: "Stue", media_title: "Airportman" }),
    player("kjokken", "playing", { friendly_name: "Kjøkken" }),
    player("terrassen", "unavailable", { friendly_name: "Terrassen" }),
  ]);

  it("velger rommet som spiller, så det som står på pause, så det første", () => {
    expect(pickLeader(speakers, ["media_player.bad", "media_player.stue", "media_player.kjokken"])).toBe("media_player.kjokken");
    expect(pickLeader(speakers, ["media_player.bad", "media_player.stue"])).toBe("media_player.stue");
    expect(pickLeader(speakers, ["media_player.terrassen", "media_player.bad"])).toBe("media_player.bad");
    expect(pickLeader(speakers, ["media_player.terrassen"])).toBeNull();
  });
});
