import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { instruction } from "./extract";
import { SPOKEN_PREFIX } from "./types";

describe("instruction", () => {
  it("vanlige filer får filnavnet", () => {
    expect(instruction("ukeplan.pdf")).toBe("Filnavn: ukeplan.pdf. Finn aktiviteter, oppgaver og handlevarer i dokumentet over.");
  });

  it("tekst sagt inn med tale tolkes som en muntlig beskjed", () => {
    const text = instruction(`${SPOKEN_PREFIX} 16.10.2026 08.15.txt`);
    expect(text).toContain("tale til tekst");
    expect(text).toContain("dagens dato");
  });
});
