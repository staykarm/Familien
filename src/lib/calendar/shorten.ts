/**
 * Smart forkorting av aktivitetstitler når det er lite plass (f.eks. tre aktiviteter side om side).
 * Vi lager tre varianter, og CSS (container queries) viser den som passer bredden – uten å måle i JS.
 *
 * - full:   tittelen som den er
 * - medium: uten tillegg i parentes og etter tankestrek/kolon («Fotball (bortekamp)» → «Fotball»)
 * - short:  som medium, uten småord, og lange ord forkortet («Foreldremøte på skolen» → «Foreldrem. skolen»)
 * - tiny:   for de aller smaleste boksene: de to første ordene i short («Foreldrem. skolen»). Ord kuttes ikke
 *           videre – det som ikke får plass brytes over flere linjer.
 *
 * Etter punktum inne i en forkortelse settes et usynlig bryte-punkt, så «Fotb.tren.» brytes som «Fotb.» / «tren.»
 * i stedet for midt i et ord.
 */
const ZWSP = "\u200b";
const breakAfterDots = (s: string) => s.replace(/\.(?=\S)/g, `.${ZWSP}`);

const SMALL_WORDS = new Set(["på", "i", "med", "og", "til", "hos", "for", "av", "fra", "om", "en", "et", "the", "at"]);
const MAX_WORD = 9;

/** Kjente lange ord med naturlige forkortelser. Sjekkes før den generelle regelen. */
const KNOWN: Record<string, string> = {
  trening: "tren.",
  treningen: "tren.",
  fotballtrening: "fotb.tren.",
  håndballtrening: "håndb.tren.",
  svømmetrening: "svøm.tren.",
  foreldremøte: "foreldrem.",
  bursdagsselskap: "bursdag",
  bursdagsfeiring: "bursdag",
  tannlegetime: "tannlege",
  legetime: "lege",
  avslutning: "avsl.",
  sommeravslutning: "sommeravsl.",
  juleavslutning: "juleavsl.",
  konfirmasjon: "konf.",
  barnehage: "bhg.",
  barnehagen: "bhg.",
  skolestart: "skolestart",
};

function keepCase(original: string, short: string): string {
  return original[0] === original[0]?.toLocaleUpperCase("nb") ? short[0].toLocaleUpperCase("nb") + short.slice(1) : short;
}

function shortenWord(word: string): string {
  const bare = word.replace(/[.,!?]+$/, "");
  const known = KNOWN[bare.toLocaleLowerCase("nb")];
  if (known) return keepCase(bare, known);
  if (bare.length <= MAX_WORD) return bare;
  return `${bare.slice(0, MAX_WORD - 1)}.`;
}

export function mediumTitle(title: string): string {
  let t = title.replace(/\s*[([][^)\]]*[)\]]/g, " ").replace(/\s+/g, " ").trim();
  // «Fotball – kamp mot Lyn» / «Møte: budsjett» → første del, hvis den er lang nok til å si noe.
  const head = t.split(/\s+[–—-]\s+|:\s+/)[0]?.trim();
  if (head && head.length >= 3 && head.length < t.length) t = head;
  return t || title.trim();
}

export function shortTitle(title: string): string {
  const words = mediumTitle(title).split(" ");
  const kept = words.filter((w, i) => i === 0 || !SMALL_WORDS.has(w.toLocaleLowerCase("nb")));
  return kept.map(shortenWord).join(" ");
}

export function tinyTitle(title: string): string {
  return shortTitle(title).split(" ").slice(0, 2).join(" ");
}

/** Bare det første ordet – for bokser med plass til én linje (f.eks. 30 minutter). */
export function oneWordTitle(title: string): string {
  return shortTitle(title).split(" ")[0] ?? title;
}

export function titleVariants(title: string): { full: string; medium: string; short: string; tiny: string; one: string } {
  const full = title.trim();
  return {
    full,
    medium: mediumTitle(full),
    short: breakAfterDots(shortTitle(full)),
    tiny: breakAfterDots(tinyTitle(full)),
    one: breakAfterDots(oneWordTitle(full)),
  };
}
