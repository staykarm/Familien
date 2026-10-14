/**
 * Smart forkorting av aktivitetstitler når det er lite plass (f.eks. tre aktiviteter side om side).
 * Vi lager tre varianter, og CSS (container queries) viser den som passer bredden – uten å måle i JS.
 *
 * - full:   tittelen som den er
 * - medium: uten tillegg i parentes og etter tankestrek/kolon («Fotball (bortekamp)» → «Fotball»)
 * - short:  som medium, men lange ord (over 9 tegn) forkortet («Foreldremøte på skolen» → «Foreldrem. på skolen»).
 *           Ingen ord fjernes – «Ha med dag» skal ikke bli «Ha dag». Korte titler er uendret.
 * - tiny/one: samme som short. Det som ikke får plass brytes over flere linjer (og en lav boks viser de første).
 *
 * Etter punktum inne i en forkortelse settes et usynlig bryte-punkt, så «Fotb.tren.» brytes som «Fotb.» / «tren.»
 * i stedet for midt i et ord.
 */
const ZWSP = "\u200b";
const breakAfterDots = (s: string) => s.replace(/\.(?=\S)/g, `.${ZWSP}`);

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

/** Bare lange ord forkortes; korte ord («Trening», «Middag») står som de er. */
function shortenWord(word: string): string {
  const bare = word.replace(/[.,!?]+$/, "");
  if (bare.length <= MAX_WORD) return word;
  const known = KNOWN[bare.toLocaleLowerCase("nb")];
  if (known) return keepCase(bare, known);
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
  return mediumTitle(title).split(" ").map(shortenWord).join(" ");
}

/** De smaleste boksene: samme som short – ord fjernes aldri, teksten brytes heller. */
export function tinyTitle(title: string): string {
  return shortTitle(title);
}

/** Bokser med plass til én linje: samme som short; boksen viser de første ordene. */
export function oneWordTitle(title: string): string {
  return shortTitle(title);
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
