// Er en beskjed i «Si det» en husbeskjed («skru av lyset i stua») eller noe til kalender, oppgaver og handleliste?
// Ordlisten avgjør de tydelige tilfellene; når den er usikker, spør vi Claude (actions/huset.ts → classifyVoiceText).

export type VoiceTarget = "house" | "family" | "unsure";

const HOUSE: RegExp[] = [
  /\b(skru|slå|sett)\s+(av|på|opp|ned)\b/,
  /\bdim+(e|me|t|mer)?\b/,
  /\b(lys|lyset|lysene|lampa|lampen|lampene|taklys|utelys\w*)\b/,
  /\b(musikk|musikken|sang|sangen|spilleliste\w*|radio|radioen|nrk\s?p\d|volum|volumet|sonos|spotify|neste sang|forrige sang)\b/,
  /^spill\b|\bspill\b.*\bpå\b/,
  /\b(varme|varmen|varmere|kaldere|grader|temperatur\w*)\b/,
  /\b(persienne\w*|rullegardin\w*|gardin\w*)\b/,
  /\b(støvsug\w*|robot\w*|gressklipp\w*|klipperen|klipp plenen)\b/,
];

const FAMILY: RegExp[] = [
  /\b(kalender\w*|avtale\w*|møte\w*|tannlege\w*|lege\w*|frisør\w*|bursdag\w*|trening\w*|fotball\w*|barnehage\w*|skole\w*)\b/,
  /\b(handle\w*|kjøp\w*|handleliste\w*|oppgave\w*|husk\w*|må vi)\b/,
  /\b(klokka|kl\.?\s?\d|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|i morgen|i overmorgen|neste uke|levere\w*|hente\w*)\b/,
];

/** Tydelig husbeskjed, tydelig familiebeskjed, eller usikker (begge deler, eller ingen av delene). */
export function classifyVoiceText(text: string): VoiceTarget {
  const t = text.toLowerCase().replace(/\s+/g, " ").trim();
  const house = HOUSE.some((r) => r.test(t));
  const family = FAMILY.some((r) => r.test(t));
  if (house && !family) return "house";
  if (family && !house) return "family";
  return "unsure";
}
