/**
 * Læring for filtolkningen: hva familien faktisk gjør, oppsummert som korte linjer som legges i prompten.
 * - Vaner: hvordan aktiviteter i kalenderen pleier å tagges (hvem og kategori per tittel).
 * - Rettelser: forslag som ble endret før de ble lagt inn, eller avvist.
 * Rene funksjoner; hentingen fra databasen ligger i learningDb.ts.
 */

export interface TaggedItem {
  title: string;
  people: string[];
  category: string | null;
}

export const MAX_HABITS = 40;
export const MAX_CORRECTIONS = 25;

const normTitle = (t: string) => t.trim().replace(/\s+/g, " ").toLocaleLowerCase("nb");
const peopleKey = (p: string[]) => [...new Set(p)].sort((a, b) => a.localeCompare(b, "nb")).join(", ");

/**
 * «Fotballtrening → Edvard · Trening (12 ganger)». Gruppert på tittel; vanligste kombinasjon av personer og
 * kategori vinner. Bare titler som er brukt minst to ganger, de mest brukte først.
 */
export function habitLines(items: TaggedItem[], max = MAX_HABITS): string[] {
  const byTitle = new Map<string, { title: string; count: number; combos: Map<string, number> }>();
  for (const it of items) {
    if (!it.title.trim() || !it.people.length) continue;
    const key = normTitle(it.title);
    const entry = byTitle.get(key) ?? { title: it.title.trim(), count: 0, combos: new Map() };
    entry.count++;
    const combo = `${peopleKey(it.people)}|${it.category ?? ""}`;
    entry.combos.set(combo, (entry.combos.get(combo) ?? 0) + 1);
    byTitle.set(key, entry);
  }
  return [...byTitle.values()]
    .filter((e) => e.count >= 2)
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, "nb"))
    .slice(0, max)
    .map((e) => {
      const [best] = [...e.combos.entries()].sort((a, b) => b[1] - a[1]);
      const [people, category] = best[0].split("|");
      return `«${e.title}» → ${people}${category ? ` · ${category}` : ""} (${e.count} ganger)`;
    });
}

export interface Decision {
  kind: "event" | "task";
  status: "approved" | "rejected";
  suggested: TaggedItem;
  /** Slik det faktisk ble lagret (bare for godkjente). */
  saved?: TaggedItem | null;
}

/**
 * «Turdag: foreslått Felles · Annet, riktig Edvard · Skole» og «Avvist: «Generell beskjed»».
 * Bare beslutninger der noe ble endret. Like linjer slås sammen (en ukeplan gir ofte samme rettelse mange ganger).
 */
export function correctionLines(decisions: Decision[], max = MAX_CORRECTIONS): string[] {
  const lines: string[] = [];
  const add = (l: string) => {
    if (!lines.includes(l)) lines.push(l);
  };
  for (const d of decisions) {
    const what = d.kind === "event" ? "aktivitet" : "oppgave";
    if (d.status === "rejected") {
      add(`Avvist ${what}: «${d.suggested.title}»`);
      continue;
    }
    const s = d.saved;
    if (!s) continue;
    const changes: string[] = [];
    if (normTitle(s.title) !== normTitle(d.suggested.title)) changes.push(`tittel «${d.suggested.title}» → «${s.title}»`);
    if (peopleKey(s.people) !== peopleKey(d.suggested.people)) {
      changes.push(`${peopleKey(d.suggested.people) || "ingen"} → ${peopleKey(s.people) || "ingen"}`);
    }
    if (d.kind === "event" && (s.category ?? "") !== (d.suggested.category ?? "")) {
      changes.push(`kategori ${d.suggested.category ?? "ingen"} → ${s.category ?? "ingen"}`);
    }
    if (changes.length) add(`Rettet ${what} «${s.title}»: ${changes.join("; ")}`);
  }
  return lines.slice(0, max);
}

/** Avsnittet som legges i systemprompten. Tomt hvis det ikke er noe å lære av ennå. */
export function learningPrompt(habits: string[], corrections: string[]): string {
  if (!habits.length && !corrections.length) return "";
  const parts = ["Lær av hvordan familien selv gjør det (dette veier tyngre enn gjetning):"];
  if (habits.length) parts.push(`Slik pleier aktiviteter å tagges i kalenderen:\n${habits.map((h) => `- ${h}`).join("\n")}`);
  if (corrections.length) {
    parts.push(`Rettelser familien har gjort på tidligere forslag (gjør det riktig fra start neste gang):\n${corrections.map((c) => `- ${c}`).join("\n")}`);
  }
  return parts.join("\n\n");
}
