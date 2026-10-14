import { describe, expect, it } from "vitest";
import { guessMime, safeName, storagePath } from "./names";

describe("filnavn", () => {
  it("lager trygge navn og beholder endelsen", () => {
    expect(safeName("Skjermbilde 2026-10-14 kl. 08.15.png")).toBe("Skjermbilde_2026-10-14_kl._08.15.png");
  });

  it("lagringssti har måned og unik id", () => {
    expect(storagePath("a.png", new Date("2026-10-14T08:00:00Z"))).toMatch(/^2026-10\/[0-9a-f-]{36}-a\.png$/);
  });

  it("gjetter filtype fra endelsen", () => {
    expect(guessMime("IMG_0001.JPG")).toBe("image/jpeg");
    expect(guessMime("brev.docx")).toContain("wordprocessingml");
    expect(guessMime("ukjent.heic")).toBe("");
  });
});
