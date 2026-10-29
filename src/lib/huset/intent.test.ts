import { describe, expect, it } from "vitest";
import { classifyVoiceText } from "./intent";

describe("classifyVoiceText", () => {
  it("kjenner igjen husbeskjeder", () => {
    for (const t of [
      "Skru av alt lyset i stua",
      "dim alle lys i første etasje",
      "spill NRK P3 på kjøkkenet",
      "Spill Losing My Religion",
      "litt varmere på badet",
      "persiennene ned i stua",
      "start støvsugeren",
      "skru opp volumet",
    ])
      expect(classifyVoiceText(t), t).toBe("house");
  });

  it("kjenner igjen beskjeder til kalender, oppgaver og handleliste", () => {
    for (const t of ["Olav har tannlege tirsdag klokka to", "vi må kjøpe melk og brød", "husk å betale regningen", "fotball i morgen kl 18"])
      expect(classifyVoiceText(t), t).toBe("family");
  });

  it("er usikker når beskjeden har litt av begge, eller ingen kjente ord", () => {
    expect(classifyVoiceText("husk å skru av lyset i kveld")).toBe("unsure");
    expect(classifyVoiceText("gjør det koselig i stua")).toBe("unsure");
  });
});
