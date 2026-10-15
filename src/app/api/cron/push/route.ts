import { NextResponse } from "next/server";
import { runPushJobs } from "@/lib/push/jobs";

export const maxDuration = 60;

/**
 * Pushvarsler på tid: påminnelser, henting og morgenoversikten.
 * Kalles hvert 5. minutt fra Supabase (pg_cron, se README) og én gang om morgenen fra Vercel som reserve.
 * Krever `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await runPushJobs()) });
  } catch (err) {
    console.error("Pushjobben feilet", err);
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : "Ukjent feil" }, { status: 500 });
  }
}
