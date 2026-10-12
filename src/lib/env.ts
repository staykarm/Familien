// Offentlige variabler må refereres bokstavelig (process.env.NEXT_PUBLIC_…) for at Next skal bake dem inn i klientkoden.

/**
 * Innlogging er av inntil videre: appen åpnes rett inn, og serveren bruker service role-nøkkelen.
 * Sett AUTH_ENABLED=true (og redeploy) for å kreve innlogging og la RLS gjelde per bruker.
 */
export const AUTH_ENABLED = process.env.AUTH_ENABLED === "true";

// Vercel sin Supabase-integrasjon legger inn de eldre navnene (ANON_KEY / SERVICE_ROLE_KEY),
// så begge variantene godtas.
export function publicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Mangler NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (eller _ANON_KEY). Se .env.example.");
  }
  return { url, key };
}

/** Service role-nøkkelen. Kun server. */
export function supabaseSecretKey(): string {
  return process.env.SUPABASE_SECRET_KEY ?? serverEnv("SUPABASE_SERVICE_ROLE_KEY");
}

/** Kun på serveren. Kaster hvis variabelen mangler, slik at feil oppdages tidlig. */
export function serverEnv(name: string): string {
  if (typeof window !== "undefined") throw new Error(`${name} kan bare leses på serveren`);
  const value = process.env[name];
  if (!value) throw new Error(`Mangler miljøvariabelen ${name}. Se .env.example.`);
  return value;
}
