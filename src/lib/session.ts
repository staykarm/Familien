import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AUTH_ENABLED } from "@/lib/env";
import { isUnlocked } from "@/lib/lock/state";
import { LOCK_PATH } from "@/lib/lock/token";
import { getDb } from "@/lib/supabase/db";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export const ACTIVE_MEMBER_COOKIE = "familien_meg";

export type Member = Tables<"members">;

export interface FamilySession {
  /** Null når innlogging er av. */
  userId: string | null;
  email: string | null;
  role: "adult" | "shared";
  displayName: string | null;
  /** Medlemmet som bruker appen akkurat nå («Hvem er jeg?»). Null hvis ikke valgt ennå. */
  activeMember: Member | null;
  members: Member[];
}

/**
 * Henter innlogget bruker, rollen i familien og hvem som er valgt som aktiv.
 * Sender til innlogging hvis ikke innlogget, og til /ingen-tilgang hvis brukeren ikke står i app_users.
 * Bufret per request slik at layout og side kan kalle den begge.
 */
export const requireFamily = cache(async (): Promise<FamilySession> => {
  // Familiedata er alltid ferske: aldri forhåndsbygg disse sidene ved deploy.
  await connection();
  if (!AUTH_ENABLED) {
    // Uten innlogging er appen låst med en felles kode (eller Face ID). Proxy-en sjekker signaturen,
    // her sjekkes også at koden ikke er endret siden enheten ble låst opp.
    if (!(await isUnlocked())) redirect(LOCK_PATH);
    return openSession();
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) redirect("/logg-inn");

  const [{ data: appUser }, { data: members }] = await Promise.all([
    supabase.from("app_users").select("*").eq("user_id", claims.sub).maybeSingle(),
    supabase.from("members").select("*").order("sort_order"),
  ]);
  if (!appUser) redirect("/ingen-tilgang");

  const memberList = members ?? [];
  const activeMember = await pickActiveMember(memberList, appUser.member_id);

  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    role: appUser.role,
    displayName: appUser.display_name,
    activeMember,
    members: memberList,
  };
});

async function pickActiveMember(members: Member[], fallbackId: string | null): Promise<Member | null> {
  const cookieStore = await cookies();
  const chosenId = cookieStore.get(ACTIVE_MEMBER_COOKIE)?.value ?? fallbackId;
  return members.find((m) => m.id === chosenId && !m.is_shared) ?? null;
}

/** Uten innlogging: alle er «familien», og hvem som bruker appen velges med «Hvem er jeg?». */
async function openSession(): Promise<FamilySession> {
  const supabase = await getDb();
  const { data: members } = await supabase.from("members").select("*").order("sort_order");
  const memberList = members ?? [];
  return {
    userId: null,
    email: null,
    role: "shared",
    displayName: null,
    activeMember: await pickActiveMember(memberList, null),
    members: memberList,
  };
}
