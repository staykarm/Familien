import { describe, expect, it } from "vitest";
import { checkedItems, groupOpenItems } from "./group";
import type { ShoppingItem } from "./types";

const cats = [
  { id: "frukt", name: "Frukt og grønt", icon: "🥕", color: "#4fb071" },
  { id: "meieri", name: "Meieri", icon: "🥛", color: "#4f97d9" },
];

let n = 0;
const item = (p: Partial<ShoppingItem>): ShoppingItem => ({
  id: String(++n),
  name: "Vare",
  quantity: null,
  categoryId: null,
  checked: false,
  checkedAt: null,
  addedBy: null,
  createdAt: `2026-10-13T10:00:0${n}Z`,
  ...p,
});

describe("groupOpenItems", () => {
  it("følger kategoriens rekkefølge og legger ukjente sist", () => {
    const groups = groupOpenItems(
      [item({ name: "Melk", categoryId: "meieri" }), item({ name: "Lys" }), item({ name: "Epler", categoryId: "frukt" }), item({ name: "Ost", categoryId: "meieri", checked: true })],
      cats
    );
    expect(groups.map((g) => g.category?.id ?? null)).toEqual(["frukt", "meieri", null]);
    expect(groups[1].items.map((i) => i.name)).toEqual(["Melk"]);
  });

  it("ukjente varer havner i «Annet» sammen med varene der", () => {
    const withOther = [...cats, { id: "annet", name: "Annet", icon: "📦", color: "#a39e93" }];
    const groups = groupOpenItems([item({ name: "Lys" }), item({ name: "Gave", categoryId: "annet" })], withOther);
    expect(groups.map((g) => g.category?.id)).toEqual(["annet"]);
    expect(groups[0].items.map((i) => i.name)).toEqual(["Lys", "Gave"]);
  });
});

describe("checkedItems", () => {
  it("sist avhuket først", () => {
    const list = checkedItems([
      item({ name: "A", checked: true, checkedAt: "2026-10-13T10:00:00Z" }),
      item({ name: "B", checked: true, checkedAt: "2026-10-13T11:00:00Z" }),
      item({ name: "C" }),
    ]);
    expect(list.map((i) => i.name)).toEqual(["B", "A"]);
  });
});

describe("moveInList", () => {
  it("flytter opp og ned, men ikke ut av listen", async () => {
    const { moveInList } = await import("./group");
    expect(moveInList(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveInList(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveInList(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });
});
