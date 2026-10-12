import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { buttonSecondary, card } from "@/components/ui/styles";
import { AUTH_ENABLED } from "@/lib/env";
import { requireFamily } from "@/lib/session";

export const metadata = { title: "Innstillinger – Familien" };

export default async function SettingsPage() {
  const session = await requireFamily();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-4xl font-bold">Innstillinger</h1>

      <section className={`${card} flex flex-col gap-3`}>
        <h2 className="font-display text-xl font-bold">Konto</h2>
        {AUTH_ENABLED ? (
          <p className="text-ink-light">
            Innlogget som <strong className="text-ink">{session.displayName ?? session.email}</strong>
            {session.role === "shared" ? " (familiebruker)" : ""}
          </p>
        ) : (
          <p className="text-ink-light">Innlogging er slått av – alle med lenken kan bruke appen.</p>
        )}
        <p className="text-ink-light">
          Bruker appen nå: <strong className="text-ink">{session.activeMember?.name ?? "ikke valgt"}</strong>
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/hvem-er-jeg" className={buttonSecondary}>
            Bytt person
          </Link>
          {AUTH_ENABLED && <LogoutButton />}
        </div>
      </section>

      <section className={`${card} flex flex-col gap-2`}>
        <h2 className="font-display text-xl font-bold">Kommer senere</h2>
        <p className="text-ink-light">Kobling til Outlook-kalenderen og sted for værvarsel.</p>
      </section>
    </div>
  );
}
