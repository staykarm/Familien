import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export const ACTIVE_MEMBER_COOKIE = "familien_meg";

export type Member = Tables<"members">;

export interface FamilySession {
  userId: string;
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
  const cookieStore = await cookies();
  const chosenId = cookieStore.get(ACTIVE_MEMBER_COOKIE)?.value ?? appUser.member_id;
  const activeMember = memberList.find((m) => m.id === chosenId && !m.is_shared) ?? null;

  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    role: appUser.role,
    displayName: appUser.display_name,
    activeMember,
    members: memberList,
  };
});
