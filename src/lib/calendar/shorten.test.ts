import { describe, expect, it } from "vitest";
import { mediumTitle, oneWordTitle, shortTitle, tinyTitle, titleVariants } from "./shorten";

describe("smart forkorting av titler", () => {
  it("medium fjerner parenteser og tillegg etter tankestrek/kolon", () => {
    expect(mediumTitle("Fotball (bortekamp)")).toBe("Fotball");
    expect(mediumTitle("Fotball – kamp mot Lyn")).toBe("Fotball");
    expect(mediumTitle("Møte: budsjett for høsten")).toBe("Møte");
    expect(mediumTitle("Middag")).toBe("Middag");
  });

  it("short forkorter bare lange ord, og fjerner aldri ord", () => {
    expect(shortTitle("Foreldremøte på skolen")).toBe("Foreldrem. på skolen");
    expect(shortTitle("Fotballtrening med laget")).toBe("Fotb.tren. med laget");
    expect(shortTitle("Kommunestyremøte")).toBe("Kommunes.");
    expect(shortTitle("Ha med dag")).toBe("Ha med dag");
  });

  it("beholder korte titler og stor forbokstav", () => {
    expect(shortTitle("Svømming")).toBe("Svømming");
    expect(shortTitle("Trening")).toBe("Trening");
    expect(shortTitle("i dag")).toBe("i dag");
  });

  it("tom eller bare parentes faller tilbake til originalen", () => {
    expect(titleVariants("(Teams)")).toEqual({ full: "(Teams)", medium: "(Teams)", short: "(Teams)", tiny: "(Teams)", one: "(Teams)" });
  });

  it("tiny og én linje fjerner heller ikke ord", () => {
    expect(tinyTitle("Foreldremøte på skolen i dag")).toBe("Foreldrem. på skolen i dag");
    expect(oneWordTitle("Tannlegetime hos Olsen")).toBe("Tannlege hos Olsen");
    expect(tinyTitle("Ha med dag")).toBe("Ha med dag");
  });

  it("forkortelser kan brytes etter punktum", () => {
    expect(titleVariants("Fotballtrening").short).toBe("Fotb.\u200btren.");
  });
});
