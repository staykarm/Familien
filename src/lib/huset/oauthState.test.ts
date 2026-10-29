import { describe, expect, it } from "vitest";
import { createState, readState } from "./oauthState";

const SECRET = Buffer.alloc(32, 7).toString("base64");

describe("Spotify-state", () => {
  it("gir tilbake medlemmet når state er ekte", () => {
    expect(readState(SECRET, createState(SECRET, "medlem-1", 1000), 2000)).toBe("medlem-1");
  });

  it("avviser utløpt, endret eller feil signert state", () => {
    const state = createState(SECRET, "medlem-1", 1000);
    expect(readState(SECRET, state, 1000 + 11 * 60_000)).toBeNull();
    expect(readState(SECRET, state.replace(/^./, "x"), 2000)).toBeNull();
    expect(readState(Buffer.alloc(32, 8).toString("base64"), state, 2000)).toBeNull();
    expect(readState(SECRET, null)).toBeNull();
  });
});
