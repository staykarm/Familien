/**
 * Tolker antall skrevet rett i varefeltet, så man slipper eget antall-felt:
 * «2 melk» → Melk / 2, «400 g kjøttdeig» → Kjøttdeig / 400 g, «melk x2» → Melk / 2, «brus 1,5 l» → Brus / 1,5 l.
 * Et tall bakerst uten enhet tolkes ikke («Omega 3» er et navn).
 */
const UNIT = "(?:stk|pk|pakke|pakker|g|gram|kg|hg|l|dl|cl|ml|boks|bokser|pose|poser|flaske|flasker|bunt|bunter)";
const NUMBER = "\\d+(?:[.,]\\d+)?";
const LEADING = new RegExp(`^(${NUMBER}\\s*(?:${UNIT}\\.?)?|${NUMBER}\\s*x)\\s+(.+)$`, "i");
const TRAILING = new RegExp(`^(.+?)\\s+(x\\s*${NUMBER}|${NUMBER}\\s*${UNIT}\\.?)$`, "i");

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase("nb") + s.slice(1);

export function parseItemText(text: string): { name: string; quantity: string | null } {
  const t = text.trim().replace(/\s+/g, " ");
  const lead = t.match(LEADING);
  if (lead && lead[2].length >= 2) return { name: capitalize(lead[2]), quantity: lead[1].replace(/\s*x$/i, "").trim() };
  const trail = t.match(TRAILING);
  if (trail && trail[1].length >= 2) return { name: capitalize(trail[1]), quantity: trail[2].replace(/^x\s*/i, "").trim() };
  return { name: capitalize(t), quantity: null };
}
