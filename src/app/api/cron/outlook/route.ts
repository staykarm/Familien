import { NextResponse } from "next/server";
import { loadConnection } from "@/lib/outlook/connection";
import { ensureSubscription, syncAll } from "@/lib/outlook/sync";

export const maxDuration = 300;

/**
 * Daglig jobb (vercel.json): fornyer varslene fra Outlook og kjører en full synk som reserve,
 * i tilfelle et varsel har gått tapt. Vercel sender `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const conn = await loadConnection();
  if (!conn?.calendar_id) return NextResponse.json({ ok: true, message: "Outlook er ikke koblet til" });

  const subscriptionError = await ensureSubscription();
  const result = await syncAll();
  return NextResponse.json({ ...result, subscriptionError });
}
