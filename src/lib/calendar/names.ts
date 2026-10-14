/**
 * Finner familiemedlemmer som er nevnt med navn i en tittel, f.eks. «Trening Olav» eller «Olavs bursdag».
 * Bare hele ord teller (også med genitiv-s, «Olavs»), og store/små bokstaver er likegyldig.
 * Felles regnes ikke med. Rekkefølgen følger `members`.
 */
export function membersInTitle(title: string, members: { id: string; name: string; isShared?: boolean }[]): string[] {
  const ids: string[] = [];
  for (const m of members) {
    if (m.isShared || !m.name.trim()) continue;
    const escaped = m.name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?<![\\p{L}\\p{N}])${escaped}s?(?![\\p{L}\\p{N}])`, "iu").test(title)) ids.push(m.id);
  }
  return ids;
}
