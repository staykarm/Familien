import { describe, expect, it } from "vitest";
import { namesText, whenText } from "./text";

describe("whenText", () => {
  const now = new Date("2026-10-15T08:00:00+02:00");
  it("i dag, i morgen og senere", () => {
    expect(whenText("2026-10-15T15:00:00Z", false, now)).toBe("i dag kl. 17:00");
    expect(whenText("2026-10-16T06:30:00Z", false, now)).toBe("i morgen kl. 08:30");
    expect(whenText("2026-10-20T15:00:00Z", false, now)).toMatch(/^tir\.? 20\. okt\.? kl\. 17:00$/);
    expect(whenText("2026-10-15T22:00:00Z", true, now)).toBe("i morgen");
  });
});

describe("namesText", () => {
  it("slår sammen navn", () => {
    expect(namesText([])).toBe("");
    expect(namesText(["Olav"])).toBe("Olav");
    expect(namesText(["Olav", "Edvard"])).toBe("Olav og Edvard");
    expect(namesText(["Ingvild", "Olav", "Edvard"])).toBe("Ingvild, Olav og Edvard");
  });
});
