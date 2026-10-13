import { after, NextResponse } from "next/server";
import { syncAll } from "@/lib/outlook/sync";

// Synken etter et varsel kjører i bakgrunnen etter at vi har svart Outlook.
export const maxDuration = 120;

/**
 * Varsler fra Microsoft Graph når noe endres i kalenderen.
 * - Ved oppsett sender Graph `?validationToken=…`, som vi må svare med som ren tekst innen 10 sek.
 * - Ellers sjekker vi clientState (hemmelig verdi vi ga ved oppsett) og kjører en delta-synk i bakgrunnen.
 */
export async function POST(req: Request) {
  const validationToken = new URL(req.url).searchParams.get("validationToken");
  if (validationToken) {
    return new NextResponse(validationToken, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  const body = (await req.json().catch(() => null)) as { value?: { clientState?: string }[] } | null;
  const expected = process.env.OUTLOOK_WEBHOOK_CLIENT_STATE;
  const valid = !!expected && (body?.value ?? []).some((n) => n.clientState === expected);
  if (valid) {
    after(async () => {
      await syncAll();
    });
  }
  // Graph forventer 202 raskt, også for varsler vi ignorerer.
  return new NextResponse(null, { status: 202 });
}
