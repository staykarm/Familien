import { NextResponse } from "next/server";
import { AUTH_ENABLED } from "@/lib/env";
import { isUnlocked } from "@/lib/lock/state";

/**
 * Er enheten fortsatt låst opp? Appen spør når den kommer fram igjen og når lagring feiler, så den kan sende
 * til kodeskjermen i stedet for å prøve å lagre i det uendelige (opplåsingen varer 12 timer som standard).
 * Svarer bare ja/nei, aldri noe om familien.
 */
export async function GET() {
  const unlocked = AUTH_ENABLED ? true : await isUnlocked();
  return NextResponse.json({ unlocked }, { headers: { "Cache-Control": "no-store" } });
}
