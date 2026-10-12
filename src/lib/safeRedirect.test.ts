import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safeRedirect";

describe("safeNextPath", () => {
  it("slipper gjennom interne stier", () => {
    expect(safeNextPath("/oppgaver")).toBe("/oppgaver");
  });
  it("avviser eksterne og tomme verdier", () => {
    for (const bad of [null, undefined, "", "https://evil.com", "//evil.com", "/\\evil.com"]) {
      expect(safeNextPath(bad)).toBe("/");
    }
  });
});
