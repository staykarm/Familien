/** Minimal form av et Tiptap/ProseMirror-dokument – nok til å hente ut tekst. */
export interface DocNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
}

const BLOCKS = new Set(["paragraph", "heading", "listItem", "taskItem", "codeBlock", "blockquote"]);

/** Ren tekst, én linje per avsnitt/listepunkt. Sjekklistepunkter får ☐/☑ foran. */
export function docToPlainText(doc: DocNode | null | undefined): string {
  const lines: string[] = [];
  const walk = (node: DocNode, prefix = "") => {
    if (node.type === "taskItem") {
      const mark = node.attrs?.checked ? "☑ " : "☐ ";
      // Første avsnitt i punktet hører på samme linje som avkrysningen.
      const [first, ...rest] = node.content ?? [];
      if (first) lines.push(mark + inlineText(first));
      rest.forEach((c) => walk(c, prefix));
      return;
    }
    if (node.type && BLOCKS.has(node.type) && node.type !== "listItem") {
      lines.push(prefix + inlineText(node));
      return;
    }
    if (node.type === "listItem") {
      const [first, ...rest] = node.content ?? [];
      if (first) lines.push("• " + inlineText(first));
      rest.forEach((c) => walk(c, prefix));
      return;
    }
    node.content?.forEach((c) => walk(c, prefix));
  };
  if (doc) walk(doc);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function inlineText(node: DocNode): string {
  if (node.text) return node.text;
  if (node.type === "hardBreak") return " ";
  return (node.content ?? []).map(inlineText).join("");
}

/** Tittel = første ikke-tomme linje (uten avkrysningstegn), forhåndsvisning = resten. Som i iOS Notater. */
export function titleAndPreview(plain: string): { title: string; preview: string } {
  const lines = plain
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const clean = (l: string) => l.replace(/^[☐☑•]\s*/, "");
  return {
    title: lines[0] ? clean(lines[0]).slice(0, 120) : "",
    preview: lines.slice(1).map(clean).join(" · ").slice(0, 160),
  };
}

/** Antall avkryssede og totalt i sjekklister. */
export function checklistStats(doc: DocNode | null | undefined): { done: number; total: number } {
  let done = 0;
  let total = 0;
  const walk = (n: DocNode) => {
    if (n.type === "taskItem") {
      total++;
      if (n.attrs?.checked) done++;
    }
    n.content?.forEach(walk);
  };
  if (doc) walk(doc);
  return { done, total };
}
