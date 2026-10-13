import { describe, expect, it } from "vitest";
import { checklistStats, docToPlainText, titleAndPreview, type DocNode } from "./text";

const doc: DocNode = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Pakkeliste hytta" }] },
    { type: "paragraph", content: [{ type: "text", text: "Husk " }, { type: "text", text: "nøkkel", marks: [] } as DocNode] },
    {
      type: "taskList",
      content: [
        { type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Sovepose" }] }] },
        { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "Ullundertøy" }] }] },
      ],
    },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Ved" }] }] }] },
    { type: "paragraph" },
  ],
};

describe("notattekst", () => {
  it("lager ren tekst med sjekkliste- og punktmerker", () => {
    expect(docToPlainText(doc)).toBe("Pakkeliste hytta\nHusk nøkkel\n☑ Sovepose\n☐ Ullundertøy\n• Ved");
  });

  it("første linje blir tittel, resten forhåndsvisning", () => {
    const { title, preview } = titleAndPreview(docToPlainText(doc));
    expect(title).toBe("Pakkeliste hytta");
    expect(preview).toBe("Husk nøkkel · Sovepose · Ullundertøy · Ved");
  });

  it("tom note gir tom tittel", () => {
    expect(titleAndPreview(docToPlainText({ type: "doc", content: [] }))).toEqual({ title: "", preview: "" });
  });

  it("teller sjekkliste", () => {
    expect(checklistStats(doc)).toEqual({ done: 1, total: 2 });
  });
});
