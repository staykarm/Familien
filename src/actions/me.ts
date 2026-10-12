"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ACTIVE_MEMBER_COOKIE, requireFamily } from "@/lib/session";

/** «Hvem er jeg?» – lagres i en cookie per enhet, slik at det delte nettbrettet kan bytte person. */
export async function chooseActiveMember(formData: FormData) {
  const session = await requireFamily();
  const id = z.uuid().safeParse(formData.get("memberId"));
  if (!id.success || !session.members.some((m) => m.id === id.data && !m.is_shared)) {
    redirect("/hvem-er-jeg");
  }
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_MEMBER_COOKIE, id.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/");
}
