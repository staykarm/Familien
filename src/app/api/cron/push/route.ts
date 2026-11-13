import { NextResponse } from "next/server";
import { runHouseSchedule } from "@/lib/huset/public";
import { runPushJobs } from "@/lib/push/jobs";

export const maxDuration = 60;

/**
 * Pushvarsler på tid: påminnelser, henting og morgenoversikten. Utfører også planlagte handlinger i Huset.
 * Kalles hvert 5. minutt fra Supabase (pg_cron, se README) og én gang om morgenen fra Vercel som reserve.
 * Krever `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    // Huset først: en plan «kl. 10» skal ikke vente på varslene. Feil der stopper ikke varslene.
    const house = await runHouseSchedule().catch((err) => {
      console.error("Planlagte handlinger i Huset feilet", err);
      return 0;
    });
    return NextResponse.json({ ok: true, house, ...(await runPushJobs()) });
  } catch (err) {
    console.error("Pushjobben feilet", err);
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : "Ukjent feil" }, { status: 500 });
  }
}
