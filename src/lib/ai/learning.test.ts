import { describe, expect, it } from "vitest";
import { correctionLines, habitLines, learningPrompt } from "./learning";

describe("habitLines", () => {
  it("vanligste personer og kategori per tittel, mest brukt først", () => {
    const lines = habitLines([
      { title: "Fotballtrening", people: ["Edvard"], category: "Trening" },
      { title: "fotballtrening", people: ["Edvard"], category: "Trening" },
      { title: "Fotballtrening", people: ["Felles"], category: null },
      { title: "Svømming", people: ["Olav"], category: "Trening" },
      { title: "Svømming", people: ["Olav"], category: "Trening" },
      { title: "Tannlege", people: ["Ingvild"], category: null },
    ]);
    expect(lines).toEqual(["«Fotballtrening» → Edvard · Trening (3 ganger)", "«Svømming» → Olav · Trening (2 ganger)"]);
  });
});

describe("correctionLines", () => {
  it("viser bare det som ble endret, og slår sammen like linjer", () => {
    const suggested = { title: "Turdag", people: ["Felles"], category: "Annet" };
    const saved = { title: "Turdag", people: ["Edvard"], category: "Skole" };
    const lines = correctionLines([
      { kind: "event", status: "approved", suggested, saved },
      { kind: "event", status: "approved", suggested, saved },
      { kind: "event", status: "approved", suggested: saved, saved },
      { kind: "task", status: "rejected", suggested: { title: "Les ukeplanen", people: [], category: null } },
    ]);
    expect(lines).toEqual([
      "Rettet aktivitet «Turdag»: Felles → Edvard; kategori Annet → Skole",
      "Avvist oppgave: «Les ukeplanen»",
    ]);
  });
});

describe("learningPrompt", () => {
  it("er tom uten noe å lære av", () => {
    expect(learningPrompt([], [])).toBe("");
    expect(learningPrompt(["«A» → Olav (2 ganger)"], [])).toContain("- «A» → Olav (2 ganger)");
  });
});
