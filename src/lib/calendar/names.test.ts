import { describe, expect, it } from "vitest";
import { membersInTitle } from "./names";

const members = [
  { id: "e", name: "Edvard" },
  { id: "o", name: "Olav" },
  { id: "f", name: "Felles", isShared: true },
];

describe("membersInTitle", () => {
  it("finner navn som hele ord, også med genitiv-s", () => {
    expect(membersInTitle("Trening Olav", members)).toEqual(["o"]);
    expect(membersInTitle("olavs bursdag", members)).toEqual(["o"]);
    expect(membersInTitle("Fotball Edvard og Olav", members)).toEqual(["e", "o"]);
  });

  it("ignorerer deler av ord og Felles", () => {
    expect(membersInTitle("Olavsfestdagene", members)).toEqual([]);
    expect(membersInTitle("Felles middag", members)).toEqual([]);
  });
});
