import { describe, expect, it } from "vitest";
import { pickImage, SPOTIFY_URL, toPlaylists, toSavedTracks, toSearchResult } from "./music";

const ID = "5faNaJWkP4cvGVrBoy6L59";

describe("Spotify-resultater", () => {
  it("leser spor, spillelister og album fra søket og hopper over null", () => {
    const result = toSearchResult({
      tracks: {
        items: [
          {
            id: ID,
            name: "Airportman",
            artists: [{ name: "R.E.M." }],
            album: { images: [{ url: "stor", width: 640 }, { url: "liten", width: 64 }, { url: "mini", width: 32 }] },
          },
        ],
      },
      playlists: { items: [null, { id: "37i9dQZF1DXcBWIGoYBM5M", name: "Today's Top Hits", owner: { display_name: "Spotify" }, images: [] }] },
      albums: { items: [{ id: "abc", name: "Ugyldig id" }] },
    });
    expect(result.tracks).toEqual([
      { kind: "track", id: ID, url: `https://open.spotify.com/track/${ID}`, name: "Airportman", subtitle: "R.E.M.", image: "liten" },
    ]);
    expect(result.playlists).toMatchObject([{ kind: "playlist", name: "Today's Top Hits", subtitle: "Spotify", image: null }]);
    expect(result.albums).toEqual([]);
  });

  it("tåler tomme og rare svar", () => {
    expect(toSearchResult(null)).toEqual({ tracks: [], playlists: [], albums: [] });
    expect(toPlaylists({ items: "nei" })).toEqual([]);
    expect(pickImage(undefined)).toBeNull();
    expect(pickImage([{ url: "a" }])).toBe("a");
  });

  it("pakker ut likte sanger", () => {
    const tracks = toSavedTracks({ items: [{ added_at: "x", track: { id: ID, name: "Airportman", artists: [{ name: "R.E.M." }, { name: "Gjest" }] } }] });
    expect(tracks[0]).toMatchObject({ kind: "track", subtitle: "R.E.M., Gjest" });
  });

  it("godtar bare open.spotify.com-lenker til spor, album og spillelister", () => {
    expect(SPOTIFY_URL.test(`https://open.spotify.com/track/${ID}`)).toBe(true);
    expect(SPOTIFY_URL.test(`https://open.spotify.com/artist/${ID}`)).toBe(false);
    expect(SPOTIFY_URL.test(`https://evil.example/track/${ID}`)).toBe(false);
  });
});
