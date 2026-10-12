/** Godtar bare interne stier («/oppgaver»), aldri «//evil.com» eller fulle URL-er. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
