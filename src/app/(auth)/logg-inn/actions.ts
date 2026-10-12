"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safeRedirect";

export interface LoginState {
  step: "email" | "code";
  email?: string;
  error?: string;
  info?: string;
}

const emailSchema = z.email("Skriv inn en gyldig e-postadresse");

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/** Sender e-post med innloggingslenke og 6-sifret kode. Kun eksisterende brukere (ingen selvregistrering). */
export async function sendLoginCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { step: "email", error: parsed.error.issues[0].message };

  const next = safeNextPath(String(formData.get("neste") ?? "/"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${siteUrl()}/auth/callback?neste=${encodeURIComponent(next)}`,
    },
  });
  // Samme svar uansett om adressen finnes, slik at skjemaet ikke avslører hvem som har konto.
  if (error && error.status !== 400 && error.status !== 422) {
    return { step: "email", email: parsed.data, error: "Kunne ikke sende e-post akkurat nå. Prøv igjen om litt." };
  }
  return {
    step: "code",
    email: parsed.data,
    info: "Sjekk e-posten din. Trykk på lenken, eller skriv inn koden her.",
  };
}

export async function verifyLoginCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const token = String(formData.get("token") ?? "").replace(/\s/g, "");
  if (!/^\d{6,10}$/.test(token)) return { step: "code", email, error: "Koden består av sifre" };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { step: "code", email, error: "Feil eller utløpt kode. Be om en ny." };

  redirect(safeNextPath(String(formData.get("neste") ?? "/")));
}

export interface PasswordState {
  error?: string;
}

export async function passwordLogin(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const parsed = z
    .object({ email: emailSchema, password: z.string().min(1, "Skriv inn passordet") })
    .safeParse({ email: String(formData.get("email") ?? "").trim(), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Feil e-post eller passord" };

  redirect(safeNextPath(String(formData.get("neste") ?? "/")));
}
