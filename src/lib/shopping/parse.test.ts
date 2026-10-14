import { describe, expect, it } from "vitest";
import { parseItemText } from "./parse";

describe("antall skrevet i varefeltet", () => {
  it.each([
    ["2 melk", "Melk", "2"],
    ["400 g kjøttdeig", "Kjøttdeig", "400 g"],
    ["melk x2", "Melk", "2"],
    ["3x brus", "Brus", "3"],
    ["brus 1,5 l", "Brus", "1,5 l"],
    ["egg 12 stk", "Egg", "12 stk"],
    ["Omega 3", "Omega 3", null],
    ["bananer", "Bananer", null],
    ["  7   epler ", "Epler", "7"],
  ])("«%s» → %s / %s", (text, name, quantity) => {
    expect(parseItemText(text)).toEqual({ name, quantity });
  });
});
