import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { buttonSecondary, card } from "@/components/ui/styles";
import { AUTH_ENABLED } from "@/lib/env";
import { WeatherLocationForm } from "@/components/weather/WeatherLocationForm";
import { requireFamily } from "@/lib/session";
import { getWeatherLocation } from "@/lib/weather/service";
import { OdaSettings } from "@/components/settings/OdaSettings";
import { odaStatus } from "@/lib/oda/session";
import { OutlookSettings } from "@/components/settings/OutlookSettings";
import { getOutlookStatus } from "@/actions/outlook";
import { listPushDevices } from "@/actions/push";
import { PushSettings } from "@/components/settings/PushSettings";
import { loadFamilyUi } from "@/lib/familyUi";
import { loadPushSettings, pushPublicKey } from "@/lib/push/send";

export const metadata = { title: "Innstillinger – Familien" };
// Første synk med Outlook kjører i bakgrunnen etter at kalenderen er valgt, og kan ta litt tid.
export const maxDuration = 300;

export default async function SettingsPage({ searchParams }: PageProps<"/innstillinger">) {
  const session = await requireFamily();
  const [weatherLocation, oda, outlook, params, publicKey, pushSettings, devices, { members }] = await Promise.all([
    getWeatherLocation(),
    odaStatus(),
    getOutlookStatus(),
    searchParams,
    pushPublicKey(),
    loadPushSettings(),
    listPushDevices(),
    loadFamilyUi(session),
  ]);
  const outlookReturn = typeof params.outlook === "string" ? params.outlook : null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-bold sm:text-2xl lg:text-3xl">Innstillinger</h1>

      <section className={`${card} flex flex-col gap-3`}>
        <h2 className="font-display text-lg font-bold">Konto</h2>
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

      <section id="varsler" className={`${card} flex flex-col gap-3`}>
        <h2 className="font-display text-lg font-bold">🔔 Varsler</h2>
        <PushSettings
          publicKey={publicKey}
          settings={pushSettings}
          members={members}
          devices={devices}
          activeMemberId={session.activeMember?.id ?? null}
        />
      </section>

      <section className={`${card} flex flex-col gap-3`}>
        <h2 className="font-display text-lg font-bold">Sted for værvarsel</h2>
        <WeatherLocationForm current={weatherLocation} />
      </section>

      <section id="oda" className={`${card} flex flex-col gap-3`}>
        <h2 className="font-display text-lg font-bold">🛒 Oda</h2>
        <OdaSettings initial={oda} />
      </section>

      <section id="outlook" className={`${card} flex flex-col gap-3`}>
        <h2 className="font-display text-lg font-bold">📅 Outlook-kalender</h2>
        <OutlookSettings initial={outlook} returnStatus={outlookReturn} />
      </section>
    </div>
  );
}
