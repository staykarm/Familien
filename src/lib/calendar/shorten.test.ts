import { describe, expect, it } from "vitest";
import { mediumTitle, oneWordTitle, shortTitle, tinyTitle, titleVariants } from "./shorten";

describe("smart forkorting av titler", () => {
  it("medium fjerner parenteser og tillegg etter tankestrek/kolon", () => {
    expect(mediumTitle("Fotball (bortekamp)")).toBe("Fotball");
    expect(mediumTitle("Fotball – kamp mot Lyn")).toBe("Fotball");
    expect(mediumTitle("Møte: budsjett for høsten")).toBe("Møte");
    expect(mediumTitle("Middag")).toBe("Middag");
  });

  it("short fjerner småord og forkorter lange ord", () => {
    expect(shortTitle("Foreldremøte på skolen")).toBe("Foreldrem. skolen");
    expect(shortTitle("Fotballtrening med laget")).toBe("Fotb.tren. laget");
    expect(shortTitle("Kommunestyremøte")).toBe("Kommunes.");
  });

  it("beholder korte titler og stor forbokstav", () => {
    expect(shortTitle("Svømming")).toBe("Svømming");
    expect(shortTitle("Trening")).toBe("Tren.");
    expect(shortTitle("i dag")).toBe("i dag");
  });

  it("tom eller bare parentes faller tilbake til originalen", () => {
    expect(titleVariants("(Teams)")).toEqual({ full: "(Teams)", medium: "(Teams)", short: "(Teams)", tiny: "(Teams)", one: "(Teams)" });
  });

  it("tiny: de to første ordene, uten å kutte ord videre", () => {
    expect(tinyTitle("Foreldremøte på skolen i dag")).toBe("Foreldrem. skolen");
    expect(tinyTitle("Svømming")).toBe("Svømming");
  });

  it("én linje: bare første ord", () => {
    expect(oneWordTitle("Tannlegetime hos Olsen")).toBe("Tannlege");
  });

  it("forkortelser kan brytes etter punktum", () => {
    expect(titleVariants("Fotballtrening").short).toBe("Fotb.\u200btren.");
  });
});
