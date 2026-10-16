import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AUTH_ENABLED } from "@/lib/env";
import { getLockState, isUnlocked } from "@/lib/lock/state";
import { safeNextPath } from "@/lib/safeRedirect";
import { appIconElement } from "@/lib/appIcon";
import { LockScreen } from "@/components/lock/LockScreen";

export const metadata = { title: "Lås opp – Familien" };

export default async function LockPage({ searchParams }: PageProps<"/las">) {
  await connection();
  const params = await searchParams;
  const next = safeNextPath(typeof params.neste === "string" ? params.neste : "/");
  if (AUTH_ENABLED) redirect(next);
  const state = await getLockState();
  if (await isUnlocked(state)) redirect(next);

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-2">
        <div className="h-20 w-20 overflow-hidden rounded-3xl">{appIconElement(80)}</div>
        <h1 className="font-display text-xl font-bold text-primary-dark sm:text-2xl lg:text-3xl">Familien</h1>
        <LockScreen pinLength={state.pinLength} next={next} />
      </div>
    </main>
  );
}
