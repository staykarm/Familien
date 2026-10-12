// Offentlige variabler må refereres bokstavelig (process.env.NEXT_PUBLIC_…) for at Next skal bake dem inn i klientkoden.

export function publicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Mangler NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Se .env.example.");
  }
  return { url, key };
}

/** Kun på serveren. Kaster hvis variabelen mangler, slik at feil oppdages tidlig. */
export function serverEnv(name: string): string {
  if (typeof window !== "undefined") throw new Error(`${name} kan bare leses på serveren`);
  const value = process.env[name];
  if (!value) throw new Error(`Mangler miljøvariabelen ${name}. Se .env.example.`);
  return value;
}
