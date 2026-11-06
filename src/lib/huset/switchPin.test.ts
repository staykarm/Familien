import { describe, expect, it } from "vitest";
import { pinMatches } from "./switchPin";

describe("pinMatches", () => {
  it("godtar bare riktig kode", () => {
    expect(pinMatches("4821", "4821")).toBe(true);
    expect(pinMatches("4820", "4821")).toBe(false);
    expect(pinMatches("48211", "4821")).toBe(false);
    expect(pinMatches(undefined, "4821")).toBe(false);
  });

  it("godtar ingenting når koden ikke er satt opp eller er ugyldig", () => {
    expect(pinMatches("4821", undefined)).toBe(false);
    expect(pinMatches("4821", "")).toBe(false);
    expect(pinMatches("abc", "abc")).toBe(false);
  });
});
