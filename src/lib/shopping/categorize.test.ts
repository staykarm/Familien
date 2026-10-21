import { describe, expect, it } from "vitest";
import { guessCategoryName, itemKey } from "./categorize";

describe("guessCategoryName", () => {
  it.each([
    ["Lettmelk", "Meieri"],
    ["Bananer", "Frukt og grønt"],
    ["Kjøttdeig", "Kjøtt og fisk"],
    ["Grovbrød", "Brød og bakst"],
    ["Ris", "Tørrvarer"],
    ["Is", "Frys"],
    ["Toalettpapir", "Hus og hygiene"],
    ["Potetchips", "Snacks og drikke"],
  ])("%s → %s", (name, expected) => {
    expect(guessCategoryName(name)).toBe(expected);
  });

  it("hovedordet sist i sammensatte ord vinner", () => {
    expect(guessCategoryName("Basmatiris")).toBe("Tørrvarer");
    expect(guessCategoryName("Rødvin")).toBe("Snacks og drikke");
    expect(guessCategoryName("Kyllingpålegg")).toBe("Meieri");
  });

  it("svært korte nøkler må være hele ord", () => {
    expect(guessCategoryName("Kaffe og te")).toBe("Tørrvarer");
    expect(guessCategoryName("Tomater")).toBe("Frukt og grønt");
  });

  it("ukjente varer gir null", () => {
    expect(guessCategoryName("Bursdagslys")).toBeNull();
  });
});

describe("strengere treff", () => {
  it.each([
    ["Vannmelon", "Frukt og grønt"],
    ["Bæreposer", "Hus og hygiene"],
    ["Grandiosa", "Frys"],
    ["Pepsi Max", "Snacks og drikke"],
    ["Jarlsberg", "Meieri"],
    ["Servietter", "Hus og hygiene"],
    ["Avokadoer", "Frukt og grønt"],
    ["Tomater", "Frukt og grønt"],
    ["Epler", "Frukt og grønt"],
    ["Seigmenn", "Snacks og drikke"],
    ["Kvikk Lunsj", "Snacks og drikke"],
  ])("%s → %s", (name, expected) => {
    expect(guessCategoryName(name)).toBe(expected);
  });

  it("treffer ikke midt i ord", () => {
    expect(guessCategoryName("Kosttilskudd")).toBeNull();
    expect(guessCategoryName("Paris-kort")).toBeNull();
  });

  it("husker varer under en ryddet nøkkel", () => {
    expect(itemKey("  Pepsi   MAX ")).toBe("pepsi max");
  });
});
